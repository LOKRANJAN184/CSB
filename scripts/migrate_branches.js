const mongoose = require('mongoose');
const Branch = require('../server/models/Branch');
const User = require('../server/models/User');
const DailySales = require('../server/models/DailySales');
const Attendance = require('../server/models/Attendance');
const Staff = require('../server/models/Staff');
const AuditLog = require('../server/models/AuditLog');

(async () => {
  await mongoose.connect('mongodb://127.0.0.1:27017/csb_bakery');

  // 1. Seed or find branches
  let mainBranch = await Branch.findOne({ code: 'MAIN' });
  if (!mainBranch) {
    mainBranch = await Branch.create({
      name: 'Main Branch (தலைமை கிளை)',
      code: 'MAIN',
      address: 'Main Bazaar, Tirunelveli',
      phone: '9025351545',
      isActive: true,
    });
    console.log('Created Main Branch:', mainBranch._id);
  } else {
    console.log('Found Main Branch:', mainBranch._id);
  }

  let branch2 = await Branch.findOne({ code: 'BRANCH2' });
  if (!branch2) {
    branch2 = await Branch.create({
      name: 'Branch 2 (கிளை 2 - Junction)',
      code: 'BRANCH2',
      address: 'Railway Junction, Tirunelveli',
      phone: '9976885361',
      isActive: true,
    });
    console.log('Created Branch 2:', branch2._id);
  } else {
    console.log('Found Branch 2:', branch2._id);
  }

  let branch3 = await Branch.findOne({ code: 'BRANCH3' });
  if (!branch3) {
    branch3 = await Branch.create({
      name: 'Branch 3 (கிளை 3 - Town)',
      code: 'BRANCH3',
      address: 'Town Arch, Tirunelveli',
      phone: '9842329813',
      isActive: true,
    });
    console.log('Created Branch 3:', branch3._id);
  } else {
    console.log('Found Branch 3:', branch3._id);
  }

  // 2. Drop old single date indexes if present
  try {
    const dsIndexes = await DailySales.collection.indexes();
    if (dsIndexes.some((idx) => idx.name === 'date_1' && idx.unique)) {
      await DailySales.collection.dropIndex('date_1');
      console.log('Dropped legacy unique index date_1 on DailySales');
    }
  } catch (e) {
    console.log('DailySales index drop note:', e.message);
  }

  try {
    const attIndexes = await Attendance.collection.indexes();
    if (attIndexes.some((idx) => idx.name === 'date_1' && idx.unique)) {
      await Attendance.collection.dropIndex('date_1');
      console.log('Dropped legacy unique index date_1 on Attendance');
    }
  } catch (e) {
    console.log('Attendance index drop note:', e.message);
  }

  // 3. Migrate existing collections to Main Branch
  const dsRes = await DailySales.updateMany(
    { $or: [{ branchId: { $exists: false } }, { branchId: null }] },
    { $set: { branchId: mainBranch._id } }
  );
  console.log('Updated DailySales without branchId:', dsRes.modifiedCount);

  const attRes = await Attendance.updateMany(
    { $or: [{ branchId: { $exists: false } }, { branchId: null }] },
    { $set: { branchId: mainBranch._id } }
  );
  console.log('Updated Attendance without branchId:', attRes.modifiedCount);

  const staffRes = await Staff.updateMany(
    { $or: [{ branchId: { $exists: false } }, { branchId: null }] },
    { $set: { branchId: mainBranch._id } }
  );
  console.log('Updated Staff without branchId:', staffRes.modifiedCount);

  const auditRes = await AuditLog.updateMany(
    { $or: [{ branchId: { $exists: false } }, { branchId: null }] },
    { $set: { branchId: mainBranch._id, branchName: mainBranch.name } }
  );
  console.log('Updated AuditLog without branchId:', auditRes.modifiedCount);

  // 4. Update Main Manager & Seed Branch 2 / Branch 3 Managers
  const mainManager = await User.findOne({ role: 'manager', username: 'manager' });
  if (mainManager) {
    mainManager.branchId = mainBranch._id;
    mainManager.name = 'Shop Manager (Main Branch)';
    await mainManager.save();
    console.log('Assigned Main Manager to Main Branch');
  }

  // Branch 2 Manager
  let b2Manager = await User.findOne({ username: 'manager_b2' });
  if (!b2Manager) {
    b2Manager = new User({
      username: 'manager_b2',
      name: 'Shop Manager (Branch 2)',
      role: 'manager',
      branchId: branch2._id,
      pin: '8734',
      password: 'managerpassword8734',
      phone: '9976885361',
    });
    await b2Manager.save();
    console.log('Created Shop Manager for Branch 2');
  }

  // Branch 3 Manager
  let b3Manager = await User.findOne({ username: 'manager_b3' });
  if (!b3Manager) {
    b3Manager = new User({
      username: 'manager_b3',
      name: 'Shop Manager (Branch 3)',
      role: 'manager',
      branchId: branch3._id,
      pin: '8734',
      password: 'managerpassword8734',
      phone: '9842329813',
    });
    await b3Manager.save();
    console.log('Created Shop Manager for Branch 3');
  }

  console.log('Migration finished successfully!');
  process.exit(0);
})();

