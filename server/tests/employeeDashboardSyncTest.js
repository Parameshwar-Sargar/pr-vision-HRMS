import mongoose from 'mongoose';
import { connectDB, disconnectDB } from '../src/config/db.js';
import { env } from '../src/config/env.js';
import User from '../src/models/User.js';
import Employee from '../src/models/Employee.js';
import Department from '../src/models/Department.js';
import Designation from '../src/models/Designation.js';
import { generateTokens } from '../src/utils/tokenUtils.js';

async function runTest() {
  console.log('================================================================');
  console.log('🧪 PR VISION HRMS – EMPLOYEE DIRECTORY & DASHBOARD SYNC TEST');
  console.log('================================================================\n');

  try {
    await connectDB({ exitOnError: true });

    // Step 0: Obtain Admin Token
    const admin = await User.findOne({ email: 'admin@prvision.com' });
    if (!admin) {
      throw new Error('Admin user not found in Atlas.');
    }
    const { accessToken } = generateTokens({ userId: admin._id, role: admin.role });
    const authHeaders = {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    };

    // TEST 1 & 2: Compare Employee Directory API with Atlas collection & count
    console.log('--- TEST 1 & 2: Employee Directory API & Atlas Document Count ---');
    const atlasEmployees = await Employee.find({ isDeleted: false }).lean();
    const atlasCount = atlasEmployees.length;
    console.log(`[Atlas] Actual non-deleted employees count: ${atlasCount}`);

    const empRes = await fetch('http://localhost:5000/api/v1/employees', { headers: authHeaders });
    const empData = await empRes.json();
    const apiEmployees = empData.data?.employees || empData.employees || [];
    const apiCount = empData.data?.total || apiEmployees.length;
    console.log(`[API /employees] Returned employees count: ${apiEmployees.length} (total: ${apiCount})`);

    const test1Passed = empRes.status === 200 && apiEmployees.length === atlasCount;
    console.log(`TEST 1 & 2 Result: ${test1Passed ? 'PASS' : 'FAIL'}\n`);

    // TEST 3: Verify Dashboard headcount matches employee count
    console.log('--- TEST 3: Dashboard Headcount Synchronization ---');
    const dashRes = await fetch('http://localhost:5000/api/v1/dashboard/stats', { headers: authHeaders });
    const dashData = await dashRes.json();
    const kpi = dashData.data?.kpi || {};
    console.log(`[API /dashboard/stats] Total Headcount: ${kpi.totalEmployees}`);
    console.log(`[API /dashboard/stats] Active Employees: ${kpi.activeEmployees}`);
    console.log(`[API /dashboard/stats] Present Today: ${kpi.presentToday}`);
    console.log(`[API /dashboard/stats] On Leave Today: ${kpi.onLeaveToday}`);
    console.log(`[API /dashboard/stats] Absent Today: ${kpi.absentToday}`);
    console.log(`[API /dashboard/stats] Pending Approvals: ${kpi.pendingApprovals}`);

    const test3Passed = kpi.totalEmployees === atlasCount && kpi.activeEmployees === atlasCount;
    console.log(`TEST 3 Result: ${test3Passed ? 'PASS' : 'FAIL'} (Headcount ${kpi.totalEmployees} === ${atlasCount})\n`);

    // TEST 4 & 5: Add a temporary test employee via API and verify in Atlas
    console.log('--- TEST 4 & 5: Add Temporary Employee via API ---');
    const dept = await Department.findOne({ isDeleted: false });
    const desig = await Designation.findOne({ isDeleted: false });
    const tempEmpPayload = {
      firstName: 'TempAudit',
      lastName: 'VerificationUser',
      email: 'temp.audit.test@prvision.com',
      phone: '+91 99999 88888',
      departmentId: dept._id.toString(),
      designationId: desig._id.toString(),
      employmentType: 'Full-Time',
      gender: 'Other',
      createUserAccount: false,
    };

    const createRes = await fetch('http://localhost:5000/api/v1/employees', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify(tempEmpPayload),
    });
    const createData = await createRes.json();
    const createdEmp = createData.data?.employee;
    const createdId = createdEmp?._id;
    console.log(`[API POST /employees] Status: ${createRes.status}, Created ID: ${createdId}, Code: ${createdEmp?.employeeId}`);

    const atlasFound = await Employee.findById(createdId);
    const test45Passed = createRes.status === 201 && !!atlasFound && atlasFound.email === 'temp.audit.test@prvision.com';
    console.log(`TEST 4 & 5 Result (Atlas Persistence): ${test45Passed ? 'PASS' : 'FAIL'}\n`);

    // TEST 6: Verify Employee Directory displays the new employee
    console.log('--- TEST 6: Employee Directory Displays New Record ---');
    const empResAfter = await fetch('http://localhost:5000/api/v1/employees', { headers: authHeaders });
    const empDataAfter = await empResAfter.json();
    const apiEmployeesAfter = empDataAfter.data?.employees || [];
    const foundInDirectory = apiEmployeesAfter.some((e) => e.email === 'temp.audit.test@prvision.com');
    const test6Passed = foundInDirectory && apiEmployeesAfter.length === atlasCount + 1;
    console.log(`TEST 6 Result (Directory List count ${apiEmployeesAfter.length}): ${test6Passed ? 'PASS' : 'FAIL'}\n`);

    // TEST 7: Verify Dashboard Headcount updates
    console.log('--- TEST 7: Dashboard Headcount Updates Automatically ---');
    const dashResAfter = await fetch('http://localhost:5000/api/v1/dashboard/stats', { headers: authHeaders });
    const dashDataAfter = await dashResAfter.json();
    const kpiAfter = dashDataAfter.data?.kpi || {};
    const test7Passed = kpiAfter.totalEmployees === atlasCount + 1;
    console.log(`[Dashboard After Create] Total Headcount: ${kpiAfter.totalEmployees} (Expected: ${atlasCount + 1})`);
    console.log(`TEST 7 Result: ${test7Passed ? 'PASS' : 'FAIL'}\n`);

    // TEST 8: Simulate Backend Disconnect / Reconnect (Persistence verification)
    console.log('--- TEST 8: Persistence Check Across Connection Restart ---');
    await disconnectDB();
    await connectDB({ exitOnError: true });
    const persistedEmp = await Employee.findById(createdId);
    const test8Passed = !!persistedEmp && persistedEmp.email === 'temp.audit.test@prvision.com';
    console.log(`TEST 8 Result (Persisted in Atlas): ${test8Passed ? 'PASS' : 'FAIL'}\n`);

    // TEST 9 & 10: Delete only the temporary test employee and verify Dashboard count updates
    console.log('--- TEST 9 & 10: Delete Temporary Employee & Verify Dashboard Sync ---');
    const delRes = await fetch(`http://localhost:5000/api/v1/employees/${createdId}`, {
      method: 'DELETE',
      headers: authHeaders,
    });
    console.log(`[API DELETE /employees/:id] Status: ${delRes.status}`);

    // Verify soft or hard delete in Atlas
    const postDelEmp = await Employee.findOne({ _id: createdId, isDeleted: false });
    const deletedInAtlas = !postDelEmp;

    // Verify Dashboard headcount rolls back to original atlasCount
    const dashResFinal = await fetch('http://localhost:5000/api/v1/dashboard/stats', { headers: authHeaders });
    const dashDataFinal = await dashResFinal.json();
    const kpiFinal = dashDataFinal.data?.kpi || {};
    const test910Passed = delRes.status === 200 && deletedInAtlas && kpiFinal.totalEmployees === atlasCount;
    console.log(`[Dashboard Final] Total Headcount: ${kpiFinal.totalEmployees} (Original: ${atlasCount})`);
    console.log(`TEST 9 & 10 Result: ${test910Passed ? 'PASS' : 'FAIL'}\n`);

    // Final clean-up: permanently remove the test record so Atlas stays pristine
    await Employee.deleteOne({ _id: createdId });

    console.log('================================================================');
    console.log('📊 ALL 10 PHASE 6 TESTS COMPLETED:');
    const allPassed = test1Passed && test3Passed && test45Passed && test6Passed && test7Passed && test8Passed && test910Passed;
    console.log(`OVERALL STATUS: ${allPassed ? 'ALL TESTS PASSED (100%)' : 'SOME TESTS FAILED'}`);
    console.log('================================================================');

    await disconnectDB();
    process.exit(allPassed ? 0 : 1);
  } catch (err) {
    console.error('Test execution failed:', err);
    await disconnectDB();
    process.exit(1);
  }
}

runTest();
