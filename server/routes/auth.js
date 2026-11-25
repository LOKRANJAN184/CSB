const express = require('express');
const User = require('../models/User');
const { authenticate, requireOwner, signSessionToken } = require('../middleware/auth');
const { HttpError, badRequest, unauthorized, forbidden, notFound, str } = require('../lib/http');
const { logAudit } = require('../services/audit');

const router = express.Router();

const cleanPhone = (v) => String(v || '').replace(/\D/g, '').slice(-10);
const isPin = (v) => /^\d{4,6}$/.test(String(v || ''));

const lockedError = (user) => {
  const mins = Math.ceil((user.lockedUntil - Date.now()) / 60000);
  return new HttpError(429, `Too many wrong PINs. Try again in ${mins} minute${mins === 1 ? '' : 's'}.`, 'LOCKED');
};

const sessionResponse = (user, session, branch) => ({
  token: session.token,
  expiresAt: session.expiresAt,
  user: { id: user._id, name: user.name, role: user.role, phone: user.phone },
  branch: branch ? { id: branch._id, name: branch.name, code: branch.code } : null,
});

// ---------------------------------------------------------------------------
// POST /api/auth/login
//   Owner:   { mode: 'owner',   phone, pin }
//   Manager: { mode: 'manager', branchId, pin, deviceId, deviceName }
// ---------------------------------------------------------------------------
router.post('/login', async (req, res) => {
  const { mode, pin } = req.body || {};
  if (!isPin(pin)) throw badRequest('Enter your 4–6 digit PIN.');

  if (mode === 'owner') {
    const phone = cleanPhone(req.body.phone);
    const owner = await User.findOne({ role: 'owner' });
    // Same message for "wrong phone" and "wrong PIN" so attackers learn nothing.
    if (!owner) throw unauthorized('Wrong phone number or PIN.', 'BAD_CREDENTIALS');
    if (owner.isLocked()) throw lockedError(owner);
    if (!(await owner.checkPhonePin(phone, pin))) {
      await owner.registerFailedLogin();
      throw unauthorized('Wrong phone number or PIN.', 'BAD_CREDENTIALS');
    }
    await owner.registerSuccessfulLogin();
    req.user = { id: owner._id, name: owner.name, role: 'owner' };
    await logAudit(req, { module: 'Auth', action: 'LOGIN', fieldName: 'Session', branchId: null, branchName: '', description: `Owner logged in from ${phone.slice(0, 2)}******${phone.slice(-2)}` });
    return res.json({ ok: true, ...sessionResponse(owner, signSessionToken(owner, { phone }), null) });
  }

  if (mode === 'manager') {
    const branchId = str(req.body.branchId, 40);
    const deviceId = str(req.body.deviceId, 80);
    const deviceName = str(req.body.deviceName, 80) || 'Shop device';
    if (!branchId) throw badRequest('Choose your branch.');
    if (!deviceId) throw badRequest('Missing device id.');

    const manager = await User.findOne({ role: 'manager', branchId }).populate('branchId');
    if (!manager) throw notFound('No shop manager account for this branch. Ask the owner to create one.');
    if (manager.isLocked()) throw lockedError(manager);
    if (!(await manager.checkPin(pin))) {
      await manager.registerFailedLogin();
      throw unauthorized('Wrong PIN.', 'BAD_CREDENTIALS');
    }
    await manager.registerSuccessfulLogin();

    const branch = manager.branchId;
    req.user = { id: manager._id, name: manager.name, role: 'manager' };
    req.branchId = branch._id;
    req.branchName = branch.name;

    if (manager.blockedDevices.some((d) => d.deviceId === deviceId)) {
      await logAudit(req, { module: 'Security', action: 'BLOCKED_ATTEMPT', fieldName: 'DeviceLock', newValue: `${deviceName} (${deviceId})`, description: `Login refused: "${deviceName}" is blocked.` });
      throw forbidden('This device has been blocked by the owner.', 'DEVICE_BLOCKED');
    }

    if (!manager.approvedDevice || manager.approvedDevice.deviceId !== deviceId) {
      // Correct PIN, but from a device the owner has not approved yet.
      // Store it as a pending request the owner can approve from Settings.
      manager.pendingDevice = { deviceId, deviceName, requestedAt: new Date(), status: 'pending', ip: req.ip || '' };
      await manager.save();
      await logAudit(req, {
        module: 'Security', action: 'BLOCKED_ATTEMPT', fieldName: 'DeviceLock',
        oldValue: manager.approvedDevice?.deviceId ? manager.approvedDevice.deviceName : 'None',
        newValue: `${deviceName} (${deviceId})`,
        description: `"${deviceName}" asked to be approved as the shop device for ${branch.name}.`,
      });
      throw forbidden('Waiting for the owner to approve this device.', 'DEVICE_PENDING', {
        deviceName,
        hasApprovedDevice: Boolean(manager.approvedDevice?.deviceId),
      });
    }

    manager.approvedDevice.lastActiveAt = new Date();
    await manager.save();
    await logAudit(req, { module: 'Security', action: 'LOGIN', fieldName: 'DeviceLock', newValue: deviceName, description: `${manager.name} logged in at ${branch.name} from "${deviceName}".` });
    return res.json({ ok: true, ...sessionResponse(manager, signSessionToken(manager, { dev: deviceId }), branch) });
  }

  throw badRequest('Choose Owner or Shop Manager.');
});

// GET /api/auth/me — check the saved session is still valid
router.get('/me', authenticate, (req, res) => {
  const u = req.user.doc;
  res.json({ ok: true, user: { id: u._id, name: u.name, role: u.role, phone: req.user.phone } });
});

// ---------------------------------------------------------------------------
// Owner login phones: list / add-or-change-PIN / remove
// ---------------------------------------------------------------------------
router.get('/owner-phones', authenticate, requireOwner, (req, res) => {
  res.json({ ok: true, phones: req.user.doc.allowedPhones, current: req.user.phone });
});

router.put('/owner-phones/:phone', authenticate, requireOwner, async (req, res) => {
  const phone = cleanPhone(req.params.phone);
  if (phone.length !== 10) throw badRequest('Phone number must be 10 digits.');
  if (!isPin(req.body.pin)) throw badRequest('PIN must be 4–6 digits.');

  const owner = req.user.doc;
  const hashed = await User.hashPin(req.body.pin);
  const existing = owner.phoneCredentials.find((c) => c.phone === phone);
  if (existing) existing.pin = hashed;
  else owner.phoneCredentials.push({ phone, pin: hashed });
  if (!owner.allowedPhones.includes(phone)) owner.allowedPhones.push(phone);
  await owner.save();

  await logAudit(req, { module: 'Security', action: existing ? 'UPDATE' : 'CREATE', fieldName: 'Owner PIN', newValue: `******${phone.slice(-4)}`, description: `${existing ? 'Changed PIN for' : 'Added'} owner login ******${phone.slice(-4)}` });
  res.json({ ok: true, phones: owner.allowedPhones });
});

router.delete('/owner-phones/:phone', authenticate, requireOwner, async (req, res) => {
  const phone = cleanPhone(req.params.phone);
  const owner = req.user.doc;
  if (phone === req.user.phone) throw badRequest('You cannot remove the phone you are logged in with.');
  if (owner.allowedPhones.length <= 1) throw badRequest('At least one owner phone is required.');
  owner.allowedPhones = owner.allowedPhones.filter((p) => p !== phone);
  owner.phoneCredentials = owner.phoneCredentials.filter((c) => c.phone !== phone);
  await owner.save();
  await logAudit(req, { module: 'Security', action: 'DELETE', fieldName: 'Owner PIN', oldValue: `******${phone.slice(-4)}`, description: `Removed owner login ******${phone.slice(-4)}` });
  res.json({ ok: true, phones: owner.allowedPhones });
});

module.exports = router;
