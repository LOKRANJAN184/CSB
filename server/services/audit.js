const AuditLog = require('../models/AuditLog');
const { actor } = require('../lib/http');

// The audit log ("Edit History") records who changed what, and when.
// Logging must never break the actual request, so errors are only printed.

async function logAudit(req, entry) {
  try {
    const user = req.user;
    await AuditLog.create({
      branchId: entry.branchId !== undefined ? entry.branchId : req.branchId && req.branchId !== 'all' ? req.branchId : null,
      branchName: entry.branchName !== undefined ? entry.branchName : req.branchName || '',
      recordDate: entry.recordDate || '',
      module: entry.module,
      action: entry.action,
      fieldName: entry.fieldName || '',
      oldValue: entry.oldValue ?? null,
      newValue: entry.newValue ?? null,
      performedBy: user ? actor(user) : entry.performedBy || { name: 'System', role: 'owner' },
      description: entry.description || '',
      timestamp: new Date(),
    });
  } catch (err) {
    console.error('[audit] failed to write log:', err.message);
  }
}

const rs = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

/** Write one audit entry for every sales field that actually changed. */
async function logSalesChanges(req, before, after, date) {
  const fields = [
    ['systemSales', 'System Sales'],
    ['totalCash', 'Cash'],
    ['totalGpay', 'GPay'],
    ['totalExpenses', 'Expenses'],
  ];
  for (const [key, label] of fields) {
    if (Number(before[key] || 0) !== Number(after[key] || 0)) {
      await logAudit(req, {
        recordDate: date,
        module: key === 'totalExpenses' ? 'Expenses' : 'Sales',
        action: 'UPDATE',
        fieldName: label,
        oldValue: rs(before[key]),
        newValue: rs(after[key]),
        description: `${label} changed from ${rs(before[key])} to ${rs(after[key])} for ${date}`,
      });
    }
  }
  if ((before.notes || '') !== (after.notes || '')) {
    await logAudit(req, {
      recordDate: date, module: 'Sales', action: 'UPDATE', fieldName: 'Notes',
      oldValue: before.notes || '', newValue: after.notes || '', description: `Notes changed for ${date}`,
    });
  }
}

/** Write one audit entry per staff member whose attendance changed. */
async function logAttendanceChanges(req, beforeRecords, afterRecords, date) {
  const old = new Map(beforeRecords.map((r) => [String(r.staffId), r]));
  for (const r of afterRecords) {
    const prev = old.get(String(r.staffId));
    if (!prev) continue;
    const changes = ['status', 'inTime', 'outTime']
      .filter((k) => (prev[k] || '') !== (r[k] || ''))
      .map((k) => `${k}: ${prev[k] || '-'} → ${r[k] || '-'}`);
    if (changes.length) {
      await logAudit(req, {
        recordDate: date, module: 'Attendance', action: 'UPDATE', fieldName: r.staffName,
        oldValue: `${prev.status} ${prev.inTime}-${prev.outTime}`,
        newValue: `${r.status} ${r.inTime}-${r.outTime}`,
        description: `${r.staffName}: ${changes.join(', ')} (${date})`,
      });
    }
  }
}

module.exports = { logAudit, logSalesChanges, logAttendanceChanges };
