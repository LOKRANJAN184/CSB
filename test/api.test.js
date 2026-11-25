// End-to-end API test. Runs against a throwaway LOCAL database.
//   npm test
// It never touches your real (Atlas) data: MONGODB_URI is overridden below.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

process.env.MONGODB_URI = process.env.TEST_MONGODB_URI || 'mongodb://127.0.0.1:27017/csb_test_' + Date.now();
process.env.SEED_OWNER_LOGINS = '9000000001:1111,9000000002:2222';
process.env.SEED_MANAGER_PIN = '4321';
process.env.JWT_SECRET = 'test-secret';
delete process.env.VERCEL;

const mongoose = require('mongoose');
const sharp = require('sharp');
const app = require('../server/app');
const { today } = require('../server/lib/dates');

let server;
let base;
const DEVICE = 'test-device-1';

async function call(method, path, { token, body, headers = {}, raw } = {}) {
  const h = { ...headers };
  if (token) h.Authorization = `Bearer ${token}`;
  if (body && !(body instanceof FormData)) h['Content-Type'] = 'application/json';
  const res = await fetch(base + path, { method, headers: h, body: body instanceof FormData ? body : body && JSON.stringify(body) });
  if (raw) return res;
  return { status: res.status, ...(await res.json()) };
}

before(async () => {
  await new Promise((r) => (server = app.listen(0, r)));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  server.close();
});

let owner;
let manager;
let branchId;

test('health', async () => {
  const r = await call('GET', '/api/health');
  assert.equal(r.ok, true);
});

test('owner login: wrong PIN rejected, right PIN accepted', async () => {
  const bad = await call('POST', '/api/auth/login', { body: { mode: 'owner', phone: '9000000001', pin: '9999' } });
  assert.equal(bad.status, 401);
  const wrongPhone = await call('POST', '/api/auth/login', { body: { mode: 'owner', phone: '9000000001', pin: '2222' } });
  assert.equal(wrongPhone.status, 401, 'a PIN only works with its own phone');
  const ok = await call('POST', '/api/auth/login', { body: { mode: 'owner', phone: '9000000001', pin: '1111' } });
  assert.equal(ok.ok, true);
  owner = ok.token;
});

test('branches list is public', async () => {
  const r = await call('GET', '/api/branches');
  assert.equal(r.branches.length, 1);
  branchId = r.branches[0].id;
});

test('manager device lock: pending → approved → login', async () => {
  const login = () => call('POST', '/api/auth/login', { body: { mode: 'manager', branchId, pin: '4321', deviceId: DEVICE, deviceName: 'Counter phone' } });
  const first = await login();
  assert.equal(first.code, 'DEVICE_PENDING');

  const manage = await call('GET', '/api/branches/manage', { token: owner });
  assert.equal(manage.branches[0].manager.pendingDevice.deviceId, DEVICE);

  const approve = await call('POST', `/api/devices/${branchId}/approve`, { token: owner, body: {} });
  assert.equal(approve.ok, true);

  const second = await login();
  assert.equal(second.ok, true);
  manager = second.token;

  const otherDevice = await call('GET', '/api/staff', { token: manager, headers: { 'X-Device-Id': 'someone-else' } });
  assert.equal(otherDevice.status, 403, 'token is useless from another device');
});

const mh = () => ({ token: manager, headers: { 'X-Device-Id': DEVICE } });

test('staff: manager adds staff but cannot see or set salary', async () => {
  const add = await call('POST', '/api/staff', { ...mh(), body: { name: 'Muthu', role: 'Sweet master', dailySalary: 900 } });
  assert.equal(add.ok, true);
  assert.equal(add.staff.dailySalary, undefined);

  const asOwner = await call('PUT', `/api/staff/${add.staff.id}`, { token: owner, body: { dailySalary: 800 } });
  assert.equal(asOwner.staff.dailySalary, 800);

  const list = await call('GET', '/api/staff', mh());
  assert.equal(list.staff[0].dailySalary, undefined);
});

let photoId;
test('photo upload is compressed and stored in MongoDB', async () => {
  const png = await sharp({ create: { width: 2400, height: 1800, channels: 3, background: '#c96' } }).jpeg().toBuffer();
  const form = new FormData();
  form.append('photo', new Blob([png], { type: 'image/jpeg' }), 'bill.jpg');
  const r = await call('POST', '/api/photos', { ...mh(), body: form });
  assert.equal(r.ok, true);
  photoId = r.id;
  const img = await call('GET', `/api/photos/${photoId}`, { ...mh(), raw: true });
  assert.equal(img.headers.get('content-type'), 'image/webp');
  const meta = await sharp(Buffer.from(await img.arrayBuffer())).metadata();
  assert.ok(meta.width <= 1600);
});

test('sales tally maths and permissions', async () => {
  const d = today();
  const r = await call('PUT', `/api/sales/${d}`, {
    ...mh(),
    body: { systemSales: 10000, totalCash: 6000, totalGpay: 3500, expenses: [{ amount: 400, note: 'Milk', photoId }] },
  });
  assert.equal(r.ok, true);
  assert.equal(r.record.totalExpenses, 400);
  assert.equal(r.record.difference, -100, 'shortage of 100');
  assert.equal(r.record.isTallied, false);

  const fix = await call('PUT', `/api/sales/${d}`, { ...mh(), body: { systemSales: 10000, totalCash: 6100, totalGpay: 3500, expenses: [{ amount: 400, note: 'Milk', photoId }] } });
  assert.equal(fix.record.isTallied, true);

  const past = await call('PUT', '/api/sales/2020-01-01', { ...mh(), body: { systemSales: 1 } });
  assert.equal(past.status, 403, 'manager cannot edit past days');
  const ownerPast = await call('PUT', '/api/sales/2020-01-01', { token: owner, headers: { 'X-Branch-Id': branchId }, body: { systemSales: 1, totalCash: 1 } });
  assert.equal(ownerPast.ok, true, 'owner can edit any day');

  const future = await call('PUT', '/api/sales/2999-01-01', { token: owner, body: { systemSales: 1 } });
  assert.equal(future.status, 400);
});

test('attendance save and monthly salary report', async () => {
  const d = today();
  const day = await call('GET', `/api/attendance/${d}`, mh());
  assert.equal(day.records.length, 1);
  const rec = { ...day.records[0], status: 'Half-day', inTime: '09:15 AM', outTime: '02:00 PM' };
  const saved = await call('PUT', `/api/attendance/${d}`, { ...mh(), body: { records: [rec] } });
  assert.equal(saved.ok, true);

  const month = d.slice(0, 7);
  const rep = await call('GET', `/api/reports/monthly?month=${month}`, { token: owner });
  assert.equal(rep.attendance.summary[0].payableDays, 0.5);
  assert.equal(rep.attendance.summary[0].salary, 400);

  const denied = await call('GET', `/api/reports/monthly?month=${month}`, mh());
  assert.equal(denied.status, 403, 'managers cannot see reports');
});

test('PDF download with short-lived token', async () => {
  const { token } = await call('POST', '/api/reports/download-token', { token: owner });
  const d = today();
  const res = await call('GET', `/api/reports/sales.pdf?from=${d.slice(0, 8)}01&to=${d}&dl=${token}`, { raw: true });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'application/pdf');
  const all = await call('GET', `/api/reports/sales.pdf?from=${d.slice(0, 8)}01&to=${d}&branchId=all&dl=${token}`, { raw: true });
  assert.equal(all.status, 200);
  const att = await call('GET', `/api/reports/attendance.pdf?from=${d.slice(0, 8)}01&to=${d}&dl=${token}`, { raw: true });
  assert.equal(att.status, 200);
  const misuse = await call('GET', '/api/staff', { token });
  assert.equal(misuse.status, 401, 'download token cannot be used as a login');
});

test('owner can change PIN; old PIN stops working', async () => {
  const r = await call('PUT', '/api/auth/owner-phones/9000000002', { token: owner, body: { pin: '5555' } });
  assert.equal(r.ok, true);
  const old = await call('POST', '/api/auth/login', { body: { mode: 'owner', phone: '9000000002', pin: '2222' } });
  assert.equal(old.status, 401);
  const fresh = await call('POST', '/api/auth/login', { body: { mode: 'owner', phone: '9000000002', pin: '5555' } });
  assert.equal(fresh.ok, true);
});

test('history records changes', async () => {
  const r = await call('GET', '/api/history', { token: owner, headers: { 'X-Branch-Id': 'all' } });
  assert.ok(r.logs.length > 5);
  assert.ok(r.logs.some((l) => l.fieldName === 'Cash'));
});

test('lockout after repeated wrong PINs', async () => {
  for (let i = 0; i < 8; i++) {
    await call('POST', '/api/auth/login', { body: { mode: 'manager', branchId, pin: '0000', deviceId: DEVICE } });
  }
  const r = await call('POST', '/api/auth/login', { body: { mode: 'manager', branchId, pin: '4321', deviceId: DEVICE } });
  assert.equal(r.status, 429);
});
