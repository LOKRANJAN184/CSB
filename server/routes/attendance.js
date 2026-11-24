const express = require('express');
const router = express.Router();
const Attendance = require('../models/Attendance');
const Staff = require('../models/Staff');
const { authenticate, enforceEditPermissions } = require('../middleware/auth');
const { logAudit, logAttendanceDiff } = require('../services/auditService');
const { emitRealtimeUpdate } = require('../socket');

// GET /api/attendance/:date - Get attendance for a date
router.get('/:date', authenticate, async (req, res) => {
  try {
    const { date } = req.params;
    let record = await Attendance.findOne({ date, branchId: req.branchId });

    // Fetch all active staff for this branch
    const activeStaff = await Staff.find({ branchId: req.branchId, isActive: true }).sort({ name: 1 });

    if (!record) {
      // Build default template based on current active staff
      const defaultRecords = activeStaff.map(s => ({
        staffId: s._id,
        staffName: s.name,
        status: 'Present',
        inTime: '08:00 AM',
        outTime: '09:00 PM',
        notes: '',
      }));

      return res.json({
        success: true,
        exists: false,
        data: {
          date,
          records: defaultRecords,
        },
      });
    }

    // Merge any newly added staff who aren't yet in this day's record
    const existingStaffIds = new Set(record.records.map(r => r.staffId.toString()));
    const missingStaff = activeStaff
      .filter(s => !existingStaffIds.has(s._id.toString()))
      .map(s => ({
        staffId: s._id,
        staffName: s.name,
        status: 'Present',
        inTime: '08:00 AM',
        outTime: '09:00 PM',
        notes: '',
      }));

    if (missingStaff.length > 0) {
      record.records.push(...missingStaff);
    }

    res.json({
      success: true,
      exists: true,
      data: record,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/attendance - Save or update attendance
router.post('/', authenticate, enforceEditPermissions, async (req, res) => {
  try {
    const { date, records } = req.body;

    if (!date || !Array.isArray(records)) {
      return res.status(400).json({ success: false, message: 'Valid date and staff records array required.' });
    }

    let existing = await Attendance.findOne({ date, branchId: req.branchId });

    if (!existing) {
      const newAttendance = new Attendance({
        branchId: req.branchId,
        date,
        records: records.map(r => ({
          staffId: r.staffId,
          staffName: r.staffName,
          status: r.status || 'Present',
          inTime: r.inTime || '08:00 AM',
          outTime: r.outTime || '09:00 PM',
          notes: r.notes || '',
        })),
        markedBy: {
          userId: req.user.userId,
          name: req.user.name,
          role: req.user.role,
        },
        lastUpdatedBy: {
          userId: req.user.userId,
          name: req.user.name,
          role: req.user.role,
        },
      });

      await newAttendance.save();

      // Log audit
      await logAudit({
        recordDate: date,
        module: 'Attendance',
        action: 'CREATE',
        fieldName: 'Staff Attendance',
        oldValue: null,
        newValue: `${records.length} staff marked`,
        performedBy: req.user,
        description: `Marked daily attendance for ${records.length} staff members on ${date}`,
      });

      emitRealtimeUpdate('attendance_updated', {
        date,
        action: 'CREATE',
        record: newAttendance,
        updatedBy: req.user,
        message: `${req.user.name} marked attendance for ${date}`,
      });

      return res.status(201).json({
        success: true,
        message: 'Attendance saved successfully!',
        data: newAttendance,
      });
    } else {
      // Audit differences
      await logAttendanceDiff(existing, records, req.user, date);

      existing.records = records.map(r => ({
        staffId: r.staffId,
        staffName: r.staffName,
        status: r.status || 'Present',
        inTime: r.inTime || '08:00 AM',
        outTime: r.outTime || '09:00 PM',
        notes: r.notes || '',
      }));
      existing.lastUpdatedBy = {
        userId: req.user.userId,
        name: req.user.name,
        role: req.user.role,
      };

      await existing.save();

      emitRealtimeUpdate('attendance_updated', {
        date,
        action: 'UPDATE',
        record: existing,
        updatedBy: req.user,
        message: `${req.user.name} updated attendance for ${date}`,
      });

      return res.json({
        success: true,
        message: 'Attendance updated successfully!',
        data: existing,
      });
    }
  } catch (err) {
    console.error('[AttendanceRoute] Error saving attendance:', err);
    res.status(500).json({ success: false, message: 'Failed to save attendance: ' + err.message });
  }
});

module.exports = router;

