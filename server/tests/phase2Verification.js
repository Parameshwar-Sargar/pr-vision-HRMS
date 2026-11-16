import { connectDB, disconnectDB } from '../src/config/db.js';
import app from '../src/app.js';
import Employee from '../src/models/Employee.js';
import Department from '../src/models/Department.js';
import Designation from '../src/models/Designation.js';
import Branch from '../src/models/Branch.js';
import Attendance from '../src/models/Attendance.js';
import LeaveRequest from '../src/models/LeaveRequest.js';
import PayrollRun from '../src/models/PayrollRun.js';
import Payslip from '../src/models/Payslip.js';
import User from '../src/models/User.js';

let serverInstance = null;
let BASE_URL = 'http://localhost:5000';

async function runPhase2Verification() {
  console.log('================================================================================');
  console.log('🧪 PR VISION HRMS — PHASE 2 BACKEND QUERY OPTIMIZATION VERIFICATION SUITE');
  console.log('================================================================================\n');

  await connectDB({ exitOnError: true });

  await new Promise((resolve) => {
    serverInstance = app.listen(0, () => {
      const port = serverInstance.address().port;
      BASE_URL = `http://localhost:${port}`;
      console.log(`🚀 Ephemeral verification server listening on port ${port}`);
      resolve();
    });
  });

  const results = {
    authLogin: false,
    authMe: false,
    dashboardStats: false,
    employeeList: false,
    employeePagination: false,
    departmentList: false,
    designationList: false,
    attendanceList: false,
    leaveRequests: false,
    payrollRuns: false,
    payslips: false,
    recruitmentJobs: false,
    recruitmentCandidates: false,
    reportsJson: false,
    reportsCsv: false,
    dataIntegrity: false,
  };

  try {
    // 1. Login
    console.log('--- 1. Authentication (Login & /auth/me) ---');
    const loginRes = await fetch(`${BASE_URL}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@prvision.com', password: 'Password@123' }),
    });
    const loginData = await loginRes.json();
    const token = loginData.data?.tokens?.accessToken;
    results.authLogin = loginRes.status === 200 && !!token;
    console.log(`[PASS: ${results.authLogin}] POST /auth/login -> status: ${loginRes.status}`);

    const authHeaders = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };

    const meRes = await fetch(`${BASE_URL}/api/v1/auth/me`, { headers: authHeaders });
    const meData = await meRes.json();
    results.authMe = meRes.status === 200 && meData.data?.user?.email === 'admin@prvision.com';
    console.log(`[PASS: ${results.authMe}] GET /auth/me -> email: ${meData.data?.user?.email}`);

    // 2. Dashboard Statistics
    console.log('\n--- 2. Dashboard Statistics (/dashboard/stats) ---');
    const dashRes = await fetch(`${BASE_URL}/api/v1/dashboard/stats`, { headers: authHeaders });
    const dashData = await dashRes.json();
    const kpi = dashData.data?.kpi;
    const hasKpi =
      kpi &&
      typeof kpi.totalEmployees === 'number' &&
      typeof kpi.activeEmployees === 'number' &&
      Array.isArray(dashData.data?.departmentDistribution) &&
      Array.isArray(dashData.data?.attendanceTrends);
    results.dashboardStats = dashRes.status === 200 && hasKpi;
    console.log(
      `[PASS: ${results.dashboardStats}] GET /dashboard/stats -> totalEmployees: ${kpi?.totalEmployees}, activeEmployees: ${kpi?.activeEmployees}, serverTime: ${dashRes.headers.get('x-response-time')}`
    );

    // 3. Employee List & Pagination
    console.log('\n--- 3. Employee List & Pagination (/employees) ---');
    const empRes = await fetch(`${BASE_URL}/api/v1/employees?page=1&limit=5`, { headers: authHeaders });
    const empData = await empRes.json();
    const employees = empData.data?.employees || [];
    const empPagination = empData.data?.pagination;
    results.employeeList = empRes.status === 200 && Array.isArray(employees);
    results.employeePagination =
      empPagination &&
      empPagination.page === 1 &&
      empPagination.limit === 5 &&
      typeof empPagination.total === 'number' &&
      typeof empPagination.pages === 'number';
    console.log(
      `[PASS: ${results.employeeList}] GET /employees?page=1&limit=5 -> returned: ${employees.length}, pagination: ${JSON.stringify(empPagination)}`
    );

    // 4. Departments & Designations
    console.log('\n--- 4. Departments & Designations ---');
    const deptRes = await fetch(`${BASE_URL}/api/v1/departments`, { headers: authHeaders });
    const deptData = await deptRes.json();
    const depts = deptData.data?.departments || [];
    results.departmentList = deptRes.status === 200 && Array.isArray(depts);
    console.log(`[PASS: ${results.departmentList}] GET /departments -> count: ${depts.length}`);

    const desigRes = await fetch(`${BASE_URL}/api/v1/designations`, { headers: authHeaders });
    const desigData = await desigRes.json();
    const desigs = desigData.data?.designations || [];
    results.designationList = desigRes.status === 200 && Array.isArray(desigs);
    console.log(`[PASS: ${results.designationList}] GET /designations -> count: ${desigs.length}`);

    // 5. Attendance & Leaves
    console.log('\n--- 5. Attendance & Leaves ---');
    const attRes = await fetch(`${BASE_URL}/api/v1/attendance?limit=10`, { headers: authHeaders });
    const attData = await attRes.json();
    const attRecords = attData.data?.attendance || [];
    results.attendanceList = attRes.status === 200 && Array.isArray(attRecords) && !!attData.data?.pagination;
    console.log(`[PASS: ${results.attendanceList}] GET /attendance?limit=10 -> count: ${attRecords.length}`);

    const leaveRes = await fetch(`${BASE_URL}/api/v1/leaves/requests?limit=10`, { headers: authHeaders });
    const leaveData = await leaveRes.json();
    const leaves = leaveData.data?.requests || [];
    results.leaveRequests = leaveRes.status === 200 && Array.isArray(leaves) && !!leaveData.data?.pagination;
    console.log(`[PASS: ${results.leaveRequests}] GET /leaves/requests?limit=10 -> count: ${leaves.length}`);

    // 6. Payroll & Recruitment
    console.log('\n--- 6. Payroll & Recruitment ---');
    const payrollRes = await fetch(`${BASE_URL}/api/v1/payroll/runs?limit=10`, { headers: authHeaders });
    const payrollData = await payrollRes.json();
    const runs = payrollData.data?.runs || [];
    results.payrollRuns = payrollRes.status === 200 && Array.isArray(runs) && !!payrollData.data?.pagination;
    console.log(`[PASS: ${results.payrollRuns}] GET /payroll/runs?limit=10 -> count: ${runs.length}`);

    const payslipRes = await fetch(`${BASE_URL}/api/v1/payroll/payslips?limit=10`, { headers: authHeaders });
    const payslipData = await payslipRes.json();
    const payslips = payslipData.data?.payslips || [];
    results.payslips = payslipRes.status === 200 && Array.isArray(payslips) && !!payslipData.data?.pagination;
    console.log(`[PASS: ${results.payslips}] GET /payroll/payslips?limit=10 -> count: ${payslips.length}`);

    const jobsRes = await fetch(`${BASE_URL}/api/v1/recruitment/jobs?limit=10`, { headers: authHeaders });
    const jobsData = await jobsRes.json();
    const jobs = jobsData.data?.jobs || [];
    results.recruitmentJobs = jobsRes.status === 200 && Array.isArray(jobs) && !!jobsData.data?.pagination;
    console.log(`[PASS: ${results.recruitmentJobs}] GET /recruitment/jobs?limit=10 -> count: ${jobs.length}`);

    const candRes = await fetch(`${BASE_URL}/api/v1/recruitment/candidates?limit=10`, { headers: authHeaders });
    const candData = await candRes.json();
    const cands = candData.data?.candidates || [];
    results.recruitmentCandidates = candRes.status === 200 && Array.isArray(cands) && !!candData.data?.pagination;
    console.log(`[PASS: ${results.recruitmentCandidates}] GET /recruitment/candidates?limit=10 -> count: ${cands.length}`);

    // 7. Reports (JSON + CSV)
    console.log('\n--- 7. Reports (JSON & CSV Export) ---');
    const repJsonRes = await fetch(`${BASE_URL}/api/v1/reports/employees?limit=10`, { headers: authHeaders });
    const repJsonData = await repJsonRes.json();
    results.reportsJson = repJsonRes.status === 200 && Array.isArray(repJsonData.data?.employees);
    console.log(`[PASS: ${results.reportsJson}] GET /reports/employees (JSON) -> count: ${repJsonData.data?.employees?.length}`);

    const repCsvRes = await fetch(`${BASE_URL}/api/v1/reports/employees?format=csv`, { headers: authHeaders });
    const repCsvText = await repCsvRes.text();
    const isCsvHeader = repCsvText.startsWith('Employee ID,First Name,Last Name');
    results.reportsCsv = repCsvRes.status === 200 && isCsvHeader;
    console.log(`[PASS: ${results.reportsCsv}] GET /reports/employees (CSV) -> isCsvHeader: ${isCsvHeader}, length: ${repCsvText.length}`);

    // 8. Data Integrity Verification against Atlas
    console.log('\n--- 8. Database Records & Integrity Verification ---');
    const [empCount, deptCount, desigCount, branchCount, attCount, leaveCount, runCount, userCount] =
      await Promise.all([
        Employee.countDocuments({ isDeleted: false }),
        Department.countDocuments({ isDeleted: false }),
        Designation.countDocuments({ isDeleted: false }),
        Branch.countDocuments({ isDeleted: false }),
        Attendance.countDocuments(),
        LeaveRequest.countDocuments(),
        PayrollRun.countDocuments(),
        User.countDocuments(),
      ]);

    console.log(`Live Atlas Counts:
      - Employees (Active): ${empCount}
      - Departments: ${deptCount}
      - Designations: ${desigCount}
      - Branches: ${branchCount}
      - Attendance Records: ${attCount}
      - Leave Requests: ${leaveCount}
      - Payroll Runs: ${runCount}
      - Users: ${userCount}`);

    results.dataIntegrity =
      empCount >= 8 &&
      deptCount >= 7 &&
      desigCount >= 13 &&
      branchCount >= 3 &&
      attCount >= 30 &&
      userCount >= 6;
    console.log(`[PASS: ${results.dataIntegrity}] Data integrity verification: PASS`);

    // 9. Repeated 5-Iteration Benchmark
    console.log('\n--- 9. Benchmark: 5 Repeated Iterations (Server vs Client Latency) ---');
    const benchmarkEndpoints = [
      { name: 'Dashboard Stats', url: '/api/v1/dashboard/stats' },
      { name: 'Employees List', url: '/api/v1/employees?limit=50' },
      { name: 'Departments List', url: '/api/v1/departments' },
      { name: 'Designations List', url: '/api/v1/designations' },
      { name: 'Attendance List', url: '/api/v1/attendance?limit=50' },
      { name: 'Leave Requests', url: '/api/v1/leaves/requests?limit=50' },
      { name: 'Payroll Runs', url: '/api/v1/payroll/runs?limit=50' },
      { name: 'Recruitment Jobs', url: '/api/v1/recruitment/jobs?limit=50' },
      { name: 'Reports (Employees)', url: '/api/v1/reports/employees?limit=50' },
    ];

    console.log('\n| Endpoint | Run 1 | Run 2 | Run 3 | Run 4 | Run 5 | Server Avg | Client Avg |');
    console.log('| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |');

    for (const ep of benchmarkEndpoints) {
      const srvList = [];
      const cltList = [];
      const runStrings = [];

      for (let i = 0; i < 5; i++) {
        const t0 = performance.now();
        const res = await fetch(`${BASE_URL}${ep.url}`, { headers: authHeaders });
        const t1 = performance.now();
        const srv = parseFloat(res.headers.get('x-response-time')) || 0;
        const clt = t1 - t0;
        srvList.push(srv);
        cltList.push(clt);
        runStrings.push(`${srv.toFixed(0)}ms/${clt.toFixed(0)}ms`);
      }

      const srvAvg = (srvList.reduce((a, b) => a + b, 0) / srvList.length).toFixed(1);
      const cltAvg = (cltList.reduce((a, b) => a + b, 0) / cltList.length).toFixed(1);

      console.log(
        `| ${ep.name.padEnd(20)} | ${runStrings.join(' | ')} | **${srvAvg}ms** | **${cltAvg}ms** |`
      );
    }

    console.log('\n================================================================================');
    console.log('📊 VERIFICATION SUMMARY:');
    console.log(JSON.stringify(results, null, 2));
    const allPassed = Object.values(results).every(Boolean);
    console.log(`\nOVERALL STATUS: ${allPassed ? '✅ ALL 16 CHECKS PASSED' : '❌ SOME CHECKS FAILED'}`);
    console.log('================================================================================\n');
  } catch (err) {
    console.error('❌ Verification failed with error:', err);
  } finally {
    if (serverInstance) {
      await new Promise((resolve) => serverInstance.close(resolve));
      console.log('🛑 Ephemeral verification server closed.');
    }
    await disconnectDB();
  }
}

runPhase2Verification();

