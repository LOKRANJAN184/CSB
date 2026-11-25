const crypto = require('crypto');
const env = require('../config/env');
const User = require('../models/User');
const Branch = require('../models/Branch');

// Runs once, ONLY when the database has no users at all (a brand-new install).
// It never touches an existing database, so it can never overwrite PINs the
// owner has changed. PINs come from environment variables, never from code.

const randomPin = () => String(crypto.randomInt(1000, 10000));

async function seedIfEmpty() {
  if ((await User.estimatedDocumentCount()) > 0) return;

  console.log('[seed] Empty database detected — creating starter data.');

  let branch = await Branch.findOne({ code: 'MAIN' });
  if (!branch) branch = await Branch.create({ name: 'Main Branch', code: 'MAIN' });

  // "9876543210:1234,9123456780:5678"
  let ownerLogins = env.seedOwnerLogins
    .split(',')
    .map((pair) => pair.split(':').map((s) => s.trim()))
    .filter(([phone, pin]) => /^\d{10}$/.test(phone) && /^\d{4,6}$/.test(pin));

  if (!ownerLogins.length) {
    ownerLogins = [['9999999999', randomPin()]];
  }
  const managerPin = /^\d{4,6}$/.test(env.seedManagerPin) ? env.seedManagerPin : randomPin();

  await User.create({
    username: 'owner',
    name: 'Owner',
    role: 'owner',
    pin: await User.hashPin(ownerLogins[0][1]),
    phone: ownerLogins[0][0],
    allowedPhones: ownerLogins.map(([p]) => p),
    phoneCredentials: await Promise.all(ownerLogins.map(async ([phone, pin]) => ({ phone, pin: await User.hashPin(pin) }))),
  });

  await User.create({
    username: 'manager_main',
    name: 'Shop Manager',
    role: 'manager',
    branchId: branch._id,
    pin: await User.hashPin(managerPin),
  });

  console.log('[seed] Owner logins:', ownerLogins.map(([p, pin]) => `${p} / PIN ${pin}`).join(', '));
  console.log(`[seed] Manager (${branch.name}) PIN: ${managerPin}`);
  console.log('[seed] Change these PINs from Settings after your first login.');
}

module.exports = { seedIfEmpty };
