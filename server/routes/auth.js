const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Branch = require('../models/Branch');
const { authenticate, JWT_SECRET, getTodayDateStr } = require('../middleware/auth');
const { logAudit } = require('../services/auditService');
const { emitRealtimeUpdate } = require('../socket');

// Generate JWT token (Shop Manager: 1 hour auto-logout, Owner: 5 hours auto-logout)
const generateToken = (user, branchId = null) => {
  const expiresIn = user.role === 'manager' ? '1h' : '5h';
  return jwt.sign(
    {
      id: user._id,
      username: user.username,
      role: user.role,
      name: user.name,
      branchId: branchId || user.branchId || null,
    },
    JWT_SECRET,
    { expiresIn }
  );
};

// GET /api/auth/accounts - list accounts for convenient mobile switch
router.get('/accounts', async (req, res) => {
  try {
    const users = await User.find({}).select('name role username phone');
    res.json({ success: true, accounts: users });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

const OWNER_PHONE_CREDENTIALS = {
  '9976885361': '7688',
  '9025351545': '5351',
  '9842329813': '2329',
  '9043979813': '4397',
};
const ALLOWED_OWNER_PHONES = Object.keys(OWNER_PHONE_CREDENTIALS);

// POST /api/auth/login - login with username + password OR role + PIN
router.post('/login', async (req, res) => {
  try {
    const { role, pin, username, password, phone, mobile } = req.body;
    const reqRole = (role || (username === 'owner' ? 'owner' : (username === 'manager' ? 'manager' : ''))).toLowerCase();
    const inputPhone = (phone || mobile || '').toString().trim().replace(/\D/g, '').slice(-10);

    let user = null;

    if (reqRole === 'owner' || inputPhone) {
      // OWNER LOGIN: Must enter registered mobile number AND dedicated PIN for that number
      if (!inputPhone || !ALLOWED_OWNER_PHONES.includes(inputPhone)) {
        return res.status(401).json({
          success: false,
          message: 'Invalid mobile number or PIN. Please try again.',
        });
      }

      const ownerUser = await User.findOne({ role: 'owner' });
      if (!ownerUser) {
        return res.status(401).json({ success: false, message: 'Owner account not found.' });
      }

      const candidateKey = (pin || password || '').toString().trim();
      if (!candidateKey) {
        return res.status(400).json({ success: false, message: 'Please enter PIN.' });
      }

      const expectedPin = OWNER_PHONE_CREDENTIALS[inputPhone];
      let isMatch = (candidateKey === expectedPin);
      if (!isMatch && ownerUser.comparePhonePin) {
        isMatch = await ownerUser.comparePhonePin(inputPhone, candidateKey);
      }

      if (!isMatch) {
        return res.status(401).json({
          success: false,
          message: 'Invalid mobile number or PIN. Please try again.',
        });
      }

      user = ownerUser;
    } else if (reqRole === 'manager') {
      // MANAGER LOGIN: Must enter PIN / Password for their selected branch
      const inputBranchId = (req.body.branchId || req.headers['x-branch-id'] || '').toString().trim();
      let managerUser = null;

      if (inputBranchId) {
        managerUser = await User.findOne({ role: 'manager', branchId: inputBranchId });
      }
      if (!managerUser && username) {
        managerUser = await User.findOne({ role: 'manager', username: username.toLowerCase().trim() });
      }
      if (!managerUser) {
        const main = await Branch.findOne({ code: 'MAIN' });
        managerUser = (main && (await User.findOne({ role: 'manager', branchId: main._id }))) || (await User.findOne({ role: 'manager' }));
      }

      if (!managerUser) {
        return res.status(401).json({ success: false, message: 'Shop manager account not found for this branch.' });
      }

      const candidateKey = (pin || password || '').toString().trim();
      if (!candidateKey) {
        return res.status(400).json({ success: false, message: 'Please enter PIN.' });
      }

      const isPinValid = await managerUser.comparePin(candidateKey);
      const isPasswordValid = await managerUser.comparePassword(candidateKey);

      if (!isPinValid && !isPasswordValid) {
        return res.status(401).json({
          success: false,
          message: 'Invalid PIN. Please try again.',
        });
      }

      user = managerUser;
    } else if (pin) {
      // Fallback if role is not explicitly specified
      const pinStr = pin.toString().trim();
      const allUsers = await User.find({});
      for (const u of allUsers) {
        if (u.role === 'owner') {
          if (inputPhone && ALLOWED_OWNER_PHONES.includes(inputPhone)) {
            const expectedPin = OWNER_PHONE_CREDENTIALS[inputPhone];
            let isMatch = (pinStr === expectedPin);
            if (!isMatch && u.comparePhonePin) {
              isMatch = await u.comparePhonePin(inputPhone, pinStr);
            }
            if (isMatch) { user = u; break; }
          }
        } else {
          const isMatch = await u.comparePin(pinStr);
          if (isMatch) { user = u; break; }
        }
      }

      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'Invalid PIN. Please try again.',
        });
      }
    } else if (username && password) {
      // Standard username & password login
      user = await User.findOne({ username: username.toLowerCase() });
      if (!user) {
        return res.status(401).json({ success: false, message: 'Invalid username or password.' });
      }

      if (user.role === 'owner') {
        if (!inputPhone || !ALLOWED_OWNER_PHONES.includes(inputPhone)) {
          return res.status(401).json({
            success: false,
            message: 'Invalid mobile number or PIN. Please try again.',
          });
        }
        const expectedPin = OWNER_PHONE_CREDENTIALS[inputPhone];
        const candidateKey = (password || '').toString().trim();
        let isMatch = (candidateKey === expectedPin);
        if (!isMatch && user.comparePhonePin) {
          isMatch = await user.comparePhonePin(inputPhone, candidateKey);
        }
        if (!isMatch) {
          return res.status(401).json({
            success: false,
            message: 'Invalid mobile number or PIN. Please try again.',
          });
        }
      } else {
        const isPasswordValid = await user.comparePassword(password);
        const isPinValid = await user.comparePin(password);
        if (!isPasswordValid && !isPinValid) {
          return res.status(401).json({ success: false, message: 'Invalid username or password.' });
        }
      }
    } else {
      return res.status(400).json({
        success: false,
        message: 'Please provide either role + PIN or username + password.',
      });
    }

    // Enforce Device Lock for Shop Manager (Owner has NO device restriction)
    if (user.role === 'manager') {
      const reqDeviceId = (req.body.deviceId || req.headers['x-device-id'] || '').toString().trim();
      const reqDeviceName = (req.body.deviceName || req.headers['x-device-name'] || 'Shop Device').toString().trim();

      const approvedDeviceId = user.approvedDevice && user.approvedDevice.deviceId;

      // Check if this device has been explicitly blocked by the Owner
      const isExplicitlyBlocked = user.blockedDevices && user.blockedDevices.some((d) => d.deviceId === reqDeviceId);
      if (isExplicitlyBlocked) {
        await logAudit({
          recordDate: getTodayDateStr(),
          module: 'Security',
          action: 'BLOCKED_ATTEMPT',
          fieldName: 'DeviceLock',
          oldValue: 'Blocked Devices',
          newValue: `${reqDeviceName} (${reqDeviceId})`,
          performedBy: {
            userId: user._id.toString(),
            name: user.name,
            role: user.role,
          },
          description: `Blocked login attempt from BLOCKED device "${reqDeviceName}". Access is denied by Owner.`,
        });

        return res.status(403).json({
          success: false,
          code: 'DEVICE_BLOCKED',
          message: 'This device has been blocked by the Owner. Access denied.',
          subMessage: 'Access is blocked by the Owner',
        });
      }

      // If no approved device yet, or this device does not match the approved device:
      if (!approvedDeviceId || approvedDeviceId !== reqDeviceId) {
        user.pendingDevice = {
          deviceId: reqDeviceId || 'unknown_device',
          deviceName: reqDeviceName,
          requestedAt: new Date(),
          status: 'pending',
          ip: req.ip || req.connection.remoteAddress || '',
        };
        await user.save();

        const isBlockedAttempt = Boolean(approvedDeviceId);

        // Log attempt in Edit History (AuditLog) for Owner to review
        await logAudit({
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
          },
          description: isBlockedAttempt
            ? `Blocked login attempt from unauthorized device "${reqDeviceName}". Access allowed only from registered shop device "${user.approvedDevice.deviceName}".`
            : `First login request from new device "${reqDeviceName}". Waiting for Owner approval.`,
        });

        // Emit real-time notification to Owner via Socket.io
        emitRealtimeUpdate('device_request', {
          deviceId: reqDeviceId,
          deviceName: reqDeviceName,
          requestedAt: new Date(),
          hasApprovedDevice: isBlockedAttempt,
          message: isBlockedAttempt
            ? `Blocked attempt / device request from Shop Manager: ${reqDeviceName}`
            : `New device approval request from Shop Manager: ${reqDeviceName}`,
        });

        return res.status(403).json({
          success: false,
          code: 'DEVICE_NOT_APPROVED',
          message: 'This device is not approved. Waiting for Owner approval',
          subMessage: 'Access allowed only from the shop device',
          device: {
            deviceId: reqDeviceId,
            deviceName: reqDeviceName,
            requestedAt: new Date(),
            hasApprovedDevice: isBlockedAttempt,
            approvedDeviceName: isBlockedAttempt ? user.approvedDevice.deviceName : null,
          },
        });
      }

      // Approved device: update last active timestamp
      user.approvedDevice.lastActiveAt = new Date();
      await user.save();
    }

    let selectedBranch = null;
    if (user.role === 'manager') {
      selectedBranch = user.branchId ? await Branch.findById(user.branchId).catch(() => null) : null;
      if (!selectedBranch) selectedBranch = await Branch.findOne({ code: 'MAIN' });
    } else {
      const bId = (req.body.branchId || req.headers['x-branch-id'] || '').toString().trim();
      selectedBranch = bId ? await Branch.findById(bId).catch(() => null) : null;
      if (!selectedBranch) selectedBranch = await Branch.findOne({ code: 'MAIN' });
      if (!selectedBranch) selectedBranch = await Branch.findOne({});
    }

    const token = generateToken(user, selectedBranch ? selectedBranch._id : user.branchId);

    // Audit log login (non-blocking)
    try {
      await logAudit({
        branchId: selectedBranch ? selectedBranch._id : (user.branchId || null),
        branchName: selectedBranch ? selectedBranch.name : 'Samayanallur Branch',
        module: user.role === 'manager' ? 'Security' : 'Auth',
        action: 'LOGIN',
        fieldName: user.role === 'manager' ? 'DeviceLock' : 'Session',
        newValue: user.role === 'manager' && user.approvedDevice
          ? `${user.approvedDevice.deviceName || 'Shop Device'} (${user.approvedDevice.deviceId || ''})`
          : null,
        performedBy: {
          userId: user._id.toString(),
          name: user.name,
          role: user.role,
          branchId: selectedBranch ? selectedBranch._id : user.branchId,
          branchName: selectedBranch ? selectedBranch.name : 'Samayanallur Branch',
        },
        description: user.role === 'manager' && user.approvedDevice
          ? `${user.name} logged in successfully from shop device "${user.approvedDevice.deviceName || 'Shop Device'}" at ${selectedBranch ? selectedBranch.name : 'Shop'}.`
          : `${user.name} (${user.role.toUpperCase()}) logged in successfully to ${selectedBranch ? selectedBranch.name : 'Samayanallur Branch'}.`,
      });
    } catch (auditErr) {
      console.warn('[Audit Warning] Non-fatal audit log during login:', auditErr.message);
    }

    res.json({
      success: true,
      message: `Welcome, ${user.name}!`,
      token,
      expiresIn: user.role === 'manager' ? 3600 : 18000,
      user: {
        id: user._id,
        name: user.name,
        role: user.role,
        username: user.username,
        phone: user.phone,
        branchId: selectedBranch ? selectedBranch._id : user.branchId,
        branchName: selectedBranch ? selectedBranch.name : 'Samayanallur Branch',
      },
      branch: selectedBranch
        ? {
          id: selectedBranch._id,
          _id: selectedBranch._id,
          name: selectedBranch.name,
          code: selectedBranch.code,
          address: selectedBranch.address,
          phone: selectedBranch.phone,
        }
        : null,
    });
  } catch (err) {
    console.error('[AuthRoute] Login error:', err);
    res.status(500).json({ success: false, message: err.message || 'Internal server error during login.' });
  }
});

// GET /api/auth/me - get current user session
router.get('/me', authenticate, async (req, res) => {
  res.json({
    success: true,
    user: req.user,
    branch: req.branch
      ? {
        id: req.branch._id,
        _id: req.branch._id,
        name: req.branch.name,
        code: req.branch.code,
        address: req.branch.address,
        phone: req.branch.phone,
      }
      : null,
  });
});

// PUT /api/auth/update-credentials - update PIN or password
router.put('/update-credentials', authenticate, async (req, res) => {
  try {
    const { newPin, newPassword } = req.body;
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    if (newPin) {
      if (!/^\d{4,6}$/.test(newPin)) {
        return res.status(400).json({ success: false, message: 'PIN must be 4 to 6 digits.' });
      }
      user.pin = await bcrypt.hash(newPin.toString(), 10);
      await logAudit({
        module: 'Auth',
        action: 'UPDATE',
        fieldName: 'PIN',
        performedBy: req.user,
        description: `${user.name} changed their account PIN.`,
      });
    }

    if (newPassword) {
      if (newPassword.length < 6) {
        return res.status(400).json({ success: false, message: 'Password must be at least 6 characters.' });
      }
      user.password = await bcrypt.hash(newPassword, 10);
      await logAudit({
        module: 'Auth',
        action: 'UPDATE',
        fieldName: 'Password',
        performedBy: req.user,
        description: `${user.name} changed their account password.`,
      });
    }

    await user.save();
    res.json({ success: true, message: 'Credentials updated successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;

