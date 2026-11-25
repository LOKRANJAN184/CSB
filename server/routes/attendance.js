const express = require('express');
const mongoose = require('mongoose');
const Attendance = require('../models/Attendance');
const Staff = require('../models/Staff');
const { authenticate, requireSingleBranch, canEditDate } = require('../middleware/auth');
const { badRequest, forbidden, str, actor } = require('../lib/http');
const { isDate, today } = require('../lib/dates');
const { logAudit, logAttendanceChanges } = require('../services/audit');

const router = express.Router();
router.use(authenticate, requireSingleBranch);

const STATUSES = ['Present', 'Half-day', 'Absent'];
const TIME_RE = /^(0[1-9]|1[0-2]):[0-5]\d (AM|PM)$/; // stored as "08:00 AM"
const defaultRow = (s) => ({ staffId: s._id, staffName: s.name, status: 'Present', inTime: '08:00 AM', outTime: '09:00 PM', notes: '' });

// GET /api/attendance/:date — the saved day, plus any active staff not yet in it
router.get('/:date', async (req, res) => {
  const { date } = req.params;
  if (!isDate(date)) throw badRequest('Invalid date.');
  const [record, staff] = await Promise.all([
    Attendance.findOne({ branchId: req.branchId, date }).lean(),
    Staff.find({ branchId: req.branchId, isActive: true }).sort({ name: 1 }).lean(),
  ]);

  const rows = record ? [...record.records] : [];
  const known = new Set(rows.map((r) => String(r.staffId)));
  staff.filter((s) => !known.has(String(s._id))).forEach((s) => rows.push(defaultRow(s)));

  res.json({ ok: true, exists: Boolean(record), canEdit: canEditDate(req.user, date), today: today(), date, records: rows });
});

// PUT /api/attendance/:date   body: { records: [{ staffId, staffName, status, inTime, outTime, notes }] }
router.put('/:date', async (req, res) => {
  const { date } = req.params;
  if (!isDate(date)) throw badRequest('Invalid date.');
  if (!canEditDate(req.user, date)) throw forbidden(`Shop managers can only edit today's attendance.`);
  if (date > today()) throw badRequest('You cannot mark attendance for a future date.');

  const input = Array.isArray(req.body?.records) ? req.body.records : [];
  const records = input
    .filter((r) => mongoose.isValidObjectId(r.staffId))
    .map((r) => ({
      staffId: r.staffId,
      staffName: str(r.staffName, 80) || 'Staff',
      status: STATUSES.includes(r.status) ? r.status : 'Present',
      inTime: TIME_RE.test(r.inTime) ? r.inTime : '08:00 AM',
      outTime: TIME_RE.test(r.outTime) ? r.outTime : '09:00 PM',
      notes: str(r.notes, 200),
    }));
  if (!records.length) throw badRequest('No staff to save.');

  let doc = await Attendance.findOne({ branchId: req.branchId, date });
  if (doc) {
    await logAttendanceChanges(req, doc.records, records, date);
    doc.records = records;
    doc.lastUpdatedBy = actor(req.user);
  } else {
    doc = new Attendance({ branchId: req.branchId, date, records, markedBy: actor(req.user), lastUpdatedBy: actor(req.user) });
    const present = records.filter((r) => r.status !== 'Absent').length;
    await logAudit(req, { recordDate: date, module: 'Attendance', action: 'CREATE', fieldName: 'Staff Attendance', newValue: `${present}/${records.length} present`, description: `Attendance marked for ${date}: ${present} of ${records.length} present` });
  }
  await doc.save();
  res.json({ ok: true, records: doc.records });
});

module.exports = router;
