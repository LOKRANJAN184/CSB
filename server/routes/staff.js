const express = require('express');
const router = express.Router();
const Staff = require('../models/Staff');
const { authenticate } = require('../middleware/auth');
const { logAudit } = require('../services/auditService');
const { emitRealtimeUpdate } = require('../socket');

// GET /api/staff - List all staff for current branch
router.get('/', authenticate, async (req, res) => {
  try {
    const { includeInactive } = req.query;
    const filter = includeInactive === 'true'
      ? { branchId: req.branchId }
      : { branchId: req.branchId, isActive: true };
    const staffList = await Staff.find(filter).sort({ name: 1 });
    const isOwner = req.user && req.user.role === 'owner';

    // If Manager, hide salary/wage information completely
    const sanitizedStaff = staffList.map(s => {
      const staffObj = s.toObject();
      if (!isOwner) {
        delete staffObj.dailySalary;
        delete staffObj.wageRate;
        delete staffObj.wageType;
      } else {
        // Ensure dailySalary is synchronized with wageRate
        staffObj.dailySalary = staffObj.dailySalary || staffObj.wageRate || 500;
      }
      return staffObj;
    });

    res.json({ success: true, count: sanitizedStaff.length, staff: sanitizedStaff });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/staff - Add new staff (Owner alone can set per day salary)
router.post('/', authenticate, async (req, res) => {
  try {
    const { name, phone, role, dailySalary, wageRate } = req.body;
    const isOwner = req.user && req.user.role === 'owner';

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Staff name is required.' });
    }

    // Owner alone can set per day salary when joining
    const perDaySalary = isOwner ? (Number(dailySalary !== undefined ? dailySalary : wageRate) || 500) : 0;

    const newStaff = new Staff({
      branchId: req.branchId,
      name: name.trim(),
      phone: (phone || '').trim(),
      role: (role || 'Staff').trim(),
      dailySalary: perDaySalary,
      wageType: 'daily',
      wageRate: perDaySalary,
      createdBy: req.user.name,
      isActive: true,
    });

    await newStaff.save();

    // Log audit
    await logAudit({
      module: 'Staff',
      action: 'CREATE',
      fieldName: `Staff: ${newStaff.name}`,
      oldValue: null,
      newValue: isOwner
        ? `${newStaff.name} (${newStaff.role}, Per Day Salary: ₹${perDaySalary})`
        : `${newStaff.name} (${newStaff.role})`,
      performedBy: req.user,
      description: `${req.user.name} added new staff member "${newStaff.name}" (${newStaff.role})${isOwner ? ` with Per Day Salary: ₹${perDaySalary}` : ''}`,
    });

    emitRealtimeUpdate('staff_updated', {
      action: 'CREATE',
      staff: newStaff,
      updatedBy: req.user,
      message: `${req.user.name} added staff member "${newStaff.name}"`,
    });

    res.status(201).json({
      success: true,
      message: `Staff member "${newStaff.name}" added successfully!`,
      staff: newStaff,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/staff/:id - Edit staff details (Owner alone can edit per day salary)
router.put('/:id', authenticate, async (req, res) => {
  try {
    const { name, phone, role, dailySalary, wageRate, isActive } = req.body;
    const staffQuery = req.user.role === 'owner' ? { _id: req.params.id } : { _id: req.params.id, branchId: req.branchId };
    const staff = await Staff.findOne(staffQuery);
    const isOwner = req.user && req.user.role === 'owner';

    if (!staff) {
      return res.status(404).json({ success: false, message: 'Staff member not found.' });
    }

    const oldSnapshot = `${staff.name} (${staff.role}, Per Day Salary: ₹${staff.dailySalary || staff.wageRate || 0}, Active: ${staff.isActive})`;

    if (name) staff.name = name.trim();
    if (phone !== undefined) staff.phone = phone.trim();
    if (role) staff.role = role.trim();
    if (isActive !== undefined) staff.isActive = Boolean(isActive);

    // Only Owner can edit per day salary
    if (isOwner && (dailySalary !== undefined || wageRate !== undefined)) {
      const perDaySalary = Number(dailySalary !== undefined ? dailySalary : wageRate) || 0;
      staff.dailySalary = perDaySalary;
      staff.wageRate = perDaySalary;
      staff.wageType = 'daily';
    }

    await staff.save();

    const newSnapshot = `${staff.name} (${staff.role}, Per Day Salary: ₹${staff.dailySalary || staff.wageRate || 0}, Active: ${staff.isActive})`;

    await logAudit({
      module: 'Staff',
      action: 'UPDATE',
      fieldName: `Staff: ${staff.name}`,
      oldValue: oldSnapshot,
      newValue: newSnapshot,
      performedBy: req.user,
      description: `${req.user.name} updated staff profile for "${staff.name}"`,
    });

    emitRealtimeUpdate('staff_updated', {
      action: 'UPDATE',
      staff,
      updatedBy: req.user,
      message: `${req.user.name} updated staff profile for "${staff.name}"`,
    });

    res.json({
      success: true,
      message: `Staff profile for "${staff.name}" updated!`,
      staff,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/staff/:id - Remove staff member
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const staffQuery = req.user.role === 'owner' ? { _id: req.params.id } : { _id: req.params.id, branchId: req.branchId };
    const staff = await Staff.findOne(staffQuery);
    if (!staff) {
      return res.status(404).json({ success: false, message: 'Staff member not found.' });
    }

    staff.isActive = false;
    await staff.save();

    await logAudit({
      module: 'Staff',
      action: 'DELETE',
      fieldName: `Staff: ${staff.name}`,
      oldValue: `Active staff: ${staff.name}`,
      newValue: 'Deactivated / Removed',
      performedBy: req.user,
      description: `${req.user.name} removed staff member "${staff.name}"`,
    });

    emitRealtimeUpdate('staff_updated', {
      action: 'DELETE',
      staffId: staff._id,
      updatedBy: req.user,
      message: `${req.user.name} removed staff member "${staff.name}"`,
    });

    res.json({
      success: true,
      message: `Staff member "${staff.name}" removed successfully.`,
      staffId: staff._id,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;

