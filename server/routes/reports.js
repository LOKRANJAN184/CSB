const express = require('express');
const DailySales = require('../models/DailySales');
const Attendance = require('../models/Attendance');
const Staff = require('../models/Staff');
const { authenticate, requireOwner, requireSingleBranch, signDownloadToken } = require('../middleware/auth');
const { badRequest } = require('../lib/http');
const { isDate, isMonth, daysInclusive, eachDate, daysInMonth, today } = require('../lib/dates');
const { buildReportPdf, inr, dmy } = require('../services/pdf');
const { logAudit } = require('../services/audit');

const router = express.Router();
router.use(authenticate);

const MAX_RANGE_DAYS = 62;

function readRange(q) {
  const { from, to } = q;
  if (!isDate(from) || !isDate(to)) throw badRequest('Choose a From and To date.');
  if (to < from) throw badRequest('"From" must be before "To".');
  if (daysInclusive(from, to) > MAX_RANGE_DAYS) throw badRequest(`Choose ${MAX_RANGE_DAYS} days or fewer.`);
  return { from, to };
}

const round2 = (n) => Math.round(n * 100) / 100;

/** Add up a list of DailySales records. */
function sumSales(records) {
  const t = records.reduce(
    (acc, r) => {
      acc.systemSales += r.systemSales || 0;
      acc.expenses += r.totalExpenses || 0;
      acc.cash += r.totalCash || 0;
      acc.gpay += r.totalGpay || 0;
      if (r.isTallied) acc.talliedDays += 1;
      else acc.mismatchDays += 1;
      return acc;
    },
    { systemSales: 0, expenses: 0, cash: 0, gpay: 0, talliedDays: 0, mismatchDays: 0 }
  );
  t.accounted = round2(t.expenses + t.cash + t.gpay);
  t.difference = round2(t.accounted - t.systemSales);
  t.days = records.length;
  return t;
}

/** Sales for one branch, or every branch when branchId is 'all'. */
async function salesForRange(req, from, to) {
  const branches = req.branchId === 'all' ? req.branches : [req.branch].filter(Boolean);
  const ids = branches.map((b) => b._id);
  const records = await DailySales.find({ branchId: { $in: ids }, date: { $gte: from, $lte: to } })
    .sort({ date: 1 })
    .select('-expenses.photoFilename')
    .lean();
  const dates = eachDate(from, to);
  const byBranch = branches.map((b) => {
    const byDate = new Map(records.filter((r) => String(r.branchId) === String(b._id)).map((r) => [r.date, r]));
    const list = dates.map((date) => byDate.get(date) || {
      date,
      systemSales: 0,
      totalExpenses: 0,
      totalCash: 0,
      totalGpay: 0,
      totalAccounted: 0,
      difference: 0,
      isTallied: true,
    });
    return { branchId: b._id, branchName: b.name, totals: sumSales(list), records: list };
  });
  return { byBranch, totals: sumSales(records) };
}

/** Attendance counts and salary for one branch over a date range. */
async function attendanceForRange(branchId, from, to, staffId) {
  const [days, staff] = await Promise.all([
    Attendance.find({ branchId, date: { $gte: from, $lte: to } }).sort({ date: 1 }).lean(),
    Staff.find({ branchId }).lean(),
  ]);
  const people = new Map(
    staff.map((s) => [String(s._id), { staffId: String(s._id), name: s.name, role: s.role, isActive: s.isActive, dailySalary: s.dailySalary || s.wageRate || 0, present: 0, halfDay: 0, absent: 0 }])
  );
  const entries = [];
  for (const day of days) {
    for (const r of day.records) {
      const id = String(r.staffId);
      if (staffId && id !== staffId) continue;
      if (!people.has(id)) people.set(id, { staffId: id, name: r.staffName, role: 'Staff', isActive: false, dailySalary: 0, present: 0, halfDay: 0, absent: 0 });
      const p = people.get(id);
      if (r.status === 'Present') p.present++;
      else if (r.status === 'Half-day') p.halfDay++;
      else p.absent++;
      entries.push({ date: day.date, staffId: id, staffName: r.staffName, status: r.status, inTime: r.inTime, outTime: r.outTime });
    }
  }
  const summary = [...people.values()]
    .filter((p) => (staffId ? p.staffId === staffId : p.isActive || p.present + p.halfDay + p.absent > 0))
    .map((p) => {
      const payableDays = p.present + p.halfDay * 0.5;
      return { ...p, payableDays, salary: Math.round(payableDays * p.dailySalary) };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  return { daysRecorded: days.length, entries, summary, totalSalary: summary.reduce((s, p) => s + p.salary, 0) };
}

// ---------------------------------------------------------------------------

// GET /api/reports/calendar?month=YYYY-MM — coloured dots on the Records calendar
router.get('/calendar', requireSingleBranch, async (req, res) => {
  const { month } = req.query;
  if (!isMonth(month)) throw badRequest('Invalid month.');
  const range = { $gte: `${month}-01`, $lte: `${month}-31` };
  const [sales, att] = await Promise.all([
    DailySales.find({ branchId: req.branchId, date: range }).select('date isTallied difference systemSales').lean(),
    Attendance.find({ branchId: req.branchId, date: range }).select('date').lean(),
  ]);
  const days = {};
  for (const s of sales) days[s.date] = { sales: true, tallied: s.isTallied, difference: s.difference, systemSales: s.systemSales };
  for (const a of att) days[a.date] = { ...(days[a.date] || {}), attendance: true };
  res.json({ ok: true, month, days });
});

// GET /api/reports/monthly?month=YYYY-MM — owner's month overview
router.get('/monthly', requireOwner, async (req, res) => {
  const { month } = req.query;
  if (!isMonth(month)) throw badRequest('Invalid month.');
  const from = `${month}-01`;
  const monthEnd = `${month}-${String(daysInMonth(month)).padStart(2, '0')}`;
  const currentToday = today();
  const to = month === currentToday.slice(0, 7) ? currentToday : monthEnd;
  const sales = await salesForRange(req, from, to);
  const attendance = req.branchId === 'all' ? null : await attendanceForRange(req.branchId, from, to);
  res.json({
    ok: true, month, from, to,
    totals: sales.totals,
    byBranch: sales.byBranch.map(({ records, ...rest }) => ({ ...rest, daily: records.map((r) => ({ date: r.date, systemSales: r.systemSales, difference: r.difference, isTallied: r.isTallied })) })),
    attendance: attendance && { daysRecorded: attendance.daysRecorded, summary: attendance.summary, totalSalary: attendance.totalSalary },
  });
});

// GET /api/reports/sales?from&to
router.get('/sales', requireOwner, async (req, res) => {
  const { from, to } = readRange(req.query);
  res.json({ ok: true, from, to, allBranches: req.branchId === 'all', ...(await salesForRange(req, from, to)) });
});

// GET /api/reports/attendance?from&to&staffId
router.get('/attendance', requireOwner, requireSingleBranch, async (req, res) => {
  const { from, to } = readRange(req.query);
  res.json({ ok: true, from, to, ...(await attendanceForRange(req.branchId, from, to, req.query.staffId)) });
});

// POST /api/reports/download-token — a 2-minute token for opening a PDF link
router.post('/download-token', requireOwner, (req, res) => {
  res.json({ ok: true, token: signDownloadToken(req.user) });
});

// ---------------------------------------------------------------------------
// PDFs
// ---------------------------------------------------------------------------
const sendPdf = (res, buffer, filename) => {
  res.set('Content-Type', 'application/pdf');
  res.set('Content-Disposition', `inline; filename="${filename}"`);
  res.send(buffer);
};
const diffCell = (d) => ({ text: d === 0 ? 'Tallied' : `${d > 0 ? '+' : ''}${inr(d)}`, color: d === 0 ? 'good' : 'bad' });

// GET /api/reports/sales.pdf?from&to&branchId&dl
router.get('/sales.pdf', requireOwner, async (req, res) => {
  const { from, to } = readRange(req.query);
  const { byBranch, totals } = await salesForRange(req, from, to);
  const all = req.branchId === 'all';

  const columns = all
    ? [{ label: 'Branch', width: 0.25 }, { label: 'Days', width: 0.08, align: 'right' }, { label: 'System Sales', width: 0.15, align: 'right' }, { label: 'Expenses', width: 0.13, align: 'right' }, { label: 'Cash', width: 0.13, align: 'right' }, { label: 'GPay', width: 0.13, align: 'right' }, { label: 'Difference', width: 0.13, align: 'right' }]
    : [{ label: 'Date', width: 0.14 }, { label: 'System Sales', width: 0.16, align: 'right' }, { label: 'Expenses', width: 0.14, align: 'right' }, { label: 'Cash', width: 0.14, align: 'right' }, { label: 'GPay', width: 0.14, align: 'right' }, { label: 'Accounted', width: 0.14, align: 'right' }, { label: 'Difference', width: 0.14, align: 'right' }];

  const rows = all
    ? byBranch.map((b) => [b.branchName, String(b.totals.days), inr(b.totals.systemSales), inr(b.totals.expenses), inr(b.totals.cash), inr(b.totals.gpay), diffCell(b.totals.difference)])
    : byBranch[0].records.map((r) => [dmy(r.date), inr(r.systemSales), inr(r.totalExpenses), inr(r.totalCash), inr(r.totalGpay), inr(r.totalAccounted), diffCell(r.difference)]);

  const totalRow = all
    ? ['Total', String(totals.days), inr(totals.systemSales), inr(totals.expenses), inr(totals.cash), inr(totals.gpay), diffCell(totals.difference).text]
    : ['Total', inr(totals.systemSales), inr(totals.expenses), inr(totals.cash), inr(totals.gpay), inr(totals.accounted), diffCell(totals.difference).text];

  const pdf = await buildReportPdf({
    title: `Sales report — ${req.branchName}`,
    subtitle: `${dmy(from)} to ${dmy(to)}`,
    summary: [
      ['System sales', inr(totals.systemSales)],
      ['Cash + GPay', inr(totals.cash + totals.gpay)],
      ['Expenses', inr(totals.expenses)],
      ['Net difference', diffCell(totals.difference).text, totals.difference === 0 ? 'good' : 'bad'],
    ],
    columns, rows, totalRow,
  });
  await logAudit(req, { recordDate: to, module: 'Reports', action: 'DOWNLOAD_PDF', fieldName: 'Sales PDF', newValue: `${from} to ${to}`, description: `Downloaded sales PDF for ${req.branchName} (${from} to ${to})` });
  sendPdf(res, pdf, `Sales_${from}_to_${to}.pdf`);
});

// GET /api/reports/attendance.pdf?from&to&staffId&branchId&dl
router.get('/attendance.pdf', requireOwner, requireSingleBranch, async (req, res) => {
  const { from, to } = readRange(req.query);
  const data = await attendanceForRange(req.branchId, from, to, req.query.staffId);
  const pdf = await buildReportPdf({
    title: `Attendance & salary — ${req.branchName}`,
    subtitle: `${dmy(from)} to ${dmy(to)} · ${data.daysRecorded} day(s) recorded`,
    summary: [
      ['Staff', String(data.summary.length)],
      ['Days recorded', String(data.daysRecorded)],
      ['Total salary', inr(data.totalSalary)],
    ],
    columns: [
      { label: 'Staff', width: 0.26 }, { label: 'Present', width: 0.1, align: 'right' }, { label: 'Half day', width: 0.1, align: 'right' },
      { label: 'Absent', width: 0.1, align: 'right' }, { label: 'Payable days', width: 0.14, align: 'right' },
      { label: 'Per day', width: 0.14, align: 'right' }, { label: 'Salary', width: 0.16, align: 'right' },
    ],
    rows: data.summary.map((p) => [p.name, String(p.present), String(p.halfDay), String(p.absent), String(p.payableDays), inr(p.dailySalary), inr(p.salary)]),
    totalRow: ['Total', '', '', '', '', '', inr(data.totalSalary)],
  });
  await logAudit(req, { recordDate: to, module: 'Reports', action: 'DOWNLOAD_PDF', fieldName: 'Attendance PDF', newValue: `${from} to ${to}`, description: `Downloaded attendance PDF for ${req.branchName} (${from} to ${to})` });
  sendPdf(res, pdf, `Attendance_${from}_to_${to}.pdf`);
});

module.exports = router;
