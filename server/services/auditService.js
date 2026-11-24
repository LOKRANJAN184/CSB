const AuditLog = require('../models/AuditLog');
const { getIO } = require('../socket');

const cleanText = (str) => {
  if (!str || typeof str !== 'string') return str;
  return str
    .replace(/\s*\([^)]*[\u0B80-\u0BFF][^)]*\)/g, '')
    .replace(/[\u0B80-\u0BFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
};

/**
 * Log a single audit entry
 */
const logAudit = async ({
  branchId = null,
  branchName = '',
  recordDate = '',
  module,
  action,
  fieldName = '',
  oldValue = null,
  newValue = null,
  performedBy,
  description = '',
}) => {
  try {
    const rawName = (performedBy && (performedBy.name || (performedBy.role === 'owner' ? 'Owner' : 'Shop Manager'))) || 'User';
    const cleanPerformedName = cleanText(rawName);
    const cleanBranch = cleanText(branchName || (performedBy && performedBy.branchName) || '');
    const cleanDesc = cleanText(description);

    const entry = new AuditLog({
      branchId: branchId || (performedBy && performedBy.branchId) || null,
      branchName: cleanBranch,
      recordDate,
      module,
      action,
      fieldName: cleanText(fieldName),
      oldValue: typeof oldValue === 'string' ? cleanText(oldValue) : oldValue,
      newValue: typeof newValue === 'string' ? cleanText(newValue) : newValue,
      performedBy: {
        userId: performedBy.userId || performedBy._id,
        name: cleanPerformedName,
        role: performedBy.role,
      },
      description: cleanDesc,
      timestamp: new Date(),
    });
    await entry.save();

    // Broadcast audit event via real-time socket
    try {
      const io = getIO();
      if (io) {
        io.emit('audit_logged', entry);
      }
    } catch (socketErr) {
      // socket might not be initialized during initial seed
    }

    return entry;
  } catch (err) {
    console.error('[AuditService] Failed to record audit log:', err.message);
  }
};

/**
 * Helper to compare sales record modifications and log each difference
 */
const logSalesDiff = async (existingSales, updatedData, user, date) => {
  const fields = ['systemSales', 'totalCash', 'totalGpay', 'notes'];
  
  for (const field of fields) {
    if (updatedData[field] !== undefined) {
      const oldVal = existingSales[field];
      const newVal = updatedData[field];
      if (oldVal !== newVal) {
        await logAudit({
          recordDate: date,
          module: 'Sales',
          action: 'UPDATE',
          fieldName: field,
          oldValue: oldVal,
          newValue: newVal,
          performedBy: user,
          description: `Updated ${field} from ₹${oldVal} to ₹${newVal}`,
        });
      }
    }
  }

  // Check expense changes
  const oldExpenses = existingSales.expenses || [];
  const newExpenses = updatedData.expenses || [];

  // Log newly added or modified expenses
  for (let i = 0; i < newExpenses.length; i++) {
    const newExp = newExpenses[i];
    const oldExp = oldExpenses[i];

    if (!oldExp) {
      await logAudit({
        recordDate: date,
        module: 'Expenses',
        action: 'CREATE',
        fieldName: `Expense [${newExp.note}]`,
        oldValue: null,
        newValue: `₹${newExp.amount} (${newExp.note})`,
        performedBy: user,
        description: `Added new expense: ₹${newExp.amount} for "${newExp.note}"`,
      });
      if (newExp.photoUrl) {
        await logAudit({
          recordDate: date,
          module: 'Expenses',
          action: 'PHOTO_ADD',
          fieldName: `Bill Photo for [${newExp.note}]`,
          oldValue: null,
          newValue: newExp.photoUrl,
          performedBy: user,
          description: `Attached bill photo for expense "${newExp.note}"`,
        });
      }
    } else {
      if (oldExp.amount !== newExp.amount || oldExp.note !== newExp.note) {
        await logAudit({
          recordDate: date,
          module: 'Expenses',
          action: 'UPDATE',
          fieldName: `Expense [${oldExp.note}]`,
          oldValue: `₹${oldExp.amount} - ${oldExp.note}`,
          newValue: `₹${newExp.amount} - ${newExp.note}`,
          performedBy: user,
          description: `Modified expense from ₹${oldExp.amount} (${oldExp.note}) to ₹${newExp.amount} (${newExp.note})`,
        });
      }

      // Check photo replacement
      if (oldExp.photoUrl !== newExp.photoUrl) {
        if (!oldExp.photoUrl && newExp.photoUrl) {
          await logAudit({
            recordDate: date,
            module: 'Expenses',
            action: 'PHOTO_ADD',
            fieldName: `Bill Photo for [${newExp.note}]`,
            oldValue: null,
            newValue: newExp.photoUrl,
            performedBy: user,
            description: `Attached bill photo for "${newExp.note}"`,
          });
        } else if (oldExp.photoUrl && !newExp.photoUrl) {
          await logAudit({
            recordDate: date,
            module: 'Expenses',
            action: 'PHOTO_DELETE',
            fieldName: `Bill Photo for [${newExp.note}]`,
            oldValue: oldExp.photoUrl,
            newValue: null,
            performedBy: user,
            description: `Removed bill photo from "${newExp.note}"`,
          });
        } else if (oldExp.photoUrl && newExp.photoUrl && oldExp.photoUrl !== newExp.photoUrl) {
          await logAudit({
            recordDate: date,
            module: 'Expenses',
            action: 'PHOTO_REPLACE',
            fieldName: `Bill Photo for [${newExp.note}]`,
            oldValue: oldExp.photoUrl,
            newValue: newExp.photoUrl,
            performedBy: user,
            description: `Replaced bill photo for "${newExp.note}"`,
          });
        }
      }
    }
  }

  // Check removed expenses
  if (oldExpenses.length > newExpenses.length) {
    for (let i = newExpenses.length; i < oldExpenses.length; i++) {
      const removed = oldExpenses[i];
      await logAudit({
        recordDate: date,
        module: 'Expenses',
        action: 'DELETE',
        fieldName: `Expense [${removed.note}]`,
        oldValue: `₹${removed.amount} - ${removed.note}`,
        newValue: null,
        performedBy: user,
        description: `Deleted expense entry of ₹${removed.amount} for "${removed.note}"`,
      });
      if (removed.photoUrl) {
        await logAudit({
          recordDate: date,
          module: 'Expenses',
          action: 'PHOTO_DELETE',
          fieldName: `Bill Photo for [${removed.note}]`,
          oldValue: removed.photoUrl,
          newValue: null,
          performedBy: user,
          description: `Deleted bill photo attached to removed expense "${removed.note}"`,
        });
      }
    }
  }
};

/**
 * Compare attendance record modifications and log each difference
 */
const logAttendanceDiff = async (existingAttendance, newRecords, user, date) => {
  const oldMap = new Map();
  (existingAttendance.records || []).forEach(r => oldMap.set(r.staffId.toString(), r));

  for (const newRec of newRecords) {
    const oldRec = oldMap.get(newRec.staffId.toString());
    if (!oldRec) {
      await logAudit({
        recordDate: date,
        module: 'Attendance',
        action: 'CREATE',
        fieldName: `${newRec.staffName} Attendance`,
        oldValue: null,
        newValue: `${newRec.status} (${newRec.inTime || 'N/A'} - ${newRec.outTime || 'N/A'})`,
        performedBy: user,
        description: `Marked attendance for ${newRec.staffName}: ${newRec.status}`,
      });
    } else {
      if (oldRec.status !== newRec.status) {
        await logAudit({
          recordDate: date,
          module: 'Attendance',
          action: 'UPDATE',
          fieldName: `${newRec.staffName} Status`,
          oldValue: oldRec.status,
          newValue: newRec.status,
          performedBy: user,
          description: `Changed ${newRec.staffName} status from ${oldRec.status} to ${newRec.status}`,
        });
      }
      if ((oldRec.inTime || '') !== (newRec.inTime || '') || (oldRec.outTime || '') !== (newRec.outTime || '')) {
        await logAudit({
          recordDate: date,
          module: 'Attendance',
          action: 'UPDATE',
          fieldName: `${newRec.staffName} Timing`,
          oldValue: `${oldRec.inTime || ''} - ${oldRec.outTime || ''}`,
          newValue: `${newRec.inTime || ''} - ${newRec.outTime || ''}`,
          performedBy: user,
          description: `Updated timings for ${newRec.staffName} to In: ${newRec.inTime || ''}, Out: ${newRec.outTime || ''}`,
        });
      }
    }
  }
};

module.exports = {
  logAudit,
  logSalesDiff,
  logAttendanceDiff,
};

