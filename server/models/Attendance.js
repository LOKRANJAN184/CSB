const mongoose = require('mongoose');

const attendanceRecordSchema = new mongoose.Schema({
  staffId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Staff',
    required: true,
  },
  staffName: {
    type: String,
    required: true,
  },
  status: {
    type: String,
    enum: ['Present', 'Absent', 'Half-day'],
    default: 'Present',
  },
  inTime: {
    type: String,
    default: '08:00 AM',
  },
  outTime: {
    type: String,
    default: '09:00 PM',
  },
  notes: {
    type: String,
    default: '',
  },
});

const dailyAttendanceSchema = new mongoose.Schema({
  branchId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Branch',
    index: true,
  },
  date: {
    type: String, // Format 'YYYY-MM-DD'
    required: true,
    index: true,
  },
  records: [attendanceRecordSchema],
  markedBy: {
    userId: String,
    name: String,
    role: String,
  },
  lastUpdatedBy: {
    userId: String,
    name: String,
    role: String,
  },
}, { timestamps: true });

// Compound unique index per branch and date
dailyAttendanceSchema.index({ branchId: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('Attendance', dailyAttendanceSchema);

