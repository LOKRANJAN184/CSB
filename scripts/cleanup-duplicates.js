#!/usr/bin/env node
// One-time clean-up of duplicate seed data in the database.
//
// The old server seeded starter data on every cold start; two cold starts at
// the same moment created everything twice (2 owners, 2× each branch, 2× each
// manager) plus 15 demo staff without a branch.
//
//   node scripts/cleanup-duplicates.js          → DRY RUN: only prints what it would do
//   node scripts/cleanup-duplicates.js --apply  → actually changes the database
//
// Keeps the OLDEST copy of each branch/user (and anything that has real sales
// or attendance attached). Uses MONGODB_URI from .env.
require('dotenv').config({ quiet: true });
const mongoose = require('mongoose');

const APPLY = process.argv.includes('--apply');

(async () => {
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  const db = mongoose.connection.db;
  const log = (...a) => console.log(APPLY ? '[APPLY]' : '[dry-run]', ...a);

  // 1. Branches: keep one per code — the one with data, else the oldest.
  const branches = await db.collection('branches').find().sort({ _id: 1 }).toArray();
  const byCode = {};
  for (const b of branches) (byCode[b.code] ||= []).push(b);
  const remap = {}; // duplicate branch id → kept branch id
  for (const [code, list] of Object.entries(byCode)) {
    if (list.length < 2) continue;
    const withData = [];
    for (const b of list) {
      const n = (await db.collection('dailysales').countDocuments({ branchId: b._id })) + (await db.collection('attendances').countDocuments({ branchId: b._id }));
      withData.push({ b, n });
    }
    withData.sort((x, y) => y.n - x.n || String(x.b._id).localeCompare(String(y.b._id)));
    const keep = withData[0].b;
    for (const { b, n } of withData.slice(1)) {
      if (n > 0) { log(`branch ${code} ${b._id} has ${n} records — moving them to ${keep._id}`); }
      remap[String(b._id)] = keep._id;
      log(`remove duplicate branch ${code} ${b._id} (keeping ${keep._id})`);
    }
  }

  // 2. Users: one owner; one manager per kept branch.
  const users = await db.collection('users').find().sort({ _id: 1 }).toArray();
  const owners = users.filter((u) => u.role === 'owner');
  const removeUsers = owners.slice(1).map((u) => u._id);
  const seenManagerBranch = new Set();
  for (const m of users.filter((u) => u.role === 'manager')) {
    const branch = String(remap[String(m.branchId)] || m.branchId);
    if (seenManagerBranch.has(branch)) removeUsers.push(m._id);
    else seenManagerBranch.add(branch);
  }
  for (const id of removeUsers) log(`remove duplicate user ${id} (${users.find((u) => u._id.equals(id)).username})`);

  // 3. Demo staff without a branch (invisible in the new app).
  const orphanStaff = await db.collection('staffs').find({ branchId: { $exists: false } }).project({ name: 1 }).toArray();
  log(`remove ${orphanStaff.length} demo staff with no branch: ${[...new Set(orphanStaff.map((s) => s.name))].join(', ')}`);

  if (APPLY) {
    for (const [from, to] of Object.entries(remap)) {
      const fromId = new mongoose.Types.ObjectId(from);
      for (const c of ['dailysales', 'attendances', 'staffs', 'auditlogs']) await db.collection(c).updateMany({ branchId: fromId }, { $set: { branchId: to } });
      await db.collection('branches').deleteOne({ _id: fromId });
    }
    if (removeUsers.length) await db.collection('users').deleteMany({ _id: { $in: removeUsers } });
    if (orphanStaff.length) await db.collection('staffs').deleteMany({ branchId: { $exists: false } });
    // Make sure the database itself prevents duplicates from now on.
    await db.collection('users').createIndex({ username: 1 }, { unique: true });
    await db.collection('branches').createIndex({ code: 1 }, { unique: true });
    console.log('Done. Unique indexes ensured on users.username and branches.code.');
  } else {
    console.log('\nNothing was changed. Re-run with --apply to make these changes.');
  }
  await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
