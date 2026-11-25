const express = require('express');
const AuditLog = require('../models/AuditLog');
const { authenticate, requireOwner } = require('../middleware/auth');

const router = express.Router();

// GET /api/history?module=Sales&page=1 — the owner's "Edit History"
router.get('/', authenticate, requireOwner, async (req, res) => {
  const query = {};
  if (req.query.module && req.query.module !== 'all') query.module = req.query.module;
  if (req.query.date) query.recordDate = req.query.date;
  if (req.branchId && req.branchId !== 'all') query.branchId = req.branchId;

  const limit = 40;
  const page = Math.max(Number(req.query.page) || 1, 1);
  const [total, logs] = await Promise.all([
    AuditLog.countDocuments(query),
    AuditLog.find(query).sort({ timestamp: -1 }).skip((page - 1) * limit).limit(limit).lean(),
  ]);
  res.json({ ok: true, logs, page, hasMore: page * limit < total });
});

module.exports = router;
