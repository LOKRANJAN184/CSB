const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const Branch = require('../models/Branch');
const User = require('../models/User');
const { authenticate, requireOwner } = require('../middleware/auth');
const { logAudit } = require('../services/auditService');

// GET /api/branches - List active branches (for login dropdown & branch switcher)
router.get('/', async (req, res) => {
  try {
    const branches = await Branch.find({ isActive: true }).sort({ code: 1 });
    res.json({
      success: true,
      branches: branches.map((b) => ({
        id: b._id,
        _id: b._id,
        name: b.name,
        code: b.code,
        address: b.address,
        phone: b.phone,
      })),
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/branches/all - List all branches with Shop Manager account info (Owner only)
router.get('/all', authenticate, requireOwner, async (req, res) => {
  try {
    const branches = await Branch.find({}).sort({ code: 1 });
    const managers = await User.find({ role: 'manager' }).select('name username branchId approvedDevice blockedDevices pendingDevice');

    const result = branches.map((b) => {
      const mgr = managers.find((m) => m.branchId && m.branchId.toString() === b._id.toString());
      return {
        id: b._id,
        _id: b._id,
        name: b.name,
        code: b.code,
        address: b.address,
        phone: b.phone,
        isActive: b.isActive,
        manager: mgr
          ? {
              id: mgr._id,
              name: mgr.name,
              username: mgr.username,
              approvedDevice: mgr.approvedDevice && mgr.approvedDevice.deviceId ? mgr.approvedDevice : null,
              hasApprovedDevice: Boolean(mgr.approvedDevice && mgr.approvedDevice.deviceId),
              pendingDevice: mgr.pendingDevice && mgr.pendingDevice.status === 'pending' ? mgr.pendingDevice : null,
              blockedCount: (mgr.blockedDevices || []).length,
            }
          : null,
      };
    });

    res.json({ success: true, branches: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/branches - Create new branch (Owner only)
router.post('/', authenticate, requireOwner, async (req, res) => {
  try {
    const { name, code, address, phone, managerUsername, managerPin } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Branch name is required.' });
    }

    const branchCode = (code || name.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8)).toUpperCase();

    const existingCode = await Branch.findOne({ code: branchCode });
    if (existingCode) {
      return res.status(400).json({ success: false, message: `Branch code "${branchCode}" already exists.` });
    }

    const branch = await Branch.create({
      name: name.trim(),
      code: branchCode,
      address: (address || '').trim(),
      phone: (phone || '').trim(),
      isActive: true,
    });

    // Create manager account for this branch
    const uName = (managerUsername || `manager_${branchCode.toLowerCase()}`).toLowerCase().trim();
    const pin = (managerPin || '8734').trim();
    const hashedPin = await bcrypt.hash(pin, 10);

    let mgr = await User.findOne({ username: uName });
    if (!mgr) {
      mgr = new User({
        username: uName,
        name: `Shop Manager (${branch.name})`,
        role: 'manager',
        branchId: branch._id,
        pin: hashedPin,
        password: hashedPin,
        phone: branch.phone,
      });
      await mgr.save();
    } else {
      mgr.branchId = branch._id;
      mgr.name = `Shop Manager (${branch.name})`;
      mgr.pin = hashedPin;
      mgr.password = hashedPin;
      await mgr.save();
    }

    await logAudit({
      branchId: branch._id,
      branchName: branch.name,
      module: 'Branch',
      action: 'CREATE',
      fieldName: 'Branch',
      newValue: branch.name,
      performedBy: req.user,
      description: `Owner created new branch "${branch.name}" (Code: ${branch.code}) with manager account "${uName}".`,
    });

    res.json({
      success: true,
      message: `Branch "${branch.name}" created successfully.`,
      branch,
      manager: {
        username: uName,
        pin,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/branches/:id - Edit branch (Owner only)
router.put('/:id', authenticate, requireOwner, async (req, res) => {
  try {
    const { name, address, phone, isActive } = req.body;
    const branch = await Branch.findById(req.params.id);
    if (!branch) {
      return res.status(400).json({ success: false, message: 'Branch not found.' });
    }

    const oldName = branch.name;
    if (name !== undefined) branch.name = name.trim();
    if (address !== undefined) branch.address = address.trim();
    if (phone !== undefined) branch.phone = phone.trim();
    if (isActive !== undefined) branch.isActive = Boolean(isActive);

    await branch.save();

    await logAudit({
      branchId: branch._id,
      branchName: branch.name,
      module: 'Branch',
      action: 'UPDATE',
      fieldName: 'BranchInfo',
      oldValue: oldName,
      newValue: `${branch.name} (Active: ${branch.isActive})`,
      performedBy: req.user,
      description: `Owner updated branch details for "${branch.name}".`,
    });

    res.json({
      success: true,
      message: `Branch "${branch.name}" updated successfully.`,
      branch,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/branches/:id/manager - Create or Reset Shop Manager Account (Owner only)
router.post('/:id/manager', authenticate, requireOwner, async (req, res) => {
  try {
    const { pin, password, username, name } = req.body;
    const branch = await Branch.findById(req.params.id);
    if (!branch) {
      return res.status(404).json({ success: false, message: 'Branch not found.' });
    }

    const targetPin = (pin || password || '8734').toString().trim();
    if (targetPin.length < 4) {
      return res.status(400).json({ success: false, message: 'PIN must be at least 4 digits.' });
    }

    let mgr = await User.findOne({ branchId: branch._id, role: 'manager' });
    const targetUsername = (username || `manager_${branch.code.toLowerCase()}`).toLowerCase().trim();

    const hashedPin = targetPin ? await bcrypt.hash(targetPin, 10) : null;
    const hashedPass = password ? await bcrypt.hash(password, 10) : hashedPin;

    if (!mgr) {
      mgr = new User({
        username: targetUsername,
        name: name || `Shop Manager (${branch.name})`,
        role: 'manager',
        branchId: branch._id,
        pin: hashedPin || (await bcrypt.hash('8734', 10)),
        password: hashedPass || (await bcrypt.hash('8734', 10)),
        phone: branch.phone,
      });
      await mgr.save();
    } else {
      if (username) mgr.username = targetUsername;
      if (name) mgr.name = name;
      if (hashedPin) mgr.pin = hashedPin;
      if (hashedPass) mgr.password = hashedPass;
      await mgr.save();
    }

    await logAudit({
      branchId: branch._id,
      branchName: branch.name,
      module: 'Security',
      action: 'RESET_CREDENTIALS',
      fieldName: 'ManagerPIN',
      newValue: `Updated for ${mgr.username}`,
      performedBy: req.user,
      description: `Owner reset credentials for Shop Manager of "${branch.name}".`,
    });

    res.json({
      success: true,
      message: `Shop Manager for "${branch.name}" updated successfully.`,
      manager: {
        id: mgr._id,
        username: mgr.username,
        name: mgr.name,
        branchId: branch._id,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
