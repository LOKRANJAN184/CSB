const express = require('express');
const router = express.Router();
const DailySales = require('../models/DailySales');
const Attendance = require('../models/Attendance');
const Staff = require('../models/Staff');
const Branch = require('../models/Branch');
const { authenticate, requireOwner } = require('../middleware/auth');
const { generateSalesHistoryPDF, generateAttendanceHistoryPDF, generateAllBranchesSalesPDF } = require('../services/pdfService');
const { logAudit } = require('../services/auditService');

// Helper to validate From and To dates (Max 1 month / 31 days)
const validateDateRange = (from, to) => {
  if (!from || !to) {
    return { valid: false, message: 'Both From and To dates are required.' };
  }
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(from) || !dateRegex.test(to)) {
    return { valid: false, message: 'Dates must be in format YYYY-MM-DD.' };
  }
  const dFrom = new Date(from);
  const dTo = new Date(to);
  if (isNaN(dFrom.getTime()) || isNaN(dTo.getTime())) {
    return { valid: false, message: 'Invalid date provided.' };
  }
  if (dTo < dFrom) {
    return { valid: false, message: 'From date must be earlier than or equal to To date.' };
  }
  const diffTime = Math.abs(dTo - dFrom);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
  if (diffDays > 31) {
    return { valid: false, message: 'Please select a period of 1 month or less.' };
  }
  return { valid: true, diffDays };
};

// Helper to get total days in a month (YYYY-MM)
const getDaysInMonth = (yearMonth) => {
  const [year, month] = yearMonth.split('-').map(Number);
  return new Date(year, month, 0).getDate();
};

// GET /api/reports/monthly - Monthly sales and attendance summary (Owner only)
router.get('/monthly', authenticate, requireOwner, async (req, res) => {
  try {
    const { month } = req.query; // 'YYYY-MM'
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ success: false, message: 'Valid month required in format YYYY-MM.' });
    }

    const daysInMonth = getDaysInMonth(month);

    // 1. Fetch sales for the month scoped to branch
    const salesRecords = await DailySales.find({
      branchId: req.branchId,
      date: { $regex: `^${month}-` },
    }).sort({ date: 1 });

    const totalSystemSales = salesRecords.reduce((sum, r) => sum + (r.systemSales || 0), 0);
    const totalCash = salesRecords.reduce((sum, r) => sum + (r.totalCash || 0), 0);
    const totalGpay = salesRecords.reduce((sum, r) => sum + (r.totalGpay || 0), 0);
    const totalExpenses = salesRecords.reduce((sum, r) => sum + (r.totalExpenses || 0), 0);
    const totalAccounted = totalExpenses + totalCash + totalGpay;
    const netDifference = Math.round((totalAccounted - totalSystemSales) * 100) / 100;

    let matchedDaysCount = 0;
    let mismatchDaysCount = 0;

    salesRecords.forEach((r) => {
      if (r.isTallied) {
        matchedDaysCount++;
      } else {
        mismatchDaysCount++;
      }
    });

    // 2. Fetch attendance for the month scoped to branch
    const attendanceRecords = await Attendance.find({
      branchId: req.branchId,
      date: { $regex: `^${month}-` },
    }).sort({ date: 1 });

    const allStaff = await Staff.find({ branchId: req.branchId });
    const staffMap = new Map();

    allStaff.forEach((s) => {
      const perDayWage = Number(s.dailySalary !== undefined ? s.dailySalary : s.wageRate) || 500;
      staffMap.set(s._id.toString(), {
        staffId: s._id,
        name: s.name,
        role: s.role,
        phone: s.phone,
        dailySalary: perDayWage,
        wageRate: perDayWage,
        isActive: s.isActive,
        daysPresent: 0,
        halfDays: 0,
        absences: 0,
        effectiveDays: 0,
        calculatedSalary: 0,
      });
    });

    attendanceRecords.forEach((attDay) => {
      attDay.records.forEach((rec) => {
        const staffIdStr = rec.staffId.toString();
        if (!staffMap.has(staffIdStr)) {
          // If staff was deleted or not in active list, add placeholder
          staffMap.set(staffIdStr, {
            staffId: rec.staffId,
            name: rec.staffName,
            role: 'Staff',
            phone: '',
            dailySalary: 500,
            wageRate: 500,
            isActive: false,
            daysPresent: 0,
            halfDays: 0,
            absences: 0,
            effectiveDays: 0,
            calculatedSalary: 0,
          });
        }

        const summary = staffMap.get(staffIdStr);
        if (rec.status === 'Present') {
          summary.daysPresent += 1;
        } else if (rec.status === 'Half-day') {
          summary.halfDays += 1;
        } else if (rec.status === 'Absent') {
          summary.absences += 1;
        }
      });
    });

    const isOwner = req.user && req.user.role === 'owner';
    let totalMonthlySalaryPayout = 0;

    // Compute payable days and month salary calculation based on attendance (Owner-only)
    const staffAttendanceSummary = Array.from(staffMap.values()).map((s) => {
      const effectiveDays = s.daysPresent + 0.5 * s.halfDays;
      const perDaySalary = s.dailySalary || s.wageRate || 0;
      const monthSalary = Math.round(effectiveDays * perDaySalary);

      totalMonthlySalaryPayout += monthSalary;

      return {
        staffId: s.staffId,
        name: s.name,
        role: s.role,
        phone: s.phone,
        isActive: s.isActive,
        dailySalary: perDaySalary,
        daysPresent: s.daysPresent,
        halfDays: s.halfDays,
        absences: s.absences,
        effectiveDays,
        calculatedMonthSalary: monthSalary,
        calculationFormula: `${effectiveDays} payable days (${s.daysPresent}P + ${s.halfDays}H) × ₹${perDaySalary}/day = ₹${monthSalary.toLocaleString('en-IN')}`,
      };
    }).sort((a, b) => b.calculatedMonthSalary - a.calculatedMonthSalary);

    res.json({
      success: true,
      month,
      daysInMonth,
      canViewSalary: isOwner,
      sales: {
        totalSystemSales,
        totalCash,
        totalGpay,
        totalExpenses,
        totalAccounted,
        netDifference,
        recordedDays: salesRecords.length,
        matchedDaysCount,
        mismatchDaysCount,
        dailyBreakdown: salesRecords,
      },
      attendance: {
        recordedDays: attendanceRecords.length,
        totalStaffSalaryPayout: totalMonthlySalaryPayout,
        staffSummary: staffAttendanceSummary,
      },
    });
  } catch (err) {
    console.error('[ReportsRoute] Error generating monthly report:', err);
    res.status(500).json({ success: false, message: 'Failed to generate reports: ' + err.message });
  }
});

// GET /api/reports/calendar-status - Quick status overview of each day in a month (for calendar dots)
router.get('/calendar-status', authenticate, async (req, res) => {
  try {
    const { month } = req.query; // 'YYYY-MM'
    if (!month) {
      return res.status(400).json({ success: false, message: 'Month query param required.' });
    }

    const salesList = await DailySales.find(
      { branchId: req.branchId, date: { $regex: `^${month}-` } },
      'date isTallied difference systemSales totalExpenses'
    );

    const attendanceList = await Attendance.find(
      { branchId: req.branchId, date: { $regex: `^${month}-` } },
      'date records'
    );

    const attDateSet = new Set(attendanceList.map(a => a.date));

    const statusMap = {};
    salesList.forEach((s) => {
      statusMap[s.date] = {
        hasSales: true,
        isTallied: s.isTallied,
        difference: s.difference,
        systemSales: s.systemSales,
        hasAttendance: attDateSet.has(s.date),
      };
    });

    attendanceList.forEach((a) => {
      if (!statusMap[a.date]) {
        statusMap[a.date] = {
          hasSales: false,
          isTallied: true,
          difference: 0,
          systemSales: 0,
          hasAttendance: true,
        };
      }
    });

    res.json({ success: true, month, days: statusMap });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/reports/sales-history - List sales records for custom date range (Max 1 month, Owner only)
router.get('/sales-history', authenticate, requireOwner, async (req, res) => {
  try {
    const { from, to, branchId } = req.query;
    const check = validateDateRange(from, to);
    if (!check.valid) {
      return res.status(400).json({ success: false, message: check.message });
    }

    const isAllBranches = (branchId === 'all' || req.headers['x-branch-id'] === 'all');

    if (isAllBranches) {
      // Fetch all active branches and aggregate sales side by side
      const branches = await Branch.find({ isActive: true }).sort({ code: 1 });
      const branchSummaries = [];

      let grandSystemSales = 0;
      let grandExpenses = 0;
      let grandTotalCash = 0;
      let grandTotalGpay = 0;
      let grandMatchedDays = 0;
      let grandMismatchDays = 0;

      for (const b of branches) {
        const records = await DailySales.find({
          branchId: b._id,
          date: { $gte: from, $lte: to },
        }).sort({ date: 1 });

        const sysSales = records.reduce((s, r) => s + (r.systemSales || 0), 0);
        const exp = records.reduce((s, r) => s + (r.totalExpenses || 0), 0);
        const cash = records.reduce((s, r) => s + (r.totalCash || 0), 0);
        const gpay = records.reduce((s, r) => s + (r.totalGpay || 0), 0);
        const accounted = exp + cash + gpay;
        const diff = Math.round((accounted - sysSales) * 100) / 100;

        let matched = 0;
        let mismatch = 0;
        records.forEach((r) => {
          const rDiff = Math.round(((r.totalAccounted || 0) - (r.systemSales || 0)) * 100) / 100;
          if (r.isTallied && Math.abs(rDiff) < 0.01) matched++;
          else mismatch++;
        });

        grandSystemSales += sysSales;
        grandExpenses += exp;
        grandTotalCash += cash;
        grandTotalGpay += gpay;
        grandMatchedDays += matched;
        grandMismatchDays += mismatch;

        branchSummaries.push({
          branchId: b._id,
          branchName: b.name,
          branchCode: b.code,
          totals: {
            systemSales: sysSales,
            expenses: exp,
            totalCash: cash,
            totalGpay: gpay,
            totalAccounted: accounted,
            difference: diff,
            daysCount: records.length,
            matchedDays: matched,
            mismatchDays: mismatch,
          },
          records,
        });
      }

      const grandAccounted = grandExpenses + grandTotalCash + grandTotalGpay;
      const grandDifference = Math.round((grandAccounted - grandSystemSales) * 100) / 100;

      return res.json({
        success: true,
        isAllBranches: true,
        from,
        to,
        branchSummaries,
        grandTotal: {
          systemSales: grandSystemSales,
          expenses: grandExpenses,
          totalCash: grandTotalCash,
          totalGpay: grandTotalGpay,
          totalAccounted: grandAccounted,
          difference: grandDifference,
          matchedDays: grandMatchedDays,
          mismatchDays: grandMismatchDays,
        },
      });
    }

    // Single Branch Query
    const targetBranchId = (branchId && branchId !== 'all') ? branchId : req.branchId;
    const branchDoc = await Branch.findById(targetBranchId);
    const branchName = branchDoc ? branchDoc.name : (req.branchName || 'Samayanallur Branch');

    const salesRecords = await DailySales.find({
      branchId: targetBranchId,
      date: { $gte: from, $lte: to },
    }).sort({ date: 1 });

    const systemSales = salesRecords.reduce((s, r) => s + (r.systemSales || 0), 0);
    const expenses = salesRecords.reduce((s, r) => s + (r.totalExpenses || 0), 0);
    const totalCash = salesRecords.reduce((s, r) => s + (r.totalCash || 0), 0);
    const totalGpay = salesRecords.reduce((s, r) => s + (r.totalGpay || 0), 0);
    const totalAccounted = expenses + totalCash + totalGpay;
    const difference = Math.round((totalAccounted - systemSales) * 100) / 100;

    let matchedDays = 0;
    let mismatchDays = 0;

    salesRecords.forEach((r) => {
      const rDiff = Math.round(((r.totalAccounted || 0) - (r.systemSales || 0)) * 100) / 100;
      if (r.isTallied && Math.abs(rDiff) < 0.01) {
        matchedDays++;
      } else {
        mismatchDays++;
      }
    });

    res.json({
      success: true,
      isAllBranches: false,
      branchId: targetBranchId,
      branchName,
      from,
      to,
      count: salesRecords.length,
      totals: {
        systemSales,
        expenses,
        totalCash,
        totalGpay,
        totalAccounted,
        difference,
        matchedDays,
        mismatchDays,
      },
      records: salesRecords,
    });
  } catch (err) {
    console.error('[ReportsRoute] Error fetching sales history:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch sales history: ' + err.message });
  }
});

// GET /api/reports/sales-history/pdf - Download Sales History PDF (Max 1 month, Owner only)
router.get('/sales-history/pdf', authenticate, requireOwner, async (req, res) => {
  try {
    const { from, to, branchId } = req.query;
    const check = validateDateRange(from, to);
    if (!check.valid) {
      return res.status(400).json({ success: false, message: check.message });
    }

    const isAllBranches = (branchId === 'all' || req.headers['x-branch-id'] === 'all');

    if (isAllBranches) {
      const branches = await Branch.find({ isActive: true }).sort({ code: 1 });
      const branchSummaries = [];

      let grandSystemSales = 0;
      let grandExpenses = 0;
      let grandTotalCash = 0;
      let grandTotalGpay = 0;

      for (const b of branches) {
        const records = await DailySales.find({
          branchId: b._id,
          date: { $gte: from, $lte: to },
        }).sort({ date: 1 });

        const sysSales = records.reduce((s, r) => s + (r.systemSales || 0), 0);
        const exp = records.reduce((s, r) => s + (r.totalExpenses || 0), 0);
        const cash = records.reduce((s, r) => s + (r.totalCash || 0), 0);
        const gpay = records.reduce((s, r) => s + (r.totalGpay || 0), 0);
        const accounted = exp + cash + gpay;
        const diff = Math.round((accounted - sysSales) * 100) / 100;

        grandSystemSales += sysSales;
        grandExpenses += exp;
        grandTotalCash += cash;
        grandTotalGpay += gpay;

        branchSummaries.push({
          branchId: b._id,
          branchName: b.name,
          branchCode: b.code,
          totals: {
            systemSales: sysSales,
            expenses: exp,
            totalCash: cash,
            totalGpay: gpay,
            difference: diff,
          },
        });
      }

      const grandAccounted = grandExpenses + grandTotalCash + grandTotalGpay;
      const grandDifference = Math.round((grandAccounted - grandSystemSales) * 100) / 100;
      const grandTotal = {
        systemSales: grandSystemSales,
        expenses: grandExpenses,
        totalCash: grandTotalCash,
        totalGpay: grandTotalGpay,
        totalAccounted: grandAccounted,
        difference: grandDifference,
      };

      const pdfBuffer = await generateAllBranchesSalesPDF(branchSummaries, grandTotal, from, to);

      await logAudit({
        recordDate: to,
        module: 'Reports',
        action: 'DOWNLOAD_PDF',
        fieldName: 'SalesHistory_AllBranches',
        newValue: `${from} to ${to}`,
        performedBy: req.user,
        description: `Owner downloaded All Branches Sales History PDF for period ${from} to ${to}.`,
      });

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="Chendurar_All_Branches_Sales_${from}_to_${to}.pdf"`);
      res.setHeader('Content-Length', pdfBuffer.length);
      return res.send(pdfBuffer);
    }

    // Single Branch PDF
    const targetBranchId = (branchId && branchId !== 'all') ? branchId : req.branchId;
    const branchDoc = await Branch.findById(targetBranchId);
    const branchName = branchDoc ? branchDoc.name : (req.branchName || 'Samayanallur Branch');

    const salesRecords = await DailySales.find({
      branchId: targetBranchId,
      date: { $gte: from, $lte: to },
    }).sort({ date: 1 });

    const systemSales = salesRecords.reduce((s, r) => s + (r.systemSales || 0), 0);
    const expenses = salesRecords.reduce((s, r) => s + (r.totalExpenses || 0), 0);
    const totalCash = salesRecords.reduce((s, r) => s + (r.totalCash || 0), 0);
    const totalGpay = salesRecords.reduce((s, r) => s + (r.totalGpay || 0), 0);
    const totalAccounted = expenses + totalCash + totalGpay;
    const difference = Math.round((totalAccounted - systemSales) * 100) / 100;

    let matchedDays = 0;
    let mismatchDays = 0;

    salesRecords.forEach((r) => {
      const rDiff = Math.round(((r.totalAccounted || 0) - (r.systemSales || 0)) * 100) / 100;
      if (r.isTallied && Math.abs(rDiff) < 0.01) {
        matchedDays++;
      } else {
        mismatchDays++;
      }
    });

    const totals = {
      systemSales,
      expenses,
      totalCash,
      totalGpay,
      totalAccounted,
      difference,
      matchedDays,
      mismatchDays,
    };

    const pdfBuffer = await generateSalesHistoryPDF(salesRecords, from, to, totals, branchName);

    // Log PDF download in edit history / audit log
    await logAudit({
      recordDate: to,
      module: 'Reports',
      action: 'DOWNLOAD_PDF',
      fieldName: `SalesHistory_${branchName}`,
      newValue: `${from} to ${to}`,
      performedBy: req.user,
      description: `Owner downloaded Sales History PDF for ${branchName} (${from} to ${to}).`,
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Chendurar_Sales_${branchName.replace(/[^a-zA-Z0-9]/g, '_')}_${from}_to_${to}.pdf"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.send(pdfBuffer);
  } catch (err) {
    console.error('[ReportsRoute] Error generating sales history PDF:', err);
    res.status(500).json({ success: false, message: 'Failed to generate PDF: ' + err.message });
  }
});

// GET /api/reports/attendance-history - List attendance records for custom date range (Max 1 month, Owner only)
router.get('/attendance-history', authenticate, requireOwner, async (req, res) => {
  try {
    const { from, to, staffId, branchId } = req.query;
    const check = validateDateRange(from, to);
    if (!check.valid) {
      return res.status(400).json({ success: false, message: check.message });
    }

    const targetBranchId = (branchId && branchId !== 'all') ? branchId : req.branchId;
    const branchDoc = await Branch.findById(targetBranchId);
    const branchName = branchDoc ? branchDoc.name : (req.branchName || 'Samayanallur Branch');

    const attDocs = await Attendance.find({
      branchId: targetBranchId,
      date: { $gte: from, $lte: to },
    }).sort({ date: 1 });

    const allStaff = await Staff.find({ branchId: targetBranchId });
    const staffSummaryMap = new Map();

    allStaff.forEach((s) => {
      staffSummaryMap.set(s._id.toString(), {
        staffId: s._id.toString(),
        name: s.name,
        role: s.role,
        present: 0,
        halfDay: 0,
        absent: 0,
        totalDays: 0,
      });
    });

    const flattened = [];

    attDocs.forEach((attDay) => {
      (attDay.records || []).forEach((rec) => {
        const sId = rec.staffId ? rec.staffId.toString() : '';
        if (staffId && sId !== staffId) return;

        flattened.push({
          date: attDay.date,
          staffId: sId,
          staffName: rec.staffName,
          inTime: rec.inTime || '08:00 AM',
          outTime: rec.outTime || '09:00 PM',
          status: rec.status || 'Present',
          notes: rec.notes || '',
        });

        if (!staffSummaryMap.has(sId)) {
          staffSummaryMap.set(sId, {
            staffId: sId,
            name: rec.staffName,
            role: 'Staff',
            present: 0,
            halfDay: 0,
            absent: 0,
            totalDays: 0,
          });
        }

        const sum = staffSummaryMap.get(sId);
        sum.totalDays++;
        if (rec.status === 'Present') sum.present++;
        else if (rec.status === 'Half-day') sum.halfDay++;
        else if (rec.status === 'Absent') sum.absent++;
      });
    });

    let summaries = Array.from(staffSummaryMap.values());
    if (staffId) {
      summaries = summaries.filter((s) => s.staffId === staffId);
    }

    res.json({
      success: true,
      branchId: targetBranchId,
      branchName,
      from,
      to,
      count: flattened.length,
      records: flattened,
      staffSummaries: summaries,
    });
  } catch (err) {
    console.error('[ReportsRoute] Error fetching attendance history:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch attendance history: ' + err.message });
  }
});

// GET /api/reports/attendance-history/pdf - Download Attendance History PDF (Max 1 month, Owner only)
router.get('/attendance-history/pdf', authenticate, requireOwner, async (req, res) => {
  try {
    const { from, to, staffId, branchId } = req.query;
    const check = validateDateRange(from, to);
    if (!check.valid) {
      return res.status(400).json({ success: false, message: check.message });
    }

    const targetBranchId = (branchId && branchId !== 'all') ? branchId : req.branchId;
    const branchDoc = await Branch.findById(targetBranchId);
    const branchName = branchDoc ? branchDoc.name : (req.branchName || 'Samayanallur Branch');

    const attDocs = await Attendance.find({
      branchId: targetBranchId,
      date: { $gte: from, $lte: to },
    }).sort({ date: 1 });

    const allStaff = await Staff.find({ branchId: targetBranchId });
    const staffSummaryMap = new Map();

    allStaff.forEach((s) => {
      staffSummaryMap.set(s._id.toString(), {
        staffId: s._id.toString(),
        name: s.name,
        role: s.role,
        present: 0,
        halfDay: 0,
        absent: 0,
        totalDays: 0,
      });
    });

    const flattened = [];

    attDocs.forEach((attDay) => {
      (attDay.records || []).forEach((rec) => {
        const sId = rec.staffId ? rec.staffId.toString() : '';
        if (staffId && sId !== staffId) return;

        flattened.push({
          date: attDay.date,
          staffId: sId,
          staffName: rec.staffName,
          inTime: rec.inTime || '08:00 AM',
          outTime: rec.outTime || '09:00 PM',
          status: rec.status || 'Present',
          notes: rec.notes || '',
        });

        if (!staffSummaryMap.has(sId)) {
          staffSummaryMap.set(sId, {
            staffId: sId,
            name: rec.staffName,
            role: 'Staff',
            present: 0,
            halfDay: 0,
            absent: 0,
            totalDays: 0,
          });
        }

        const sum = staffSummaryMap.get(sId);
        sum.totalDays++;
        if (rec.status === 'Present') sum.present++;
        else if (rec.status === 'Half-day') sum.halfDay++;
        else if (rec.status === 'Absent') sum.absent++;
      });
    });

    let summaries = Array.from(staffSummaryMap.values());
    let filterStaffName = null;

    if (staffId) {
      summaries = summaries.filter((s) => s.staffId === staffId);
      const matched = allStaff.find((s) => s._id.toString() === staffId);
      filterStaffName = matched ? matched.name : null;
    }

    const pdfBuffer = await generateAttendanceHistoryPDF(flattened, summaries, from, to, filterStaffName, branchName);

    // Log PDF download in edit history / audit log
    await logAudit({
      recordDate: to,
      module: 'Reports',
      action: 'DOWNLOAD_PDF',
      fieldName: `AttendanceHistory_${branchName}`,
      newValue: `${from} to ${to}${filterStaffName ? ' (' + filterStaffName + ')' : ''}`,
      performedBy: req.user,
      description: `Owner downloaded Attendance History PDF for ${branchName} (${from} to ${to})${filterStaffName ? ' for ' + filterStaffName : ''} (${flattened.length} entries).`,
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Chendurar_Attendance_${branchName.replace(/[^a-zA-Z0-9]/g, '_')}_${from}_to_${to}.pdf"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.send(pdfBuffer);
  } catch (err) {
    console.error('[ReportsRoute] Error generating attendance history PDF:', err);
    res.status(500).json({ success: false, message: 'Failed to generate PDF: ' + err.message });
  }
});

module.exports = router;

