const mongoose = require('mongoose');

const cleanString = (str) => {
  if (!str || typeof str !== 'string') return str;
  // Remove parenthetical expressions that contain Tamil characters, e.g. " (மேலாளர்)" or " (கார்த்திக்)"
  let cleaned = str.replace(/\s*\([^)]*[\u0B80-\u0BFF][^)]*\)/g, '');
  // Remove any remaining raw Tamil characters
  cleaned = cleaned.replace(/[\u0B80-\u0BFF]/g, '');
  // Clean up any extra spaces
  return cleaned.replace(/\s+/g, ' ').trim();
};

async function run() {
  await mongoose.connect('mongodb://127.0.0.1:27017/csb_bakery');
  console.log('Connected to MongoDB');

  // 1. Clean Users
  const users = await mongoose.connection.collection('users').find({}).toArray();
  for (const u of users) {
    const newName = cleanString(u.name);
    if (newName !== u.name) {
      await mongoose.connection.collection('users').updateOne(
        { _id: u._id },
        { $set: { name: newName } }
      );
      console.log(`Updated user ${u.username}: "${u.name}" -> "${newName}"`);
    }
  }

  // 2. Clean Branches
  const branches = await mongoose.connection.collection('branches').find({}).toArray();
  for (const b of branches) {
    const newName = cleanString(b.name);
    if (newName !== b.name) {
      await mongoose.connection.collection('branches').updateOne(
        { _id: b._id },
        { $set: { name: newName } }
      );
      console.log(`Updated branch: "${b.name}" -> "${newName}"`);
    }
  }

  // 3. Clean Staffs
  const staffs = await mongoose.connection.collection('staffs').find({}).toArray();
  for (const s of staffs) {
    const newName = cleanString(s.name);
    const newRole = cleanString(s.role);
    if (newName !== s.name || newRole !== s.role) {
      await mongoose.connection.collection('staffs').updateOne(
        { _id: s._id },
        { $set: { name: newName, role: newRole } }
      );
      console.log(`Updated staff: "${s.name}" -> "${newName}", role: "${s.role}" -> "${newRole}"`);
    }
  }

  // 4. Clean Attendances
  const attendances = await mongoose.connection.collection('attendances').find({}).toArray();
  for (const a of attendances) {
    let modified = false;
    const records = (a.records || []).map((r) => {
      const cleanStaff = cleanString(r.staffName);
      const cleanR = cleanString(r.role);
      if (cleanStaff !== r.staffName || cleanR !== r.role) {
        modified = true;
      }
      return {
        ...r,
        staffName: cleanStaff,
        role: cleanR,
      };
    });
    if (modified) {
      await mongoose.connection.collection('attendances').updateOne(
        { _id: a._id },
        { $set: { records } }
      );
      console.log(`Updated attendance for ${a.date}`);
    }
  }

  // 5. Clean Audit Logs
  const auditLogs = await mongoose.connection.collection('auditlogs').find({}).toArray();
  let auditUpdated = 0;
  for (const log of auditLogs) {
    let changed = false;
    const update = {};

    if (log.performedBy && log.performedBy.name) {
      const c = cleanString(log.performedBy.name);
      if (c !== log.performedBy.name) {
        update['performedBy.name'] = c;
        changed = true;
      }
    }

    if (log.description) {
      const c = cleanString(log.description);
      if (c !== log.description) {
        update.description = c;
        changed = true;
      }
    }

    if (log.branchName) {
      const c = cleanString(log.branchName);
      if (c !== log.branchName) {
        update.branchName = c;
        changed = true;
      }
    }

    if (log.details) {
      const c = cleanString(log.details);
      if (c !== log.details) {
        update.details = c;
        changed = true;
      }
    }

    if (log.fieldName) {
      const c = cleanString(log.fieldName);
      if (c !== log.fieldName) {
        update.fieldName = c;
        changed = true;
      }
    }

    if (log.oldValue && typeof log.oldValue === 'string') {
      const c = cleanString(log.oldValue);
      if (c !== log.oldValue) {
        update.oldValue = c;
        changed = true;
      }
    }

    if (log.newValue && typeof log.newValue === 'string') {
      const c = cleanString(log.newValue);
      if (c !== log.newValue) {
        update.newValue = c;
        changed = true;
      }
    }

    if (changed) {
      await mongoose.connection.collection('auditlogs').updateOne(
        { _id: log._id },
        { $set: update }
      );
      auditUpdated++;
    }
  }
  console.log(`Cleaned ${auditUpdated} audit log entries.`);

  console.log('Cleanup finished successfully.');
  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});

