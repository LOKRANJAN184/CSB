const express = require('express');
const mongoose = require('mongoose');
const DailySales = require('../models/DailySales');
const Photo = require('../models/Photo');
const { authenticate, requireSingleBranch, canEditDate } = require('../middleware/auth');
const { badRequest, forbidden, money, str, actor } = require('../lib/http');
const { isDate, today } = require('../lib/dates');
const { logAudit, logSalesChanges } = require('../services/audit');

const router = express.Router();
router.use(authenticate, requireSingleBranch);

const empty = (date) => ({
  date, systemSales: 0, expenses: [], totalExpenses: 0, totalCash: 0, totalGpay: 0,
  totalAccounted: 0, difference: 0, isTallied: true, notes: '',
});

// GET /api/sales/:date
router.get('/:date', async (req, res) => {
  const { date } = req.params;
  if (!isDate(date)) throw badRequest('Invalid date.');
  const record = await DailySales.findOne({ branchId: req.branchId, date }).lean();
  res.json({ ok: true, exists: Boolean(record), canEdit: canEditDate(req.user, date), today: today(), record: record || empty(date) });
});

// PUT /api/sales/:date — create or replace the day's tally
router.put('/:date', async (req, res) => {
  const { date } = req.params;
  if (!isDate(date)) throw badRequest('Invalid date.');
  if (!canEditDate(req.user, date)) throw forbidden(`Shop managers can only edit today's entry.`);
  if (date > today()) throw badRequest('You cannot enter sales for a future date.');

  const body = req.body || {};
  // Business rule: ONE expense entry per day (one amount, one note, one bill photo).
  const rawExpenses = (Array.isArray(body.expenses) ? body.expenses : []).filter((e) => money(e.amount) > 0 || e.photoId);
  if (rawExpenses.length > 1) throw badRequest('Only one expense entry is allowed per day.');
  const expenses = rawExpenses
    .map((e) => ({
      amount: money(e.amount),
      note: str(e.note, 120) || 'Expense',
      photoId: mongoose.isValidObjectId(e.photoId) ? e.photoId : undefined,
      photoUrl: str(e.photoUrl, 300),
      photoFilename: str(e.photoFilename, 200),
    }))
    .filter((e) => e.amount > 0 || e.photoId);

  const next = {
    systemSales: money(body.systemSales),
    totalCash: money(body.totalCash),
    totalGpay: money(body.totalGpay),
    notes: str(body.notes, 500),
    expenses,
  };

  let record = await DailySales.findOne({ branchId: req.branchId, date });
  const isNew = !record;
  const before = record ? record.toObject() : null;

  if (isNew) {
    record = new DailySales({ branchId: req.branchId, date, submittedBy: actor(req.user) });
  }
  record.set({ ...next, lastUpdatedBy: actor(req.user) });
  await record.save(); // the pre-save hook recalculates the tally

  if (isNew) {
    await logAudit(req, {
      recordDate: date, module: 'Sales', action: 'CREATE', fieldName: 'Daily Sales',
      newValue: `System ₹${record.systemSales}, Cash ₹${record.totalCash}, GPay ₹${record.totalGpay}, Expenses ₹${record.totalExpenses}`,
      description: `Sales entered for ${date}: ${record.isTallied ? 'tallied' : `difference ₹${record.difference}`}`,
    });
  } else {
    await logSalesChanges(req, before, record, date);
    // Delete photos that were attached before but have now been removed.
    const keep = new Set(record.expenses.map((e) => String(e.photoId || '')));
    const removed = before.expenses.map((e) => e.photoId).filter((id) => id && !keep.has(String(id)));
    if (removed.length) {
      await Photo.deleteMany({ _id: { $in: removed } });
      await logAudit(req, { recordDate: date, module: 'Expenses', action: 'PHOTO_DELETE', fieldName: 'Bill Photo', description: `${removed.length} bill photo(s) removed for ${date}` });
    }
  }
  const added = record.expenses.filter((e) => e.photoId && !(before?.expenses || []).some((b) => String(b.photoId) === String(e.photoId)));
  if (added.length) {
    await logAudit(req, { recordDate: date, module: 'Expenses', action: 'PHOTO_ADD', fieldName: 'Bill Photo', description: `${added.length} bill photo(s) attached for ${date}` });
  }

  res.json({ ok: true, record });
});

module.exports = router;
