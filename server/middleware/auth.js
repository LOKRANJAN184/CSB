const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Branch = require('../models/Branch');
const { logAudit } = require('../services/auditService');
const { emitRealtimeUpdate } = require('../socket');

const JWT_SECRET = process.env.JWT_SECRET || 'chendurar-sweets-secret-key-2026';

// Helper to get today's date string in local format YYYY-MM-DD
const getTodayDateStr = () => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Helper to resolve and enforce active branch
const resolveBranch = async (req, user) => {
  if (user.role === 'manager') {
    if (!user.branchId) {
      const main = await Branch.findOne({ code: 'MAIN' });
      if (main) {
        user.branchId = main._id;
        await user.save();
      }
    }
    const reqBranchId = (req.headers['x-branch-id'] || req.query.branchId || (req.body && req.body.branchId) || '').toString().trim();
    if (reqBranchId && reqBranchId !== 'all' && user.branchId && reqBranchId !== user.branchId.toString()) {
      return { allowed: false, error: 'Access denied. You can only access your assigned branch.' };
    }
    const b = user.branchId ? await Branch.findById(user.branchId) : null;
    return {
      allowed: true,
      branchId: user.branchId,
      branch: b,
      branchName: b ? b.name : 'Samayanallur Branch',
    };
  }

  // Owner can access any branch or all
  const requested = (req.headers['x-branch-id'] || req.query.branchId || (req.body && req.body.branchId) || '').toString().trim();
  if (requested === 'all') {
    return { allowed: true, branchId: 'all', branch: null, branchName: 'All Branches' };
  }
  if (requested) {
    const b = await Branch.findById(requested);
    if (b) {
      return { allowed: true, branchId: b._id, branch: b, branchName: b.name };
    }
  }

  const main = (await Branch.findOne({ code: 'MAIN' })) || (await Branch.findOne({}));
  return {
    allowed: true,
    branchId: main ? main._id : null,
    branch: main,
    branchName: main ? main.name : 'Samayanallur Branch',
  };
};

// Authenticate JWT token
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Authentication required. Please log in.' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);

    const user = await User.findById(decoded.id).select('-password -pin');
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid session or user not found.' });
    }

    const branchInfo = await resolveBranch(req, user);
    if (!branchInfo.allowed) {
      return res.status(403).json({ success: false, message: branchInfo.error });
    }

    req.branchId = branchInfo.branchId;
    req.branch = branchInfo.branch;
    req.branchName = branchInfo.branchName;

    req.user = {
      _id: user._id,
      userId: user._id.toString(),
      username: user.username,
      name: user.name,
      role: user.role,
      branchId: user.branchId || branchInfo.branchId,
      branchName: branchInfo.branchName,
    };

    // Enforce device check on EVERY request for Shop Manager (Owner has NO restriction)
    if (user.role === 'manager') {
      const reqDeviceId = (req.headers['x-device-id'] || req.query.deviceId || (req.body && req.body.deviceId) || '').toString().trim();
      const reqDeviceName = (req.headers['x-device-name'] || 'Shop Device').toString().trim();
      const approvedDeviceId = user.approvedDevice && user.approvedDevice.deviceId;

      // 1. Check if device is explicitly blocked by Owner
      const isExplicitlyBlocked = user.blockedDevices && user.blockedDevices.some((d) => d.deviceId === reqDeviceId);
      if (isExplicitlyBlocked) {
        return res.status(403).json({
          success: false,
          code: 'DEVICE_BLOCKED',
          message: 'This device has been blocked by the Owner. Access denied.',
        });
      }

      if (!approvedDeviceId || approvedDeviceId !== reqDeviceId) {
        // Block request and log in AuditLog (Edit History)
        await logAudit({
          branchId: req.branchId,
          branchName: req.branchName,
          recordDate: getTodayDateStr(),
          module: 'Security',
          action: 'BLOCKED_ATTEMPT',
          fieldName: 'DeviceLock',
          oldValue: approvedDeviceId ? `${user.approvedDevice.deviceName} (${approvedDeviceId})` : 'None Registered',
          newValue: `${reqDeviceName} (${reqDeviceId})`,
          performedBy: {
            userId: user._id.toString(),
            name: user.name,
            role: user.role,
            branchId: user.branchId,
            branchName: req.branchName,
          },
          description: `Blocked request to ${req.originalUrl || req.url} from unauthorized device "${reqDeviceName}" at ${req.branchName}. Access allowed only from registered shop device.`,
        });

        emitRealtimeUpdate('security_alert', {
          type: 'BLOCKED_ATTEMPT',
          deviceName: reqDeviceName,
          deviceId: reqDeviceId,
          time: new Date(),
          url: req.originalUrl || req.url,
          message: `Blocked attempt from unapproved device "${reqDeviceName}"`,
        });

        return res.status(403).json({
          success: false,
          code: 'DEVICE_BLOCKED',
          message: 'Access allowed only from the shop device',
        });
      }

      // Update last active time for approved device
      user.approvedDevice.lastActiveAt = new Date();
      user.save().catch(() => {});
    }

    next();
  } catch (err) {
    const isExpired = err.name === 'TokenExpiredError';
    return res.status(401).json({
      success: false,
      code: isExpired ? 'TOKEN_EXPIRED' : 'INVALID_SESSION',
      message: isExpired
        ? 'Session expired. Please log in again.'
        : 'Session expired or invalid token. Please log in again.',
    });
  }
};

// Require Owner role
const requireOwner = (req, res, next) => {
  if (req.user && req.user.role === 'owner') {
    return next();
  }
  return res.status(403).json({
    success: false,
    message: 'Access denied. Owner permissions required.',
  });
};

// Restrict editing past dates for Shop Manager
const enforceEditPermissions = (req, res, next) => {
  if (req.user.role === 'owner') {
    // Owner can edit any date anytime
    return next();
  }

  // Shop Manager: can only edit today's records
  const targetDate = req.params.date || req.body.date;
  const today = getTodayDateStr();

  if (!targetDate || targetDate === today) {
    return next();
  }

  return res.status(403).json({
    success: false,
    message: `Permission denied. Shop Manager can only edit today's records (${today}). Past records are view-only.`,
  });
};

module.exports = {
  authenticate,
  requireOwner,
  enforceEditPermissions,
  getTodayDateStr,
  JWT_SECRET,
};

