const express = require('express');
const router = express.Router();
const DailySales = require('../models/DailySales');
const { authenticate, enforceEditPermissions, getTodayDateStr } = require('../middleware/auth');
const { logAudit, logSalesDiff } = require('../services/auditService');
const { upload, compressAndSavePhoto, removePhotoFile } = require('../services/uploadService');
const { emitRealtimeUpdate } = require('../socket');

// GET /api/sales/:date - get sales record for specific date
router.get('/:date', authenticate, async (req, res) => {
  try {
    const { date } = req.params;
    let sales = await DailySales.findOne({ date, branchId: req.branchId });

    if (!sales) {
      // Return empty structure for new entry
      return res.json({
        success: true,
        exists: false,
        data: {
          date,
          systemSales: 0,
          expenses: [],
          totalExpenses: 0,
          totalCash: 0,
          totalGpay: 0,
          totalAccounted: 0,
          difference: 0,
          isTallied: true,
          notes: '',
        },
      });
    }

    res.json({
      success: true,
      exists: true,
      data: sales,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/sales/upload-photo - Upload and compress bill photo
router.post('/upload-photo', authenticate, upload.single('photo'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No photo provided.' });
    }

    const { photoUrl, photoFilename } = await compressAndSavePhoto(req.file.buffer, req.file.originalname);

    res.json({
      success: true,
      photoUrl,
      photoFilename,
    });
  } catch (err) {
    console.error('[SalesRoute] Photo upload error:', err);
    res.status(500).json({ success: false, message: 'Failed to upload/compress photo: ' + err.message });
  }
});

// POST /api/sales - Create or update daily sales entry
router.post('/', authenticate, enforceEditPermissions, async (req, res) => {
  try {
    const {
      date,
      systemSales,
      totalExpenses,
      expenses,
      expensePhotoUrl,
      expensePhotoFilename,
      expenseNote,
      totalCash,
      totalGpay,
      notes,
    } = req.body;

    if (!date) {
      return res.status(400).json({ success: false, message: 'Date is required.' });
    }

    const sysSalesNum = Number(systemSales) || 0;
    const cashNum = Number(totalCash) || 0;
    const gpayNum = Number(totalGpay) || 0;

    // Determine expense amount
    let expNum = 0;
    let cleanExpenses = [];

    if (totalExpenses !== undefined && totalExpenses !== null && !isNaN(totalExpenses)) {
      expNum = Number(totalExpenses) || 0;
    }

    if (Array.isArray(expenses) && expenses.length > 0) {
      cleanExpenses = expenses.map(exp => ({
        amount: Number(exp.amount) || 0,
        note: (exp.note || '').trim() || 'General Expense',
        photoUrl: exp.photoUrl || '',
        photoFilename: exp.photoFilename || '',
        uploadedAt: exp.uploadedAt || new Date(),
      }));
      if (totalExpenses === undefined || totalExpenses === null) {
        expNum = cleanExpenses.reduce((acc, curr) => acc + curr.amount, 0);
      }
    } else if (expNum > 0 || expensePhotoUrl) {
      cleanExpenses = [{
        amount: expNum,
        note: (expenseNote || '').trim() || 'Shop Expenses',
        photoUrl: expensePhotoUrl || '',
        photoFilename: expensePhotoFilename || '',
        uploadedAt: new Date(),
      }];
    }

    const totalAccounted = expNum + cashNum + gpayNum;
    const difference = Math.round((totalAccounted - sysSalesNum) * 100) / 100;
    const isTallied = difference === 0;

    let existing = await DailySales.findOne({ date, branchId: req.branchId });

    if (!existing) {
      // Create new daily sales
      const newRecord = new DailySales({
        branchId: req.branchId,
        date,
        systemSales: sysSalesNum,
        expenses: cleanExpenses,
        totalExpenses: expNum,
        expensePhotoUrl: expensePhotoUrl || (cleanExpenses[0] ? cleanExpenses[0].photoUrl : ''),
        expensePhotoFilename: expensePhotoFilename || (cleanExpenses[0] ? cleanExpenses[0].photoFilename : ''),
        expenseNote: expenseNote || (cleanExpenses[0] ? cleanExpenses[0].note : ''),
        totalCash: cashNum,
        totalGpay: gpayNum,
        totalAccounted,
        difference,
        isTallied,
        notes: notes || '',
        submittedBy: {
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

      await newRecord.save();

      // Log audit
      await logAudit({
        recordDate: date,
        module: 'Sales',
        action: 'CREATE',
        fieldName: 'DailySales',
        oldValue: null,
        newValue: `System: ₹${sysSalesNum}, Cash: ₹${cashNum}, GPay: ₹${gpayNum}, Exp: ₹${expNum}, Diff: ₹${difference}`,
        performedBy: req.user,
        description: `Created sales entry for ${date}. Tally status: ${isTallied ? 'MATCHED' : `MISMATCH (Diff: ₹${difference})`}`,
      });

      // Also log bill photo if any
      const activePhoto = expensePhotoUrl || (cleanExpenses[0] ? cleanExpenses[0].photoUrl : '');
      if (activePhoto) {
        await logAudit({
          recordDate: date,
          module: 'Expenses',
          action: 'PHOTO_ADD',
          fieldName: 'Bill Photo',
          oldValue: null,
          newValue: activePhoto,
          performedBy: req.user,
          description: `Attached bill photo for ${date}`,
        });
      }

      // Realtime notification
      emitRealtimeUpdate('sales_updated', {
        date,
        action: 'CREATE',
        record: newRecord,
        updatedBy: req.user,
        message: `${req.user.name} (${req.user.role}) submitted sales for ${date}: ${isTallied ? 'Balanced' : `Discrepancy ₹${difference}`}`,
      });

      return res.status(201).json({
        success: true,
        message: isTallied
          ? 'Sales entry saved successfully and tallied!'
          : `Sales entry saved! Note: Tally difference of ₹${Math.abs(difference)} flagged.`,
        data: newRecord,
      });
    } else {
      // Update existing record
      // 1. Audit diff
      await logSalesDiff(
        existing,
        {
          systemSales: sysSalesNum,
          expenses: cleanExpenses,
          totalCash: cashNum,
          totalGpay: gpayNum,
          notes,
        },
        req.user,
        date
      );

      // 2. Update record
      existing.systemSales = sysSalesNum;
      existing.expenses = cleanExpenses;
      existing.totalCash = cashNum;
      existing.totalGpay = gpayNum;
      existing.totalExpenses = expNum;
      existing.expensePhotoUrl = expensePhotoUrl !== undefined ? expensePhotoUrl : existing.expensePhotoUrl;
      existing.expensePhotoFilename = expensePhotoFilename !== undefined ? expensePhotoFilename : existing.expensePhotoFilename;
      existing.expenseNote = expenseNote !== undefined ? expenseNote : existing.expenseNote;
      existing.totalAccounted = totalAccounted;
      existing.difference = difference;
      existing.isTallied = isTallied;
      existing.notes = notes || '';
      existing.lastUpdatedBy = {
        userId: req.user.userId,
        name: req.user.name,
        role: req.user.role,
      };

      await existing.save();

      // Realtime notification
      emitRealtimeUpdate('sales_updated', {
        date,
        action: 'UPDATE',
        record: existing,
        updatedBy: req.user,
        message: `${req.user.name} (${req.user.role}) updated sales for ${date}: ${isTallied ? 'Balanced' : `Discrepancy ₹${difference}`}`,
      });

      return res.json({
        success: true,
        message: isTallied
          ? 'Sales entry updated successfully and tallied!'
          : `Sales entry updated! Note: Tally difference of ₹${Math.abs(difference)} flagged.`,
        data: existing,
      });
    }
  } catch (err) {
    console.error('[SalesRoute] Error saving sales:', err);
    res.status(500).json({ success: false, message: 'Failed to save sales: ' + err.message });
  }
});

// DELETE /api/sales/delete-photo - Delete an attached expense bill photo
router.delete('/delete-photo', authenticate, enforceEditPermissions, async (req, res) => {
  try {
    const { date, photoFilename, expenseIndex } = req.body;
    if (!date || !photoFilename) {
      return res.status(400).json({ success: false, message: 'Date and photoFilename are required.' });
    }

    const sales = await DailySales.findOne({ date, branchId: req.branchId });
    if (sales) {
      if (typeof expenseIndex === 'number' && sales.expenses[expenseIndex]) {
        sales.expenses[expenseIndex].photoUrl = '';
        sales.expenses[expenseIndex].photoFilename = '';
      }
      if (sales.expensePhotoFilename === photoFilename || !expenseIndex) {
        sales.expensePhotoUrl = '';
        sales.expensePhotoFilename = '';
      }
      sales.lastUpdatedBy = {
        userId: req.user.userId,
        name: req.user.name,
        role: req.user.role,
      };
      await sales.save();

      await logAudit({
        recordDate: date,
        module: 'Expenses',
        action: 'PHOTO_DELETE',
        fieldName: 'Bill Photo',
        oldValue: photoFilename,
        newValue: null,
        performedBy: req.user,
        description: `Removed bill photo for ${date}`,
      });
    }

    await removePhotoFile(photoFilename);

    emitRealtimeUpdate('sales_updated', {
      date,
      action: 'PHOTO_DELETE',
      updatedBy: req.user,
      message: `${req.user.name} deleted a bill photo for ${date}`,
    });

    res.json({ success: true, message: 'Photo deleted successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;

