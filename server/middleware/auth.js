const jwt = require('jsonwebtoken');
const env = require('../config/env');
const User = require('../models/User');
const Branch = require('../models/Branch');
const { unauthorized, forbidden } = require('../lib/http');
const { today } = require('../lib/dates');

// ---------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------
// After a successful login the server gives the app a signed "JWT" token.
// The app sends it back on every request in the header:
//     Authorization: Bearer <token>
// Because it is signed with JWT_SECRET, nobody can edit or forge it.

function signSessionToken(user, extra = {}) {
  const hours = env.sessionHours[user.role] || 1;
  return {
    token: jwt.sign({ sub: String(user._id), role: user.role, ...extra }, env.jwtSecret, { expiresIn: `${hours}h` }),
    expiresAt: Date.now() + hours * 3600 * 1000,
  };
}

// A very short-lived token that can be put in a URL, used only to open PDF
// downloads in the phone's browser (which can't send our Authorization header).
function signDownloadToken(user) {
  return jwt.sign({ sub: String(user.id), role: user.role, purpose: 'download' }, env.jwtSecret, { expiresIn: '2m' });
}

// ---------------------------------------------------------------------------
// Branch cache — branch names rarely change, so avoid a DB lookup per request.
// ---------------------------------------------------------------------------
let branchCache = { at: 0, list: [] };
async function getBranches() {
  if (Date.now() - branchCache.at > 60_000) {
    branchCache = { at: Date.now(), list: await Branch.find({ isActive: true }).sort({ code: 1 }).lean() };
  }
  return branchCache.list;
}
const clearBranchCache = () => (branchCache.at = 0);

// ---------------------------------------------------------------------------
// authenticate: runs before every protected route
// ---------------------------------------------------------------------------
async function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const bearer = header.startsWith('Bearer ') ? header.slice(7) : null;
  const download = req.method === 'GET' ? req.query.dl : null;
  if (!bearer && !download) throw unauthorized('Please log in.');

  let payload;
  try {
    payload = jwt.verify(bearer || download, env.jwtSecret);
  } catch (err) {
    throw unauthorized(
      err.name === 'TokenExpiredError' ? 'Your session has ended. Please log in again.' : 'Please log in again.',
      err.name === 'TokenExpiredError' ? 'SESSION_EXPIRED' : 'UNAUTHORIZED'
    );
  }
  if (!bearer && payload.purpose !== 'download') throw unauthorized();
  if (bearer && payload.purpose === 'download') throw unauthorized();

  const user = await User.findById(payload.sub);
  if (!user) throw unauthorized('Account not found. Please log in again.');

  // --- Manager: locked to one branch and one approved device ---------------
  if (user.role === 'manager' && bearer) {
    const deviceId = String(req.headers['x-device-id'] || '');
    const blocked = user.blockedDevices.some((d) => d.deviceId === deviceId);
    const approved = user.approvedDevice && user.approvedDevice.deviceId === deviceId;
    if (blocked || !approved || payload.dev !== deviceId) {
      throw forbidden('This device is no longer approved for the shop. Ask the owner.', 'DEVICE_NOT_APPROVED');
    }
    // Remember "last seen", but at most once every 5 minutes to save DB writes.
    const last = user.approvedDevice.lastActiveAt;
    if (!last || Date.now() - last.getTime() > 5 * 60_000) {
      User.updateOne({ _id: user._id }, { 'approvedDevice.lastActiveAt': new Date() }).catch(() => {});
    }
  }

  // --- Work out which branch this request is about -------------------------
  const branches = await getBranches();
  let branch = null;
  if (user.role === 'manager') {
    branch = branches.find((b) => String(b._id) === String(user.branchId)) || null;
    if (!branch) throw forbidden('Your branch is not active. Ask the owner.');
    req.branchId = branch._id;
  } else {
    const wanted = String(req.headers['x-branch-id'] || req.query.branchId || '');
    if (wanted === 'all') {
      req.branchId = 'all';
    } else {
      branch = branches.find((b) => String(b._id) === wanted) || branches[0] || null;
      req.branchId = branch ? branch._id : null;
    }
  }
  req.branch = branch;
  req.branchName = branch ? branch.name : req.branchId === 'all' ? 'All Branches' : '';
  req.branches = branches;

  req.user = {
    id: user._id,
    name: user.name,
    role: user.role,
    phone: payload.phone || '',
    doc: user, // full mongoose document, for routes that need to update the user
  };
  next();
}

// ---------------------------------------------------------------------------
// Permission helpers
// ---------------------------------------------------------------------------
const requireOwner = (req, res, next) => {
  if (req.user.role !== 'owner') throw forbidden('Only the owner can do that.');
  next();
};

/** Most screens work on one branch; reject the owner's "All branches" view. */
const requireSingleBranch = (req, res, next) => {
  if (!req.branchId || req.branchId === 'all') throw forbidden('Pick a branch first.');
  next();
};

/** Managers may only change TODAY's records. The owner can change any day. */
const canEditDate = (user, date) => user.role === 'owner' || date === today();

module.exports = {
  authenticate,
  requireOwner,
  requireSingleBranch,
  canEditDate,
  signSessionToken,
  signDownloadToken,
  getBranches,
  clearBranchCache,
};
