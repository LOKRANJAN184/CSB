const http = require('http');

function request(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const defaultHeaders = {
      'Content-Type': 'application/json',
      'x-device-id': 'dev_test_suite_123',
      'x-device-name': 'Test Device',
      ...headers,
    };
    const req = http.request({
      hostname: '127.0.0.1',
      port: 5000,
      path,
      method,
      headers: defaultHeaders,
    }, (res) => {
      let data = [];
      res.on('data', chunk => data.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(data);
        const contentType = res.headers['content-type'] || '';
        if (contentType.includes('application/json')) {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(buffer.toString('utf8')), headers: res.headers });
          } catch (e) {
            resolve({ status: res.statusCode, raw: buffer.toString('utf8'), headers: res.headers });
          }
        } else {
          resolve({ status: res.statusCode, buffer, headers: res.headers });
        }
      });
    });
    req.on('error', reject);
    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

async function runTests() {
  console.log('=== STARTING END-TO-END VERIFICATION ===\n');

  // 1. Get Branches
  console.log('1. Testing GET /api/branches...');
  const branchesRes = await request('GET', '/api/branches');
  if (branchesRes.status !== 200 || !branchesRes.data.success) {
    throw new Error('Failed to get branches: ' + JSON.stringify(branchesRes));
  }
  const branches = branchesRes.data.branches;
  console.log(`   Found ${branches.length} branches:`, branches.map(b => `${b.name} (${b.code})`).join(', '));
  const mainBranch = branches.find(b => b.code === 'MAIN');
  const branch2 = branches.find(b => b.code === 'BRANCH2');
  if (!mainBranch || !branch2) throw new Error('MAIN and BRANCH2 branches required');

  // 2. Manager Login for Main Branch
  console.log('\n2. Testing Main Branch Manager Login...');
  const mgr1Login = await request('POST', '/api/auth/login', {
    role: 'manager',
    pin: '8734',
    branchId: mainBranch._id,
  });
  console.log(`   Status: ${mgr1Login.status}, Message: ${mgr1Login.data?.message || mgr1Login.data?.error || JSON.stringify(mgr1Login.data)}`);
  // If device not approved, approve device first using Owner login
  let mgr1Token = mgr1Login.data?.token;

  // 3. Owner Login
  console.log('\n3. Testing Owner Login with phone 9025351545 and PIN 5351...');
  const ownerLogin = await request('POST', '/api/auth/login', {
    role: 'owner',
    phone: '9025351545',
    pin: '5351',
    branchId: mainBranch._id,
  });
  if (ownerLogin.status !== 200 || !ownerLogin.data?.token) {
    throw new Error('Owner login failed: ' + JSON.stringify(ownerLogin.data));
  }
  const ownerToken = ownerLogin.data.token;
  console.log(`   Owner login successful! Token received. User name: "${ownerLogin.data.user.name}"`);
  if (/[\u0B80-\u0BFF]/.test(ownerLogin.data.user.name)) {
    throw new Error('Owner name still contains Tamil script: ' + ownerLogin.data.user.name);
  }

  // If mgr1 was not approved yet, approve device
  if (!mgr1Token) {
    console.log('   Approving test device for Main Branch manager...');
    await request('POST', '/api/devices/approve', {
      deviceId: 'dev_test_suite_123',
      deviceName: 'Test Suite Device',
      branchId: mainBranch._id,
    }, { Authorization: `Bearer ${ownerToken}`, 'x-branch-id': mainBranch._id });

    const retryMgr1 = await request('POST', '/api/auth/login', {
      role: 'manager',
      pin: '8734',
      branchId: mainBranch._id,
    });
    mgr1Token = retryMgr1.data?.token;
    console.log(`   Main Branch Manager login after approval: status ${retryMgr1.status}, token: ${Boolean(mgr1Token)}`);
  }

  // 4. Test Manager Isolation: Main Branch Manager trying to access Branch 2
  console.log('\n4. Testing Manager Branch Isolation (Main manager trying to access Branch 2)...');
  const crossAccess = await request('GET', `/api/sales/2026-11-23`, null, {
    Authorization: `Bearer ${mgr1Token}`,
    'x-branch-id': branch2._id,
  });
  console.log(`   Cross-branch access returned status: ${crossAccess.status} (Expected 403)`);
  if (crossAccess.status !== 403) {
    throw new Error('Branch isolation failed: Manager was able to access another branch! Got: ' + crossAccess.status);
  }

  // 5. Manager Branch 2: Approve device and login
  console.log('\n5. Testing Branch 2 Manager Access...');
  await request('POST', '/api/devices/approve', {
    deviceId: 'dev_test_suite_123',
    deviceName: 'Test Suite Device',
    branchId: branch2._id,
  }, { Authorization: `Bearer ${ownerToken}`, 'x-branch-id': branch2._id });

  const mgr2Login = await request('POST', '/api/auth/login', {
    role: 'manager',
    pin: '8734',
    branchId: branch2._id,
  });
  const mgr2Token = mgr2Login.data?.token;
  console.log(`   Branch 2 Manager login: status ${mgr2Login.status}, token: ${Boolean(mgr2Token)}`);
  if (mgr2Login.status !== 200 || !mgr2Token) {
    throw new Error('Branch 2 Manager login failed: ' + JSON.stringify(mgr2Login.data));
  }

  // 6. Branch 2 Manager adds sales record
  console.log('\n6. Testing Branch 2 Sales Entry...');
  const createSales = await request('POST', '/api/sales', {
    date: '2026-11-23',
    systemSales: 15000,
    totalCash: 10000,
    totalGpay: 5000,
    expenses: [{ amount: 500, note: 'Sugar' }],
  }, { Authorization: `Bearer ${mgr2Token}`, 'x-branch-id': branch2._id });
  console.log(`   Branch 2 create sales status: ${createSales.status}`);
  if (createSales.status !== 200 && createSales.status !== 201) {
    throw new Error('Branch 2 sales entry failed: ' + JSON.stringify(createSales.data));
  }

  // 7. Verify Main Branch does NOT see Branch 2 sales
  console.log('\n7. Verifying Main Branch does NOT see Branch 2 sales...');
  const mainSales = await request('GET', '/api/sales/2026-11-23', null, {
    Authorization: `Bearer ${mgr1Token}`,
    'x-branch-id': mainBranch._id,
  });
  console.log(`   Main branch sales for 2026-11-23: systemSales = ${mainSales.data?.data?.systemSales || 0}`);
  if (mainSales.data?.data?.systemSales === 15000) {
    throw new Error('Isolation leak: Main Branch sees Branch 2 sales!');
  }

  // 8. Owner Sales History: All Branches
  console.log('\n8. Testing Owner "All Branches" Sales History Report...');
  const allBranchesHist = await request('GET', '/api/reports/sales-history?from=2026-11-01&to=2026-11-23&branchId=all', null, {
    Authorization: `Bearer ${ownerToken}`,
  });
  console.log(`   All branches report status: ${allBranchesHist.status}, isAllBranches: ${allBranchesHist.data?.isAllBranches}`);
  console.log(`   Branch summaries count: ${allBranchesHist.data?.branchSummaries?.length}`);
  console.log(`   Grand Total Sales: ₹${allBranchesHist.data?.grandTotal?.systemSales}`);

  // 9. Owner Download All Branches PDF
  console.log('\n9. Testing Owner "All Branches" PDF generation...');
  const allPdf = await request('GET', '/api/reports/sales-history/pdf?from=2026-11-01&to=2026-11-23&branchId=all', null, {
    Authorization: `Bearer ${ownerToken}`,
  });
  console.log(`   All Branches PDF status: ${allPdf.status}, size: ${allPdf.buffer?.length} bytes`);
  const pdfHeader = allPdf.buffer?.slice(0, 5).toString('ascii');
  if (pdfHeader !== '%PDF-') throw new Error('Generated file is not a valid PDF: ' + pdfHeader);

  // 10. Owner Download Single Branch Sales PDF
  console.log('\n10. Testing Owner Single Branch Sales PDF...');
  const singlePdf = await request('GET', `/api/reports/sales-history/pdf?from=2026-11-01&to=2026-11-23&branchId=${mainBranch._id}`, null, {
    Authorization: `Bearer ${ownerToken}`,
  });
  console.log(`   Single Branch Sales PDF status: ${singlePdf.status}, size: ${singlePdf.buffer?.length} bytes`);

  // 11. Owner Download Single Branch Attendance PDF
  console.log('\n11. Testing Owner Attendance History PDF...');
  const attPdf = await request('GET', `/api/reports/attendance-history/pdf?from=2026-11-01&to=2026-11-23&branchId=${mainBranch._id}`, null, {
    Authorization: `Bearer ${ownerToken}`,
  });
  console.log(`   Attendance History PDF status: ${attPdf.status}, size: ${attPdf.buffer?.length} bytes`);

  // 12. Owner Branch Management: Create, Edit, and Reset Manager
  console.log('\n12. Testing Owner Add Branch...');
  const newBranchCode = 'TESTBR_' + Date.now().toString(36).toUpperCase();
  const addBranchRes = await request('POST', '/api/branches', {
    name: 'Test Branch South',
    code: newBranchCode,
    address: 'South Bazaar',
    phone: '9842329813',
    managerPin: '4321',
    isActive: true,
  }, { Authorization: `Bearer ${ownerToken}` });
  console.log(`   Add branch status: ${addBranchRes.status}, branch name: ${addBranchRes.data?.branch?.name}`);
  const newBranchId = addBranchRes.data?.branch?._id;

  console.log('   Testing Reset Manager PIN for new branch...');
  const resetMgrRes = await request('POST', `/api/branches/${newBranchId}/manager`, {
    pin: '9876',
  }, { Authorization: `Bearer ${ownerToken}` });
  console.log(`   Reset manager PIN status: ${resetMgrRes.status}, message: ${resetMgrRes.data?.message}`);

  // 13. Audit Trail Check
  console.log('\n13. Testing Audit Trail Branch Logging & Clean Font...');
  const auditRes = await request('GET', '/api/history', null, { Authorization: `Bearer ${ownerToken}` });
  const logs = auditRes.data?.logs || [];
  console.log(`   Total audit logs retrieved: ${logs.length}`);
  const sampleLog = logs[0];
  console.log(`   Latest log: [${sampleLog.action}] by ${sampleLog.performedBy?.name} (Branch: ${sampleLog.branchName})`);
  const tamilRegex = /[\u0B80-\u0BFF]/;
  let tamilFound = false;
  for (const log of logs.slice(0, 30)) {
    if (tamilRegex.test(log.performedBy?.name || '') || tamilRegex.test(log.branchName || '')) {
      console.error('   Found Tamil in log:', log);
      tamilFound = true;
      break;
    }
  }
  if (tamilFound) throw new Error('Tamil characters found in recent audit logs!');
  console.log('   Verified: Recent audit logs contain clean English names and valid branch names.');

  console.log('\n=== ALL TESTS PASSED SUCCESSFULLY! ===');
}

runTests().catch(err => {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});
