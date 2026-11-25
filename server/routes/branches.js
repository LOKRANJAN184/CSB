const express = require('express');
const Branch = require('../models/Branch');
const User = require('../models/User');
const { authenticate, requireOwner, clearBranchCache } = require('../middleware/auth');
const { badRequest, notFound, str } = require('../lib/http');
const { logAudit } = require('../services/audit');

const router = express.Router();

const publicBranch = (b) => ({ id: b._id, name: b.name, code: b.code, address: b.address, phone: b.phone, isActive: b.isActive });

// GET /api/branches — public list for the login screen
router.get('/', async (req, res) => {
  const branches = await Branch.find({ isActive: true }).sort({ code: 1 }).lean();
  res.json({ ok: true, branches: branches.map(publicBranch) });
});

// GET /api/branches/manage — owner: every branch with its manager + device status
router.get('/manage', authenticate, requireOwner, async (req, res) => {
  const [branches, managers] = await Promise.all([
    Branch.find({}).sort({ code: 1 }).lean(),
    User.find({ role: 'manager' }).lean(),
  ]);
  res.json({
    ok: true,
    branches: branches.map((b) => {
      const m = managers.find((x) => String(x.branchId) === String(b._id));
      return {
        ...publicBranch(b),
        manager: m && {
          id: m._id,
          name: m.name,
          approvedDevice: m.approvedDevice?.deviceId ? m.approvedDevice : null,
          pendingDevice: m.pendingDevice?.status === 'pending' && m.pendingDevice.deviceId ? m.pendingDevice : null,
          blockedDevices: m.blockedDevices || [],
          lockedUntil: m.lockedUntil && m.lockedUntil > new Date() ? m.lockedUntil : null,
        },
      };
    }),
  });
});

const readBranchBody = (body) => ({
  name: str(body.name, 80),
  code: str(body.code, 20).toUpperCase().replace(/[^A-Z0-9_]/g, ''),
  address: str(body.address, 200),
  phone: str(body.phone, 20),
});

// POST /api/branches — owner: create
router.post('/', authenticate, requireOwner, async (req, res) => {
  const data = readBranchBody(req.body);
  if (!data.name) throw badRequest('Branch name is required.');
  if (!data.code) data.code = data.name.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);
  if (await Branch.exists({ code: data.code })) throw badRequest(`Branch code "${data.code}" is already used.`);

  const branch = await Branch.create(data);
  clearBranchCache();
  await logAudit(req, { branchId: branch._id, branchName: branch.name, module: 'Branch', action: 'CREATE', fieldName: branch.name, newValue: branch.code, description: `Created branch "${branch.name}"` });
  res.status(201).json({ ok: true, branch: publicBranch(branch) });
});

// PUT /api/branches/:id — owner: edit / activate / deactivate
router.put('/:id', authenticate, requireOwner, async (req, res) => {
  const branch = await Branch.findById(req.params.id);
  if (!branch) throw notFound('Branch not found.');
  const data = readBranchBody(req.body);
  if (data.name) branch.name = data.name;
  branch.address = data.address;
  branch.phone = data.phone;
  if (typeof req.body.isActive === 'boolean') branch.isActive = req.body.isActive;
  await branch.save();
  clearBranchCache();
  await logAudit(req, { branchId: branch._id, branchName: branch.name, module: 'Branch', action: 'UPDATE', fieldName: branch.name, description: `Updated branch "${branch.name}"` });
  res.json({ ok: true, branch: publicBranch(branch) });
});

// PUT /api/branches/:id/manager — owner: create the manager login or set a new PIN
router.put('/:id/manager', authenticate, requireOwner, async (req, res) => {
  const branch = await Branch.findById(req.params.id);
  if (!branch) throw notFound('Branch not found.');
  const pin = String(req.body.pin || '');
  if (!/^\d{4,6}$/.test(pin)) throw badRequest('PIN must be 4–6 digits.');
  const name = str(req.body.name, 80);

  let manager = await User.findOne({ role: 'manager', branchId: branch._id });
  const hashed = await User.hashPin(pin);
  if (!manager) {
    manager = new User({
      username: `manager_${branch.code.toLowerCase()}`,
      name: name || `Manager – ${branch.name}`,
      role: 'manager',
      branchId: branch._id,
      pin: hashed,
    });
  } else {
    manager.pin = hashed;
    manager.password = undefined; // retire the legacy password
    manager.failedLogins = 0;
    manager.lockedUntil = undefined;
    if (name) manager.name = name;
  }
  await manager.save();
  await logAudit(req, { branchId: branch._id, branchName: branch.name, module: 'Security', action: 'RESET_CREDENTIALS', fieldName: 'Manager PIN', description: `Owner set a new manager PIN for "${branch.name}"` });
  res.json({ ok: true });
});

module.exports = router;
