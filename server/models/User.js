const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// One document per login account. There is one "owner" account (who can log in
// from several phone numbers, each with its own PIN) and one "manager" account
// per branch (who can only log in from ONE approved device).

const deviceSchema = new mongoose.Schema(
  {
    deviceId: { type: String, default: '' },
    deviceName: { type: String, default: '' },
    approvedAt: Date,
    lastActiveAt: Date,
    approvedBy: { type: String, default: '' },
  },
  { _id: false }
);

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true, lowercase: true },
  name: { type: String, required: true },
  role: { type: String, enum: ['owner', 'manager'], required: true },
  branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', index: true },

  // Hashed PIN (managers). Older records also have `password`; we accept either.
  pin: { type: String, required: true },
  password: { type: String },
  phone: { type: String, default: '' },

  // Owner only: the phone numbers allowed to log in, each with its own hashed PIN.
  allowedPhones: { type: [String], default: [] },
  phoneCredentials: [{ phone: { type: String, required: true }, pin: { type: String, required: true } }],

  // Manager only: device lock.
  approvedDevice: deviceSchema,
  pendingDevice: {
    deviceId: { type: String, default: '' },
    deviceName: { type: String, default: '' },
    requestedAt: Date,
    status: { type: String, enum: ['none', 'pending', 'rejected'], default: 'none' },
    ip: { type: String, default: '' },
  },
  blockedDevices: [
    {
      deviceId: { type: String, required: true },
      deviceName: { type: String, default: 'Shop Device' },
      blockedAt: { type: Date, default: Date.now },
      blockedBy: { type: String, default: 'Owner' },
      reason: { type: String, default: '' },
    },
  ],

  // Brute-force protection: a 4-digit PIN only has 10,000 combinations.
  failedLogins: { type: Number, default: 0 },
  lockedUntil: Date,

  createdAt: { type: Date, default: Date.now },
});

userSchema.statics.hashPin = (pin) => bcrypt.hash(String(pin), 10);

/** Manager PIN check (also accepts the legacy `password` field). */
userSchema.methods.checkPin = async function (pin) {
  const candidate = String(pin);
  if (this.pin && (await bcrypt.compare(candidate, this.pin))) return true;
  if (this.password && (await bcrypt.compare(candidate, this.password))) return true;
  return false;
};

/** Owner PIN check for one specific phone number. */
userSchema.methods.checkPhonePin = async function (phone, pin) {
  if (!this.allowedPhones.includes(phone)) return false;
  const cred = this.phoneCredentials.find((c) => c.phone === phone);
  return Boolean(cred) && bcrypt.compare(String(pin), cred.pin);
};

userSchema.methods.isLocked = function () {
  return this.lockedUntil && this.lockedUntil > new Date();
};

userSchema.methods.registerFailedLogin = async function () {
  this.failedLogins = (this.failedLogins || 0) + 1;
  if (this.failedLogins >= 8) {
    this.lockedUntil = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
    this.failedLogins = 0;
  }
  await this.save();
};

userSchema.methods.registerSuccessfulLogin = async function () {
  if (this.failedLogins || this.lockedUntil) {
    this.failedLogins = 0;
    this.lockedUntil = undefined;
    await this.save();
  }
};

module.exports = mongoose.model('User', userSchema);
