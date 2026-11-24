const mongoose = require('mongoose');

const staffSchema = new mongoose.Schema({
  branchId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Branch',
    index: true,
  },
  name: {
    type: String,
    required: true,
    trim: true,
  },
  phone: {
    type: String,
    default: '',
    trim: true,
  },
  role: {
    type: String,
    default: 'Staff',
    trim: true, // e.g., 'Sweet Master', 'Bakery Chef', 'Counter Sales', 'Packaging'
  },
  dailySalary: {
    type: Number,
    default: 500, // Per day salary in ₹ (set by Owner only)
  },
  wageType: {
    type: String,
    enum: ['daily', 'monthly'],
    default: 'daily',
  },
  wageRate: {
    type: Number,
    default: 500, // Kept for backwards compatibility
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  joinedDate: {
    type: Date,
    default: Date.now,
  },
  createdBy: {
    type: String,
    default: 'System',
  },
}, { timestamps: true });

module.exports = mongoose.model('Staff', staffSchema);

