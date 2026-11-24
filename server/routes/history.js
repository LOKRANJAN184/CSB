const express = require('express');
const router = express.Router();
const AuditLog = require('../models/AuditLog');
const { authenticate, requireOwner } = require('../middleware/auth');

// GET /api/history - Get audit logs (Owner only)
router.get('/', authenticate, requireOwner, async (req, res) => {
  try {
    const { date, module, action, limit = 100, page = 1 } = req.query;

    const query = {};
    if (date) query.recordDate = date;
    if (module && module !== 'ALL') query.module = module;
    if (action && action !== 'ALL') query.action = action;

    const branchFilter = req.query.branchId !== undefined ? req.query.branchId : (req.headers['x-branch-id'] || req.branchId);
    if (branchFilter && branchFilter !== 'all' && branchFilter !== 'ALL') {
      query.branchId = branchFilter;
    }

    const parsedLimit = Math.min(parseInt(limit, 10) || 100, 200);
    const parsedPage = Math.max(parseInt(page, 10) || 1, 1);
    const skip = (parsedPage - 1) * parsedLimit;

    const total = await AuditLog.countDocuments(query);
    const logs = await AuditLog.find(query)
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(parsedLimit);

    res.json({
      success: true,
      total,
      page: parsedPage,
      totalPages: Math.ceil(total / parsedLimit) || 1,
      logs,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;

