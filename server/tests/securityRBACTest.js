import http from 'http';
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config({ path: '.env' });

function request(options, data = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try {
          const parsed = body ? JSON.parse(body) : null;
          resolve({ status: res.statusCode, headers: res.headers, body: parsed });
        } catch {
          resolve({ status: res.statusCode, headers: res.headers, rawBody: body });
        }
      });
    });
    req.on('error', reject);
    if (data) {
      req.write(typeof data === 'string' ? data : JSON.stringify(data));
    }
    req.end();
  });
}

async function login(email, password = 'Password@123') {
  const res = await request(
    {
      hostname: 'localhost',
      port: 5000,
      path: '/api/v1/auth/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    },
    { email, password }
  );
  if (res.status !== 200) {
    throw new Error(`Login failed for ${email}: status ${res.status} - ${JSON.stringify(res.body)}`);
  }
  return {
    token: res.body.data.tokens.accessToken,
    user: res.body.data.user,
  };
}

async function runSecurityTests() {
  console.log('================================================================');
  console.log('🔒 PR VISION HRMS: Complete RBAC & Employee Data Isolation Test');
  console.log('================================================================');

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB Atlas: pr_vision_hrms\n');

  // Fetch known test IDs
  const employees = await mongoose.connection.collection('employees').find({}).toArray();
  const amitEmp = employees.find((e) => e.email === 'employee@prvision.com');
  const rajivEmp = employees.find((e) => e.email === 'admin@prvision.com');
  const rajeshEmp = employees.find((e) => e.email === 'manager@prvision.com');
  const priyaEmp = employees.find((e) => e.email === 'hr@prvision.com');

  const leaves = await mongoose.connection.collection('leaverequests').find({}).toArray();
  const amitLeave = leaves.find((l) => l.employeeId.toString() === amitEmp._id.toString());
  const rajivLeave = leaves.find((l) => l.employeeId.toString() === rajivEmp._id.toString());

  const payslips = await mongoose.connection.collection('payslips').find({}).toArray();
  const amitPayslip = payslips.find((p) => p.employeeId.toString() === amitEmp._id.toString());
  const rajivPayslip = payslips.find((p) => p.employeeId.toString() === rajivEmp._id.toString());

  console.log(`Found Test Data in Atlas:`);
  console.log(`- Amit Patel ID    : ${amitEmp._id} (Leave: ${amitLeave?._id})`);
  console.log(`- Rajiv Verma ID   : ${rajivEmp._id} (Leave: ${rajivLeave?._id})`);
  console.log(`- Rajesh Nair ID   : ${rajeshEmp._id}`);
  console.log(`- Priya Sharma ID  : ${priyaEmp._id}\n`);

  let passed = 0;
  let failed = 0;

  function assert(condition, testName, details = '') {
    if (condition) {
      console.log(`✅ PASS: ${testName} ${details ? `(${details})` : ''}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${testName} ${details ? `(${details})` : ''}`);
      failed++;
    }
  }

  // TEST 1: Login as Amit Patel (EMPLOYEE)
  const amitAuth = await login('employee@prvision.com');
  assert(
    amitAuth.user.role === 'EMPLOYEE' && amitAuth.user.employeeId === amitEmp._id.toString(),
    'Test 1: Login as Amit Patel',
    `User verified as EMPLOYEE with employeeId: ${amitAuth.user.employeeId}`
  );

  // TEST 2 & 3: Open Leave Management & verify ONLY Amit's leaves are returned
  const leaveRes = await request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/v1/leaves/requests',
    method: 'GET',
    headers: { Authorization: `Bearer ${amitAuth.token}` },
  });
  const amitRequests = leaveRes.body?.data?.requests || [];
  const onlyAmitLeaves =
    amitRequests.length > 0 &&
    amitRequests.every((r) => r.employeeId?._id === amitEmp._id.toString() || r.employeeId === amitEmp._id.toString());
  assert(
    leaveRes.status === 200 && onlyAmitLeaves,
    'Test 2 & 3: Employee Leave List Isolation',
    `Returned ${amitRequests.length} leave(s), all strictly belonging to Amit Patel`
  );

  // TEST 4 & 5: Attempt to retrieve Rajiv Verma's leave record directly through the API
  if (rajivLeave) {
    const rajivLeaveRes = await request({
      hostname: 'localhost',
      port: 5000,
      path: `/api/v1/leaves/requests/${rajivLeave._id}`,
      method: 'GET',
      headers: { Authorization: `Bearer ${amitAuth.token}` },
    });
    assert(
      rajivLeaveRes.status === 403,
      "Test 4 & 5: Attempt to directly fetch Rajiv Verma's leave record by ID",
      `HTTP status: ${rajivLeaveRes.status} (Forbidden as required)`
    );
  }

  // TEST 6 & 7: Change employeeId in query parameter to another employee's ID (tampering attempt)
  const tamperRes = await request({
    hostname: 'localhost',
    port: 5000,
    path: `/api/v1/leaves/requests?employeeId=${rajivEmp._id}`,
    method: 'GET',
    headers: { Authorization: `Bearer ${amitAuth.token}` },
  });
  assert(
    tamperRes.status === 403,
    "Test 6 & 7: Tamper employeeId query param to Rajiv Verma's ID",
    `HTTP status: ${tamperRes.status} (Access Denied as required)`
  );

  // TEST 8 & 9: Attempt to approve another employee's leave
  if (rajivLeave) {
    const approveRes = await request(
      {
        hostname: 'localhost',
        port: 5000,
        path: `/api/v1/leaves/requests/${rajivLeave._id}/review`,
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${amitAuth.token}`,
          'Content-Type': 'application/json',
        },
      },
      { status: 'Approved', remarks: 'Unauthorized self-approval' }
    );
    assert(
      approveRes.status === 403,
      "Test 8 & 9: Attempt by EMPLOYEE to approve Rajiv Verma's leave request",
      `HTTP status: ${approveRes.status} (Forbidden as required)`
    );
  }

  // TEST 10 & 11: Attempt to open Organization Employee Directory
  const empDirRes = await request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/v1/employees',
    method: 'GET',
    headers: { Authorization: `Bearer ${amitAuth.token}` },
  });
  assert(
    empDirRes.status === 403,
    'Test 10 & 11: Attempt by EMPLOYEE to access complete Employee Directory',
    `HTTP status: ${empDirRes.status} (Organization directory denied to Employee)`
  );

  // Direct profile access check: Amit Patel attempting to view Rajiv Verma's profile
  const rajivProfileRes = await request({
    hostname: 'localhost',
    port: 5000,
    path: `/api/v1/employees/${rajivEmp._id}`,
    method: 'GET',
    headers: { Authorization: `Bearer ${amitAuth.token}` },
  });
  assert(
    rajivProfileRes.status === 403,
    "Test 11b: Attempt by EMPLOYEE to view Rajiv Verma's profile & salary",
    `HTTP status: ${rajivProfileRes.status} (Access Denied)`
  );

  // Self-profile access check: Amit Patel accessing /employees/me
  const selfProfileRes = await request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/v1/employees/me',
    method: 'GET',
    headers: { Authorization: `Bearer ${amitAuth.token}` },
  });
  assert(
    selfProfileRes.status === 200 && selfProfileRes.body?.data?.employee?._id === amitEmp._id.toString(),
    'Test 11c: Employee accessing own self-service profile (/employees/me)',
    `HTTP status: ${selfProfileRes.status} (Profile retrieved successfully)`
  );

  // TEST 12 & 13: Payroll self-service and cross-employee download protection
  const payslipListRes = await request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/v1/payroll/payslips',
    method: 'GET',
    headers: { Authorization: `Bearer ${amitAuth.token}` },
  });
  const amitPayslips = payslipListRes.body?.data?.payslips || [];
  const onlyAmitPayslips = amitPayslips.every(
    (p) => p.employeeId?._id === amitEmp._id.toString() || p.employeeId === amitEmp._id.toString()
  );
  assert(
    payslipListRes.status === 200 && onlyAmitPayslips,
    'Test 12: Employee Payslip List Isolation',
    `Returned ${amitPayslips.length} payslip(s), all strictly belonging to Amit Patel`
  );

  if (rajivPayslip) {
    const downloadRajivPayslipRes = await request({
      hostname: 'localhost',
      port: 5000,
      path: `/api/v1/payroll/payslips/${rajivPayslip._id}/pdf`,
      method: 'GET',
      headers: { Authorization: `Bearer ${amitAuth.token}` },
    });
    assert(
      downloadRajivPayslipRes.status === 403,
      "Test 13: Attempt by EMPLOYEE to download Rajiv Verma's PDF payslip",
      `HTTP status: ${downloadRajivPayslipRes.status} (Forbidden as required)`
    );
  }

  // ================= MANAGER TESTS =================
  console.log('\n--- Team Manager (Rajesh Nair) Scope Verification ---');
  const managerAuth = await login('manager@prvision.com');

  // Manager lists leaves: must see team (Amit Patel) and self, but NOT unrelated employees
  const managerLeaveRes = await request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/v1/leaves/requests',
    method: 'GET',
    headers: { Authorization: `Bearer ${managerAuth.token}` },
  });
  const managerRequests = managerLeaveRes.body?.data?.requests || [];
  const hasNoRajivInManagerList = !managerRequests.some(
    (r) => r.employeeId?._id === rajivEmp._id.toString() || r.employeeId === rajivEmp._id.toString()
  );
  assert(
    managerLeaveRes.status === 200 && hasNoRajivInManagerList,
    'Test 14 & 15: Manager Leave List Scope',
    `Manager sees ${managerRequests.length} team/self request(s); Rajiv Verma's leaves are properly excluded`
  );

  // Manager attempts to approve Rajiv Verma's leave (unauthorized outside reporting line)
  if (rajivLeave) {
    const managerApproveRajivRes = await request(
      {
        hostname: 'localhost',
        port: 5000,
        path: `/api/v1/leaves/requests/${rajivLeave._id}/review`,
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${managerAuth.token}`,
          'Content-Type': 'application/json',
        },
      },
      { status: 'Approved', remarks: 'Manager cross-team approval attempt' }
    );
    assert(
      managerApproveRajivRes.status === 403,
      "Test 16: Manager attempts to approve Rajiv Verma's leave (outside reporting line)",
      `HTTP status: ${managerApproveRajivRes.status} (Access Denied as required)`
    );
  }

  // Manager attempts to view Rajiv Verma's profile (outside reporting team)
  const managerViewRajivProfileRes = await request({
    hostname: 'localhost',
    port: 5000,
    path: `/api/v1/employees/${rajivEmp._id}`,
    method: 'GET',
    headers: { Authorization: `Bearer ${managerAuth.token}` },
  });
  assert(
    managerViewRajivProfileRes.status === 403,
    "Test 17: Manager attempts to view Rajiv Verma's profile (outside team)",
    `HTTP status: ${managerViewRajivProfileRes.status} (Access Denied as required)`
  );

  // Manager views direct report (Amit Patel): salary structure must NOT be leaked
  const managerViewAmitProfileRes = await request({
    hostname: 'localhost',
    port: 5000,
    path: `/api/v1/employees/${amitEmp._id}`,
    method: 'GET',
    headers: { Authorization: `Bearer ${managerAuth.token}` },
  });
  assert(
    managerViewAmitProfileRes.status === 200 && managerViewAmitProfileRes.body?.data?.salary === null,
    'Test 17b: Manager views team member profile (Salary data redacted)',
    `Profile loaded; salary structure is null for Manager`
  );

  // ================= ADMIN & HR TESTS =================
  console.log('\n--- Admin & HR Manager Scope Verification ---');
  const adminAuth = await login('admin@prvision.com');
  const adminEmpListRes = await request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/v1/employees',
    method: 'GET',
    headers: { Authorization: `Bearer ${adminAuth.token}` },
  });
  assert(
    adminEmpListRes.status === 200 && adminEmpListRes.body?.data?.employees?.length >= 8,
    'Test 18: Admin organization-wide employee directory access',
    `HTTP status 200; ${adminEmpListRes.body?.data?.employees?.length} employees returned`
  );

  const hrAuth = await login('hr@prvision.com');
  const hrLeaveListRes = await request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/v1/leaves/requests',
    method: 'GET',
    headers: { Authorization: `Bearer ${hrAuth.token}` },
  });
  assert(
    hrLeaveListRes.status === 200 && hrLeaveListRes.body?.data?.requests?.length >= 8,
    'Test 19: HR Manager organization-wide leave requests access',
    `HTTP status 200; ${hrLeaveListRes.body?.data?.requests?.length} leave requests returned`
  );

  console.log('\n================================================================');
  console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================');

  process.exit(failed > 0 ? 1 : 0);
}

runSecurityTests().catch((err) => {
  console.error('Test execution error:', err);
  process.exit(1);
});

