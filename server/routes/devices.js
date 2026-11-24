const express = require('express');
const router = express.Router();
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const { authenticate, requireOwner, getTodayDateStr } = require('../middleware/auth');
const { logAudit } = require('../services/auditService');
const { emitRealtimeUpdate } = require('../socket');

// Helper to get branch manager for device operations
const getBranchManager = async (req) => {
  if (req.branchId) {
    const mgr = await User.findOne({ role: 'manager', branchId: req.branchId });
    if (mgr) return mgr;
  }
  return await User.findOne({ role: 'manager' });
};

// GET /api/devices/status - Get current approved device, pending request, and security logs
router.get('/status', authenticate, async (req, res) => {
  try {
    const manager = await getBranchManager(req);
    if (!manager) {
      return res.status(404).json({ success: false, message: 'Shop manager account not found for this branch.' });
    }

    const isOwner = req.user.role === 'owner';
    const reqDeviceId = (req.headers['x-device-id'] || '').toString().trim();
    const reqDeviceName = (req.headers['x-device-name'] || 'Current Device').toString().trim();

    let securityLogs = [];
    if (isOwner) {
      const secQuery = { module: 'Security' };
      if (req.branchId) secQuery.branchId = req.branchId;
      securityLogs = await AuditLog.find(secQuery)
        .sort({ timestamp: -1 })
        .limit(15);
    }

    const hasPending = manager.pendingDevice && manager.pendingDevice.status === 'pending' && manager.pendingDevice.deviceId;

    const approvedDev = manager.approvedDevice && manager.approvedDevice.deviceId ? manager.approvedDevice : null;
    const pendingDev = hasPending ? manager.pendingDevice : null;
    const blockedDevs = manager.blockedDevices || [];
    const clientDev = {
      deviceId: reqDeviceId,
      deviceName: reqDeviceName,
      isApprovedShopDevice: Boolean(manager.approvedDevice && manager.approvedDevice.deviceId === reqDeviceId),
      isBlocked: Boolean(blockedDevs.some(d => d.deviceId === reqDeviceId)),
    };

    res.json({
      success: true,
      approvedDevice: approvedDev,
      pendingDevice: pendingDev,
      blockedDevices: blockedDevs,
      securityLogs,
      currentClientDevice: clientDev,
      data: {
        approvedDevice: approvedDev,
        pendingDevice: pendingDev,
        blockedDevices: blockedDevs,
        securityLogs,
        currentClientDevice: clientDev,
      },
    });
  } catch (err) {
    console.error('[DeviceRoute] Error fetching status:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/devices/approve - Approve pending device or set new approved device (Owner only)
router.post('/approve', authenticate, requireOwner, async (req, res) => {
  try {
    const { deviceId, deviceName } = req.body;
    const manager = await getBranchManager(req);
    if (!manager) {
      return res.status(404).json({ success: false, message: 'Shop manager account not found.' });
    }

    const targetDeviceId = deviceId || (manager.pendingDevice && manager.pendingDevice.deviceId);
    const targetDeviceName = deviceName || (manager.pendingDevice && manager.pendingDevice.deviceName) || 'Approved Shop Device';

    if (!targetDeviceId) {
      return res.status(400).json({ success: false, message: 'Device ID is required to approve.' });
    }

    const oldDevice = manager.approvedDevice && manager.approvedDevice.deviceId
      ? `${manager.approvedDevice.deviceName} (${manager.approvedDevice.deviceId})`
      : 'None (First Device)';

    // Set as the SINGLE approved device (replaces old one)
    manager.approvedDevice = {
      deviceId: targetDeviceId,
      deviceName: targetDeviceName,
      approvedAt: new Date(),
      lastActiveAt: new Date(),
      approvedBy: req.user.name,
    };

    // Clear pending request and remove from blockedDevices if previously blocked
    manager.pendingDevice = null;
    if (manager.blockedDevices && manager.blockedDevices.length > 0) {
      manager.blockedDevices = manager.blockedDevices.filter(d => d.deviceId !== targetDeviceId);
    }
    await manager.save();

    // Log approval in Edit History (AuditLog)
    await logAudit({
      branchId: req.branchId || (manager && manager.branchId) || null,
      branchName: req.branchName || '',
      recordDate: getTodayDateStr(),
      module: 'Security',
      action: 'DEVICE_APPROVED',
      fieldName: 'DeviceLock',
      oldValue: oldDevice,
      newValue: `${targetDeviceName} (${targetDeviceId})`,
      performedBy: {
        userId: req.user.userId,
        name: req.user.name,
        role: req.user.role,
      },
      description: `Owner ${req.user.name} approved device "${targetDeviceName}" (ID: ${targetDeviceId}) as the shop device. Any previous approved device was replaced.`,
    });

    // Notify all clients in real-time
    emitRealtimeUpdate('device_approved', {
      deviceId: targetDeviceId,
      deviceName: targetDeviceName,
      approvedBy: req.user.name,
      time: new Date(),
      message: `Device "${targetDeviceName}" approved by Owner`,
    });

    res.json({
      success: true,
      message: `Device "${targetDeviceName}" approved successfully as the shop device.`,
      data: {
        approvedDevice: manager.approvedDevice,
      },
    });
  } catch (err) {
    console.error('[DeviceRoute] Error approving device:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/devices/reject - Reject pending device request (Owner only)
router.post('/reject', authenticate, requireOwner, async (req, res) => {
  try {
    const { deviceId } = req.body;
    const manager = await getBranchManager(req);
    if (!manager) {
      return res.status(404).json({ success: false, message: 'Shop manager account not found.' });
    }

    const rejectedDeviceName = (manager.pendingDevice && manager.pendingDevice.deviceName) || 'Unknown Device';
    const rejectedDeviceId = deviceId || (manager.pendingDevice && manager.pendingDevice.deviceId) || 'Unknown';

    // Clear pending request
    manager.pendingDevice = null;
    await manager.save();

    // Log rejection in AuditLog
    await logAudit({
      branchId: req.branchId || (manager && manager.branchId) || null,
      branchName: req.branchName || '',
      recordDate: getTodayDateStr(),
      module: 'Security',
      action: 'DEVICE_REJECTED',
      fieldName: 'DeviceLock',
      oldValue: `${rejectedDeviceName} (${rejectedDeviceId})`,
      newValue: 'Rejected',
      performedBy: {
        userId: req.user.userId,
        name: req.user.name,
        role: req.user.role,
      },
      description: `Owner ${req.user.name} rejected device approval request for "${rejectedDeviceName}".`,
    });

    emitRealtimeUpdate('device_rejected', {
      deviceId: rejectedDeviceId,
      deviceName: rejectedDeviceName,
      rejectedBy: req.user.name,
      time: new Date(),
      message: `Device request for "${rejectedDeviceName}" was rejected by Owner.`,
    });

    res.json({
      success: true,
      message: `Device request for "${rejectedDeviceName}" rejected.`,
    });
  } catch (err) {
    console.error('[DeviceRoute] Error rejecting device:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/devices/remove - Remove current approved device (Owner only)
router.post('/remove', authenticate, requireOwner, async (req, res) => {
  try {
    const manager = await getBranchManager(req);
    if (!manager) {
      return res.status(404).json({ success: false, message: 'Shop manager account not found.' });
    }

    const removedDeviceName = manager.approvedDevice?.deviceName || 'Approved Device';
    const removedDeviceId = manager.approvedDevice?.deviceId || '';

    manager.approvedDevice = null;
    await manager.save();

    // Log in AuditLog
    await logAudit({
      branchId: req.branchId || (manager && manager.branchId) || null,
      branchName: req.branchName || '',
      recordDate: getTodayDateStr(),
      module: 'Security',
      action: 'DEVICE_REMOVED',
      fieldName: 'DeviceLock',
      oldValue: `${removedDeviceName} (${removedDeviceId})`,
      newValue: 'None (Device Removed)',
      performedBy: {
        userId: req.user.userId,
        name: req.user.name,
        role: req.user.role,
      },
      description: `Owner ${req.user.name} removed the approved shop device. Shop Manager cannot access until a new device is approved.`,
    });

    emitRealtimeUpdate('device_removed', {
      removedDeviceId,
      removedDeviceName,
      removedBy: req.user.name,
      time: new Date(),
      message: 'Approved device removed. Shop Manager has no registered device.',
    });

    res.json({
      success: true,
      message: `Approved device "${removedDeviceName}" removed. Shop Manager access is locked until a device is approved.`,
    });
  } catch (err) {
    console.error('[DeviceRoute] Error removing device:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/devices/block - Explicitly block a device (Owner only)
router.post('/block', authenticate, requireOwner, async (req, res) => {
  try {
    const { deviceId, deviceName, reason } = req.body;
    const manager = await getBranchManager(req);
    if (!manager) {
      return res.status(404).json({ success: false, message: 'Shop manager account not found.' });
    }

    const targetDeviceId = deviceId || (manager.pendingDevice && manager.pendingDevice.deviceId) || (manager.approvedDevice && manager.approvedDevice.deviceId);
    const targetDeviceName = deviceName || (manager.pendingDevice && manager.pendingDevice.deviceName) || (manager.approvedDevice && manager.approvedDevice.deviceName) || 'Shop Device';

    if (!targetDeviceId) {
      return res.status(400).json({ success: false, message: 'Device ID is required to block.' });
    }

    if (!manager.blockedDevices) manager.blockedDevices = [];

    // Add to blockedDevices if not already there
    const alreadyBlocked = manager.blockedDevices.some((d) => d.deviceId === targetDeviceId);
    if (!alreadyBlocked) {
      manager.blockedDevices.push({
        deviceId: targetDeviceId,
        deviceName: targetDeviceName,
        blockedAt: new Date(),
        blockedBy: req.user.name,
        reason: reason || 'Blocked by Owner',
      });
    }

    // If it was the approved device, clear approved device
    let wasApproved = false;
    if (manager.approvedDevice && manager.approvedDevice.deviceId === targetDeviceId) {
      manager.approvedDevice = null;
      wasApproved = true;
    }

    // If it was pending, clear pending
    if (manager.pendingDevice && manager.pendingDevice.deviceId === targetDeviceId) {
      manager.pendingDevice = null;
    }

    await manager.save();

    // Log in AuditLog
    await logAudit({
      branchId: req.branchId || (manager && manager.branchId) || null,
      branchName: req.branchName || '',
      recordDate: getTodayDateStr(),
      module: 'Security',
      action: 'DEVICE_BLOCKED',
      fieldName: 'DeviceLock',
      oldValue: `${targetDeviceName} (${targetDeviceId})`,
      newValue: 'BLOCKED',
      performedBy: {
        userId: req.user.userId,
        name: req.user.name,
        role: req.user.role,
      },
      description: `Owner ${req.user.name} blocked device "${targetDeviceName}" (ID: ${targetDeviceId}). Access from this device is now blocked.`,
    });

    emitRealtimeUpdate('device_blocked', {
      deviceId: targetDeviceId,
      deviceName: targetDeviceName,
      blockedBy: req.user.name,
      time: new Date(),
      message: `Device "${targetDeviceName}" has been blocked by Owner.`,
    });

    res.json({
      success: true,
      message: `Device "${targetDeviceName}" has been blocked. Access from this device is denied.`,
      data: {
        blockedDevices: manager.blockedDevices,
      },
    });
  } catch (err) {
    console.error('[DeviceRoute] Error blocking device:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/devices/unblock - Unblock a previously blocked device (Owner only)
router.post('/unblock', authenticate, requireOwner, async (req, res) => {
  try {
    const { deviceId } = req.body;
    const manager = await getBranchManager(req);
    if (!manager) {
      return res.status(404).json({ success: false, message: 'Shop manager account not found.' });
    }

    if (!deviceId) {
      return res.status(400).json({ success: false, message: 'Device ID is required to unblock.' });
    }

    const unblockedDevice = (manager.blockedDevices || []).find((d) => d.deviceId === deviceId);
    const devName = unblockedDevice?.deviceName || 'Device';

    manager.blockedDevices = (manager.blockedDevices || []).filter((d) => d.deviceId !== deviceId);
    await manager.save();

    // Log in AuditLog
    await logAudit({
      branchId: req.branchId || (manager && manager.branchId) || null,
      branchName: req.branchName || '',
      recordDate: getTodayDateStr(),
      module: 'Security',
      action: 'DEVICE_UNBLOCKED',
      fieldName: 'DeviceLock',
      oldValue: `${devName} (${deviceId})`,
      newValue: 'UNBLOCKED',
      performedBy: {
        userId: req.user.userId,
        name: req.user.name,
        role: req.user.role,
      },
      description: `Owner ${req.user.name} unblocked device "${devName}". It can now request approval.`,
    });

    emitRealtimeUpdate('device_unblocked', {
      deviceId,
      deviceName: devName,
      unblockedBy: req.user.name,
      time: new Date(),
      message: `Device "${devName}" has been unblocked by Owner.`,
    });

    res.json({
      success: true,
      message: `Device "${devName}" has been unblocked.`,
      data: {
        blockedDevices: manager.blockedDevices,
      },
    });
  } catch (err) {
    console.error('[DeviceRoute] Error unblocking device:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
