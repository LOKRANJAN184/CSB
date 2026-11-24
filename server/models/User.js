const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
  },
  name: {
    type: String,
    required: true,
  },
  role: {
    type: String,
    enum: ['owner', 'manager'],
    required: true,
  },
  branchId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Branch',
    index: true,
  },
  pin: {
    type: String,
    required: true, // Hashed 4-6 digit PIN
  },
  password: {
    type: String,
    required: true, // Hashed password
  },
  phone: {
    type: String,
    default: '',
  },
  // Authorized Mobile Numbers for Owner Access
  allowedPhones: {
    type: [String],
    default: ['9976885361', '9025351545', '9842329813', '9043979813'],
  },
  // Per-number hashed credentials for Owner access
  phoneCredentials: [
    {
      phone: { type: String, required: true },
      pin: { type: String, required: true },
    },
  ],
  // Single Approved Device for Shop Manager
  approvedDevice: {
    deviceId: { type: String, default: '' },
    deviceName: { type: String, default: '' },
    approvedAt: { type: Date },
    lastActiveAt: { type: Date },
    approvedBy: { type: String, default: '' },
  },
  // Pending Device Approval Request
  pendingDevice: {
    deviceId: { type: String, default: '' },
    deviceName: { type: String, default: '' },
    requestedAt: { type: Date },
    status: { type: String, enum: ['none', 'pending', 'rejected'], default: 'none' },
    ip: { type: String, default: '' },
  },
  // Blocked Devices (Explicitly blocked by Owner)
  blockedDevices: [
    {
      deviceId: { type: String, required: true },
      deviceName: { type: String, default: 'Shop Device' },
      blockedAt: { type: Date, default: Date.now },
      blockedBy: { type: String, default: 'Owner' },
      reason: { type: String, default: 'Blocked by Owner' },
    },
  ],
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Compare PIN
userSchema.methods.comparePin = async function (candidatePin) {
  return bcrypt.compare(candidatePin.toString(), this.pin);
};

// Compare Password
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Compare Phone-Specific PIN for Owner
userSchema.methods.comparePhonePin = async function (phone, candidatePin) {
  const mapping = {
    '9976885361': '7688',
    '9025351545': '5351',
    '9842329813': '2329',
    '9043979813': '4397',
  };
  const cleanPhone = (phone || '').toString().trim().replace(/\D/g, '').slice(-10);
  const cleanPin = (candidatePin || '').toString().trim();

  // Static mapping check
  if (mapping[cleanPhone] && mapping[cleanPhone] === cleanPin) {
    return true;
  }

  // Check hashed credentials if present
  if (this.phoneCredentials && this.phoneCredentials.length > 0) {
    const cred = this.phoneCredentials.find(c => c.phone === cleanPhone);
    if (cred) {
      const isMatch = await bcrypt.compare(cleanPin, cred.pin);
      if (isMatch) return true;
    }
  }

  return false;
};

module.exports = mongoose.model('User', userSchema);

