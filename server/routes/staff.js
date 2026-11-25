const express = require('express');
const Staff = require('../models/Staff');
const { authenticate, requireSingleBranch } = require('../middleware/auth');
const { badRequest, notFound, money, str } = require('../lib/http');
const { logAudit } = require('../services/audit');

const router = express.Router();
router.use(authenticate, requireSingleBranch);

const salaryOf = (s) => s.dailySalary || s.wageRate || 0;

/** Managers must never see salaries, so strip them out for non-owners. */
const view = (s, isOwner) => {
  const out = { id: s._id, name: s.name, role: s.role, phone: s.phone, isActive: s.isActive, joinedDate: s.joinedDate };
  if (isOwner) out.dailySalary = salaryOf(s);
  return out;
};

// GET /api/staff?includeInactive=true
router.get('/', async (req, res) => {
  const filter = { branchId: req.branchId };
  if (req.query.includeInactive !== 'true') filter.isActive = true;
  const list = await Staff.find(filter).sort({ isActive: -1, name: 1 }).lean();
  res.json({ ok: true, staff: list.map((s) => view(s, req.user.role === 'owner')) });
});

// POST /api/staff
router.post('/', async (req, res) => {
  const name = str(req.body.name, 80);
  if (!name) throw badRequest('Name is required.');
  const isOwner = req.user.role === 'owner';
  const salary = isOwner ? money(req.body.dailySalary) : 0;
  const staff = await Staff.create({
    branchId: req.branchId, name, role: str(req.body.role, 60) || 'Staff', phone: str(req.body.phone, 20),
    dailySalary: salary, wageRate: salary, wageType: 'daily', createdBy: req.user.name,
  });
  await logAudit(req, { module: 'Staff', action: 'CREATE', fieldName: `Staff: ${name}`, newValue: isOwner ? `${name} (₹${salary}/day)` : name, description: `Added staff member "${name}" (${staff.role})` });
  res.status(201).json({ ok: true, staff: view(staff, isOwner) });
});

// PUT /api/staff/:id
router.put('/:id', async (req, res) => {
  const staff = await Staff.findOne({ _id: req.params.id, branchId: req.branchId });
  if (!staff) throw notFound('Staff member not found.');
  const isOwner = req.user.role === 'owner';
  const before = `${staff.name}, ${staff.role}${isOwner ? `, ₹${salaryOf(staff)}/day` : ''}, ${staff.isActive ? 'active' : 'inactive'}`;

  if (req.body.name !== undefined) staff.name = str(req.body.name, 80) || staff.name;
  if (req.body.role !== undefined) staff.role = str(req.body.role, 60) || 'Staff';
  if (req.body.phone !== undefined) staff.phone = str(req.body.phone, 20);
  if (typeof req.body.isActive === 'boolean') staff.isActive = req.body.isActive;
  if (isOwner && req.body.dailySalary !== undefined) {
    staff.dailySalary = money(req.body.dailySalary);
    staff.wageRate = staff.dailySalary;
  }
  await staff.save();

  const after = `${staff.name}, ${staff.role}${isOwner ? `, ₹${salaryOf(staff)}/day` : ''}, ${staff.isActive ? 'active' : 'inactive'}`;
  await logAudit(req, { module: 'Staff', action: 'UPDATE', fieldName: `Staff: ${staff.name}`, oldValue: before, newValue: after, description: `Updated staff "${staff.name}"` });
  res.json({ ok: true, staff: view(staff, isOwner) });
});

// DELETE /api/staff/:id — we never really delete, so old attendance still makes sense
router.delete('/:id', async (req, res) => {
  const staff = await Staff.findOne({ _id: req.params.id, branchId: req.branchId });
  if (!staff) throw notFound('Staff member not found.');
  staff.isActive = false;
  await staff.save();
  await logAudit(req, { module: 'Staff', action: 'DELETE', fieldName: `Staff: ${staff.name}`, description: `Removed staff member "${staff.name}"` });
  res.json({ ok: true });
});

module.exports = router;
