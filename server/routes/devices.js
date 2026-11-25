const express = require('express');
const User = require('../models/User');
const Branch = require('../models/Branch');
const AuditLog = require('../models/AuditLog');
const { authenticate, requireOwner } = require('../middleware/auth');
const { badRequest, notFound, str } = require('../lib/http');
const { logAudit } = require('../services/audit');

// The shop manager can only use the app from ONE device per branch.
// When they log in from a new phone, it becomes a "pending" request.
// The owner approves, rejects or blocks it from here.

const router = express.Router();
router.use(authenticate, requireOwner);

// GET /api/devices/security-log?branchId=…
router.get('/security-log', async (req, res) => {
  const query = { module: 'Security' };
  if (req.query.branchId) query.branchId = req.query.branchId;
  const logs = await AuditLog.find(query).sort({ timestamp: -1 }).limit(30).lean();
  res.json({ ok: true, logs });
});

// POST /api/devices/:branchId/:action   body: { deviceId? }
router.post('/:branchId/:action', async (req, res) => {
  const { branchId, action } = req.params;
  const [branch, manager] = await Promise.all([
    Branch.findById(branchId),
    User.findOne({ role: 'manager', branchId }),
  ]);
  if (!branch || !manager) throw notFound('Branch manager not found.');

  const pending = manager.pendingDevice?.status === 'pending' ? manager.pendingDevice : null;
  const deviceId = str(req.body.deviceId, 80) || pending?.deviceId || manager.approvedDevice?.deviceId;
  if (!deviceId) throw badRequest('No device selected.');
  const deviceName =
    (pending?.deviceId === deviceId && pending.deviceName) ||
    (manager.approvedDevice?.deviceId === deviceId && manager.approvedDevice.deviceName) ||
    manager.blockedDevices.find((d) => d.deviceId === deviceId)?.deviceName ||
    str(req.body.deviceName, 80) ||
    'Shop device';

  const clearPendingIf = (id) => {
    if (manager.pendingDevice?.deviceId === id) manager.pendingDevice = { status: 'none' };
  };

  let description;
  switch (action) {
    case 'approve':
      // Replaces any previously approved device: only one device at a time.
      manager.approvedDevice = { deviceId, deviceName, approvedAt: new Date(), lastActiveAt: new Date(), approvedBy: req.user.name };
      manager.blockedDevices = manager.blockedDevices.filter((d) => d.deviceId !== deviceId);
      clearPendingIf(deviceId);
      description = `Approved "${deviceName}" as the shop device for ${branch.name}`;
      break;
    case 'reject':
      clearPendingIf(deviceId);
      description = `Rejected device request from "${deviceName}"`;
      break;
    case 'remove':
      manager.approvedDevice = undefined;
      description = `Removed "${deviceName}" as the shop device for ${branch.name}`;
      break;
    case 'block':
      if (manager.approvedDevice?.deviceId === deviceId) manager.approvedDevice = undefined;
      clearPendingIf(deviceId);
      if (!manager.blockedDevices.some((d) => d.deviceId === deviceId)) {
        manager.blockedDevices.push({ deviceId, deviceName, blockedBy: req.user.name });
      }
      description = `Blocked "${deviceName}"`;
      break;
    case 'unblock':
      manager.blockedDevices = manager.blockedDevices.filter((d) => d.deviceId !== deviceId);
      description = `Unblocked "${deviceName}"`;
      break;
    default:
      throw badRequest('Unknown action.');
  }

  await manager.save();
  await logAudit(req, {
    branchId: branch._id, branchName: branch.name, module: 'Security',
    action: `DEVICE_${action.toUpperCase()}`, fieldName: 'DeviceLock', newValue: `${deviceName} (${deviceId})`, description,
  });
  res.json({ ok: true, message: description });
});

module.exports = router;
