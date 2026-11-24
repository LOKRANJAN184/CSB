// Comprehensive End-to-End Verification of Shop Manager Device Lock
const http = require('http');

const PORT = 5000;
const HOST = '127.0.0.1';

function request(path, options = {}) {
  return new Promise((resolve, reject) => {
    const headers = options.headers || {};
    const method = options.method || 'GET';
    const postData = options.body ? (typeof options.body === 'string' ? options.body : JSON.stringify(options.body)) : null;

    if (postData && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }
    if (postData) {
      headers['Content-Length'] = Buffer.byteLength(postData);
    }

    const req = http.request({
      host: HOST,
      port: PORT,
      path,
      method,
      headers,
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch (e) { json = data; }
        resolve({ status: res.statusCode, headers: res.headers, data: json });
      });
    });

    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

async function runTests() {
  console.log('=== STARTING DEVICE LOCK TESTS ===\n');

  // STEP 1: Owner login from an arbitrary device (Owner should never be blocked)
  console.log('1. Owner login from arbitrary Device-Owner-1...');
  const ownerLoginRes = await request('/api/auth/login', {
    method: 'POST',
    headers: {
      'x-device-id': 'dev_owner_pc_99',
      'x-device-name': 'Owner Laptop PC',
    },
    body: { role: 'owner', pin: '7492', phone: '9025351545' },
  });
  console.log(`   Status: ${ownerLoginRes.status}, User: ${ownerLoginRes.data.user?.name}`);
  if (ownerLoginRes.status !== 200) throw new Error('Owner login failed');
  const ownerToken = ownerLoginRes.data.token;

  // Clear any existing approved/pending device on manager to test clean state
  console.log('\n2. Resetting manager device state (Remove any current approved device)...');
  await request('/api/devices/remove', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ownerToken}`,
      'x-device-id': 'dev_owner_pc_99',
    },
  });

  // STEP 2: Manager attempts first login from Phone 1 (unapproved)
  console.log('\n3. Shop Manager attempts first login from Phone 1 (dev_phone_1)...');
  const mgrPhone1Login = await request('/api/auth/login', {
    method: 'POST',
    headers: {
      'x-device-id': 'dev_phone_1',
      'x-device-name': 'Samsung Galaxy Shop Tablet',
    },
    body: { role: 'manager', pin: '8734' },
  });
  console.log(`   Status: ${mgrPhone1Login.status} (Expected 403)`);
  console.log(`   Code: ${mgrPhone1Login.data.code}`);
  console.log(`   Message: "${mgrPhone1Login.data.message}"`);
  if (mgrPhone1Login.status !== 403 || mgrPhone1Login.data.code !== 'DEVICE_NOT_APPROVED') {
    throw new Error('Manager first login should be rejected with 403 DEVICE_NOT_APPROVED');
  }

  // STEP 3: Owner checks device status
  console.log('\n4. Owner checks device status (/api/devices/status)...');
  const statusRes = await request('/api/devices/status', {
    headers: {
      Authorization: `Bearer ${ownerToken}`,
      'x-device-id': 'dev_owner_pc_99',
    },
  });
  console.log('   Pending Device:', statusRes.data.pendingDevice);
  console.log('   Approved Device:', statusRes.data.approvedDevice);
  if (!statusRes.data.pendingDevice || statusRes.data.pendingDevice.deviceId !== 'dev_phone_1') {
    throw new Error('Pending device request for dev_phone_1 was not found in device status');
  }

  // STEP 4: Owner approves Phone 1
  console.log('\n5. Owner approves Phone 1 (dev_phone_1)...');
  const approveRes = await request('/api/devices/approve', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ownerToken}`,
      'x-device-id': 'dev_owner_pc_99',
    },
    body: {
      deviceId: 'dev_phone_1',
      deviceName: 'Samsung Galaxy Shop Tablet',
    },
  });
  console.log(`   Status: ${approveRes.status}, Message: "${approveRes.data.message}"`);
  if (approveRes.status !== 200 || !approveRes.data.success) {
    throw new Error('Approval failed');
  }

  // STEP 4B: Manager tries wrong PIN (e.g. 1111) on approved Phone 1 -> REJECTED
  console.log('\n5b. Manager tries wrong PIN 1111 on approved Phone 1 (Must be rejected)...');
  const mgrWrongPin = await request('/api/auth/login', {
    method: 'POST',
    headers: {
      'x-device-id': 'dev_phone_1',
      'x-device-name': 'Samsung Galaxy Shop Tablet',
    },
    body: { role: 'manager', pin: '1111' },
  });
  console.log(`   Status: ${mgrWrongPin.status} (Expected 401)`);
  if (mgrWrongPin.status !== 401) {
    throw new Error('Wrong PIN should be rejected with 401');
  }

  // STEP 5: Manager logs in from approved Phone 1 with correct password 8734
  console.log('\n6. Manager logs in with correct password 8734 from approved Phone 1...');
  const mgrLoginSuccess = await request('/api/auth/login', {
    method: 'POST',
    headers: {
      'x-device-id': 'dev_phone_1',
      'x-device-name': 'Samsung Galaxy Shop Tablet',
    },
    body: { role: 'manager', pin: '8734' },
  });
  console.log(`   Status: ${mgrLoginSuccess.status} (Expected 200)`);
  if (mgrLoginSuccess.status !== 200) {
    throw new Error('Manager login with password 8734 from approved device should succeed');
  }
  const managerToken = mgrLoginSuccess.data.token;

  // STEP 6: Manager makes API request with approved Phone 1
  console.log('\n7. Manager calls GET /api/sales/today with approved Phone 1...');
  const todaySales = await request('/api/sales/today', {
    headers: {
      Authorization: `Bearer ${managerToken}`,
      'x-device-id': 'dev_phone_1',
    },
  });
  console.log(`   Status: ${todaySales.status} (Expected 200)`);
  if (todaySales.status !== 200) {
    throw new Error('Manager request from approved device failed');
  }

  // STEP 7: Manager attempts to make API request with token, but from unauthorized Device 2
  console.log('\n8. Manager attempts API request using token but from unapproved Device 2 (dev_phone_2)...');
  const blockedRequest = await request('/api/sales/today', {
    headers: {
      Authorization: `Bearer ${managerToken}`,
      'x-device-id': 'dev_phone_2',
      'x-device-name': 'Unauthorized Personal Phone',
    },
  });
  console.log(`   Status: ${blockedRequest.status} (Expected 403)`);
  console.log(`   Code: ${blockedRequest.data.code}`);
  console.log(`   Message: "${blockedRequest.data.message}"`);
  if (blockedRequest.status !== 403 || blockedRequest.data.code !== 'DEVICE_BLOCKED') {
    throw new Error('Request from unauthorized device was not blocked');
  }

  // STEP 8: Manager tries to log in with PIN from unauthorized Device 2
  console.log('\n9. Manager attempts login from unauthorized Device 2 (dev_phone_2)...');
  const mgrPhone2Login = await request('/api/auth/login', {
    method: 'POST',
    headers: {
      'x-device-id': 'dev_phone_2',
      'x-device-name': 'Unauthorized Personal Phone',
    },
    body: { role: 'manager', pin: '8734' },
  });
  console.log(`   Status: ${mgrPhone2Login.status} (Expected 403)`);
  console.log(`   Code: ${mgrPhone2Login.data.code}`);
  console.log(`   Message: "${mgrPhone2Login.data.message}"`);
  console.log(`   SubMessage: "${mgrPhone2Login.data.subMessage}"`);
  if (mgrPhone2Login.status !== 403 || mgrPhone2Login.data.code !== 'DEVICE_NOT_APPROVED') {
    throw new Error('Login from unauthorized device was not blocked');
  }

  // STEP 9: Owner approves Device 2 (Must REPLACE Device 1, only 1 allowed)
  console.log('\n10. Owner approves Device 2 (dev_phone_2) - Replaces Device 1...');
  const replaceRes = await request('/api/devices/approve', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ownerToken}`,
      'x-device-id': 'dev_owner_pc_99',
    },
    body: {
      deviceId: 'dev_phone_2',
      deviceName: 'New Shop iPad',
    },
  });
  console.log(`   Status: ${replaceRes.status}, Message: "${replaceRes.data.message}"`);

  // STEP 10: Verify Device 1 is now BLOCKED on API requests
  console.log('\n11. Verify Device 1 is now BLOCKED because Device 2 replaced it...');
  const dev1NowBlocked = await request('/api/sales/today', {
    headers: {
      Authorization: `Bearer ${managerToken}`,
      'x-device-id': 'dev_phone_1',
      'x-device-name': 'Old Phone 1',
    },
  });
  console.log(`   Status: ${dev1NowBlocked.status} (Expected 403)`);
  console.log(`   Code: ${dev1NowBlocked.data.code}`);
  if (dev1NowBlocked.status !== 403 || dev1NowBlocked.data.code !== 'DEVICE_BLOCKED') {
    throw new Error('Device 1 should now be blocked');
  }

  // STEP 11: Verify Edit History (AuditLog) contains blocked attempts
  console.log('\n12. Owner inspects Audit Log for Security / BLOCKED_ATTEMPT records...');
  const historyRes = await request('/api/history', {
    headers: {
      Authorization: `Bearer ${ownerToken}`,
      'x-device-id': 'dev_owner_pc_99',
    },
  });
  const securityLogs = (historyRes.data.logs || []).filter(l => l.module === 'Security' || l.action === 'BLOCKED_ATTEMPT');
  console.log(`   Found ${securityLogs.length} Security / Blocked attempt audit log(s):`);
  securityLogs.slice(0, 5).forEach(l => {
    console.log(`   - [${l.action}] ${l.description} (${l.timestamp})`);
  });
  if (securityLogs.length === 0) {
    throw new Error('No blocked attempts found in AuditLog');
  }

  // STEP 12: Owner removes approved device -> Manager locked out
  console.log('\n13. Owner removes approved device (Locking Manager out completely)...');
  const removeRes = await request('/api/devices/remove', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ownerToken}`,
      'x-device-id': 'dev_owner_pc_99',
    },
  });
  console.log(`   Status: ${removeRes.status}, Message: "${removeRes.data.message}"`);

  const dev2NowBlockedAfterRemoval = await request('/api/sales/today', {
    headers: {
      Authorization: `Bearer ${managerToken}`,
      'x-device-id': 'dev_phone_2',
      'x-device-name': 'New Shop iPad',
    },
  });
  console.log(`   Manager request after removal status: ${dev2NowBlockedAfterRemoval.status} (Expected 403)`);
  if (dev2NowBlockedAfterRemoval.status !== 403) {
    throw new Error('Manager should be locked out after device removal');
  }

  console.log('\n=============================================');
  console.log(' ALL 13 DEVICE LOCK VERIFICATION TESTS PASSED!');
  console.log('=============================================');
}

runTests().catch(err => {
  console.error('\nTEST FAILED:', err);
  process.exit(1);
});
