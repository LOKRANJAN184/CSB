const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  branchId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Branch',
    index: true,
  },
  branchName: {
    type: String,
    default: '',
    index: true,
  },
  recordDate: {
    type: String, // 'YYYY-MM-DD'
    index: true,
  },
  module: {
    type: String, // 'Sales', 'Expenses', 'Attendance', 'Staff', 'Auth'
    required: true,
    index: true,
  },
  action: {
    type: String, // 'CREATE', 'UPDATE', 'DELETE', 'PHOTO_ADD', 'PHOTO_REPLACE', 'PHOTO_DELETE'
    required: true,
  },
  fieldName: {
    type: String,
    default: '',
  },
  oldValue: {
    type: mongoose.Schema.Types.Mixed,
    default: null,
  },
  newValue: {
    type: mongoose.Schema.Types.Mixed,
    default: null,
  },
  performedBy: {
    userId: String,
    name: {
      type: String,
      required: true,
    },
    role: {
      type: String, // 'owner' or 'manager'
      required: true,
    },
  },
  description: {
    type: String,
    default: '',
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true,
  },
}, { timestamps: true });

module.exports = mongoose.model('AuditLog', auditLogSchema);

