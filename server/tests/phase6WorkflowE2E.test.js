import fs from 'fs';
import path from 'path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import './setup.js';
import { api } from './setup.js';
import { ROLES, LIFECYCLE_STAGES, ATTENDANCE_STATUS, LEAVE_STATUS, PAYROLL_STATUS } from '../src/config/constants.js';
import { UPLOAD_ROOT } from '../src/utils/securityUtils.js';

import CompanySettings from '../src/models/CompanySettings.js';
import Branch from '../src/models/Branch.js';
import Department from '../src/models/Department.js';
import Designation from '../src/models/Designation.js';
import Shift from '../src/models/Shift.js';
import Holiday from '../src/models/Holiday.js';
import User from '../src/models/User.js';
import UserSession from '../src/models/UserSession.js';
import Employee from '../src/models/Employee.js';
import Attendance from '../src/models/Attendance.js';
import LeaveType from '../src/models/LeaveType.js';
import LeaveBalance from '../src/models/LeaveBalance.js';
import LeaveRequest from '../src/models/LeaveRequest.js';
import SalaryStructure from '../src/models/SalaryStructure.js';
import PayrollRun from '../src/models/PayrollRun.js';
import Payslip from '../src/models/Payslip.js';
import JobOpening from '../src/models/JobOpening.js';
import Candidate from '../src/models/Candidate.js';
import PerformanceReview from '../src/models/PerformanceReview.js';
import TrainingProgram from '../src/models/TrainingProgram.js';
import TrainingAssignment from '../src/models/TrainingAssignment.js';
import ExpenseClaim from '../src/models/ExpenseClaim.js';
import Asset from '../src/models/Asset.js';
import AssetAssignment from '../src/models/AssetAssignment.js';
import Grievance from '../src/models/Grievance.js';
import Announcement from '../src/models/Announcement.js';
import Document from '../src/models/Document.js';
import Notification from '../src/models/Notification.js';

const localNoon = (year, month, day, hour = 12, minute = 0) =>
  new Date(year, month - 1, day, hour, minute, 0, 0);

const VALID_PNG_BUFFER = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
]);
const VALID_PDF_BUFFER = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<<>>\n%%EOF\n');
const SPOOFED_EXE_BUFFER = Buffer.from('MZ-FAKE-EXECUTABLE-PAYLOAD');

describe('PR VISION HRMS — Phase 6 Complete End-to-End Workflow & Data Integrity Simulation', () => {
  let initialUploadSnapshot = new Set();

  // Tokens across all 7 valid roles
  const tokens = {};
  const users = {};
  const employees = {};

  // Master organization fixtures
  let hqBranch;
  let puneBranch;
  let engDept;
  let hrDept;
  let finDept;
  let engSde;
  let engLead;
  let hrDesig;
  let recDesig;
  let payDesig;
  let dayShift;
  let nightShift;

  // Leave types
  let clType;
  let slType;
  let lwpType;

  // Step 5 payroll scenario employees (only these have active SalaryStructure during June 2026 run)
  const payEmp = {};

  const loginTab = async (email, password, tabId) => {
    const res = await api
      .post('/api/v1/auth/login')
      .set('X-Tab-Id', tabId)
      .send({ email, password });
    expect(res.status, `Login failed for ${email}: ${res.body?.message}`).toBe(200);
    return res.body.data.tokens.accessToken;
  };

  const authReq = (method, url, token, tabId = 'tab-e2e') =>
    api[method](url)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Tab-Id', tabId);

  beforeAll(async () => {
    if (fs.existsSync(UPLOAD_ROOT)) {
      initialUploadSnapshot = new Set(fs.readdirSync(UPLOAD_ROOT));
    }

    // Bootstrap CompanySettings & initial SUPER_ADMIN account to drive setup via real HTTP APIs
    await CompanySettings.create({
      companyName: 'PR VISION INNOVATIONS',
      tagline: 'People. Process. Performance.',
      contactEmail: 'contact@prvision.com',
      settings: {
        currency: 'INR',
        currencySymbol: '₹',
        workingDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
        standardWorkHoursPerDay: 8,
      },
    });

    const bootDept = await Department.create({ name: 'Executive', code: 'EXEC', description: 'Leadership' });
    const bootDesig = await Designation.create({ title: 'Chief Admin', code: 'CADM', departmentId: bootDept._id, level: 5 });
    const bootBranch = await Branch.create({
      name: 'Bengaluru HQ',
      code: 'HQ-BLR',
      isHeadquarters: true,
      address: { city: 'Bengaluru', state: 'Karnataka', country: 'India' },
    });
    hqBranch = bootBranch.toObject();

    const superEmp = await Employee.create({
      employeeId: 'EMP-000',
      firstName: 'Super',
      lastName: 'Admin',
      email: 'superadmin@prvision.test',
      departmentId: bootDept._id,
      designationId: bootDesig._id,
      branchId: bootBranch._id,
      joiningDate: localNoon(2024, 1, 1),
      employmentStatus: LIFECYCLE_STAGES.CONFIRMED,
    });
    const superUser = await User.create({
      name: 'Super Admin',
      email: 'superadmin@prvision.test',
      password: 'Password@123',
      role: ROLES.SUPER_ADMIN,
      employeeId: superEmp._id,
      branchId: bootBranch._id,
      isActive: true,
    });
    superEmp.userId = superUser._id;
    await superEmp.save();

    users.SUPER_ADMIN = superUser.toObject();
    employees.SUPER_ADMIN = superEmp.toObject();
    tokens.SUPER_ADMIN = await loginTab('superadmin@prvision.test', 'Password@123', 'tab-sa');

    // Create secondary branch via HTTP API
    const puneRes = await authReq('post', '/api/v1/organization/branches', tokens.SUPER_ADMIN).send({
      name: 'Pune Regional Office',
      code: 'PNQ',
      isHeadquarters: false,
      address: { city: 'Pune', state: 'Maharashtra', country: 'India' },
    });
    expect(puneRes.status).toBe(201);
    puneBranch = puneRes.body.data.branch;

    // Departments via HTTP API
    const engRes = await authReq('post', '/api/v1/departments', tokens.SUPER_ADMIN).send({ name: 'Engineering', code: 'ENG' });
    const hrRes = await authReq('post', '/api/v1/departments', tokens.SUPER_ADMIN).send({ name: 'Human Resources', code: 'HR' });
    const finRes = await authReq('post', '/api/v1/departments', tokens.SUPER_ADMIN).send({ name: 'Finance & Payroll', code: 'FIN' });
    expect(engRes.status).toBe(201);
    expect(hrRes.status).toBe(201);
    expect(finRes.status).toBe(201);
    engDept = engRes.body.data.department;
    hrDept = hrRes.body.data.department;
    finDept = finRes.body.data.department;

    // Designations via HTTP API
    engSde = (await authReq('post', '/api/v1/designations', tokens.SUPER_ADMIN).send({ title: 'Software Engineer', departmentId: engDept._id, code: 'SDE', level: 1 })).body.data.designation;
    engLead = (await authReq('post', '/api/v1/designations', tokens.SUPER_ADMIN).send({ title: 'Engineering Manager', departmentId: engDept._id, code: 'EM', level: 3 })).body.data.designation;
    hrDesig = (await authReq('post', '/api/v1/designations', tokens.SUPER_ADMIN).send({ title: 'HR Manager', departmentId: hrDept._id, code: 'HRM', level: 3 })).body.data.designation;
    recDesig = (await authReq('post', '/api/v1/designations', tokens.SUPER_ADMIN).send({ title: 'Talent Recruiter', departmentId: hrDept._id, code: 'REC', level: 2 })).body.data.designation;
    payDesig = (await authReq('post', '/api/v1/designations', tokens.SUPER_ADMIN).send({ title: 'Payroll Specialist', departmentId: finDept._id, code: 'PAY', level: 2 })).body.data.designation;

    // Shifts via HTTP API
    const dayRes = await authReq('post', '/api/v1/shifts', tokens.SUPER_ADMIN).send({
      name: 'General Day Shift',
      code: 'DAY',
      startTime: '09:00',
      endTime: '18:00',
      breakDurationMinutes: 60,
      gracePeriodMinutes: 15,
      weeklyOffDays: [0, 6],
      isNightShift: false,
      isDefault: true,
    });
    const nightRes = await authReq('post', '/api/v1/shifts', tokens.SUPER_ADMIN).send({
      name: 'Pune Night Shift (6-Day)',
      code: 'NIGHT6',
      startTime: '22:00',
      endTime: '07:00',
      breakDurationMinutes: 60,
      gracePeriodMinutes: 15,
      weeklyOffDays: [0],
      isNightShift: true,
      isDefault: false,
    });
    expect(dayRes.status).toBe(201);
    expect(nightRes.status).toBe(201);
    dayShift = dayRes.body.data.shift;
    nightShift = nightRes.body.data.shift;

    // Leave Types via HTTP API (Paid CL, Paid SL, Unpaid LWP)
    clType = (await authReq('post', '/api/v1/leaves/types', tokens.SUPER_ADMIN).send({ name: 'Casual Leave', code: 'CL', defaultDaysPerYear: 12, isPaid: true })).body.data.leaveType;
    slType = (await authReq('post', '/api/v1/leaves/types', tokens.SUPER_ADMIN).send({ name: 'Sick Leave', code: 'SL', defaultDaysPerYear: 10, isPaid: true })).body.data.leaveType;
    lwpType = (await authReq('post', '/api/v1/leaves/types', tokens.SUPER_ADMIN).send({ name: 'Leave Without Pay', code: 'LWP', defaultDaysPerYear: 15, isPaid: false })).body.data.leaveType;

    // Create one account per remaining role via /api/v1/employees (note joiningDate 2026-07-01 so June 2026 payroll stays isolated to PAY-01..06)
    const createRoleAccount = async ({ firstName, lastName, email, role, deptId, desigId, branchId, shiftId, managerId = null }) => {
      const res = await authReq('post', '/api/v1/employees', tokens.SUPER_ADMIN).send({
        firstName,
        lastName,
        email,
        departmentId: deptId,
        designationId: desigId,
        branchId,
        shiftId,
        managerId,
        joiningDate: localNoon(2026, 7, 1).toISOString(),
        createUserAccount: true,
        password: 'Password@123',
        role,
      });
      expect(res.status, `Failed creating ${email}: ${JSON.stringify(res.body)}`).toBe(201);
      return { emp: res.body.data.employee, user: await User.findById(res.body.data.employee.userId).lean() };
    };

    const adminAcc = await createRoleAccount({
      firstName: 'Org', lastName: 'Admin', email: 'admin@prvision.test', role: ROLES.ADMIN,
      deptId: bootDept._id, desigId: bootDesig._id, branchId: hqBranch._id, shiftId: dayShift._id,
    });
    const hrAcc = await createRoleAccount({
      firstName: 'Meera', lastName: 'Nair', email: 'hr@prvision.test', role: ROLES.HR_MANAGER,
      deptId: hrDept._id, desigId: hrDesig._id, branchId: hqBranch._id, shiftId: dayShift._id,
    });
    const mgrAcc = await createRoleAccount({
      firstName: 'Vikram', lastName: 'Rao', email: 'manager@prvision.test', role: ROLES.MANAGER,
      deptId: engDept._id, desigId: engLead._id, branchId: hqBranch._id, shiftId: dayShift._id,
    });
    const otherMgrAcc = await createRoleAccount({
      firstName: 'Kavita', lastName: 'Desai', email: 'other.manager@prvision.test', role: ROLES.MANAGER,
      deptId: hrDept._id, desigId: hrDesig._id, branchId: puneBranch._id, shiftId: nightShift._id,
    });
    const empAcc = await createRoleAccount({
      firstName: 'Amit', lastName: 'Patel', email: 'employee@prvision.test', role: ROLES.EMPLOYEE,
      deptId: engDept._id, desigId: engSde._id, branchId: hqBranch._id, shiftId: dayShift._id, managerId: mgrAcc.emp._id,
    });
    const peerAcc = await createRoleAccount({
      firstName: 'Priya', lastName: 'Kulkarni', email: 'peer@prvision.test', role: ROLES.EMPLOYEE,
      deptId: hrDept._id, desigId: hrDesig._id, branchId: puneBranch._id, shiftId: nightShift._id, managerId: otherMgrAcc.emp._id,
    });
    const recAcc = await createRoleAccount({
      firstName: 'Sonal', lastName: 'Verma', email: 'recruiter@prvision.test', role: ROLES.RECRUITER,
      deptId: hrDept._id, desigId: recDesig._id, branchId: hqBranch._id, shiftId: dayShift._id,
    });
    const payAcc = await createRoleAccount({
      firstName: 'Arjun', lastName: 'Mehta', email: 'payroll@prvision.test', role: ROLES.PAYROLL_ADMIN,
      deptId: finDept._id, desigId: payDesig._id, branchId: hqBranch._id, shiftId: dayShift._id,
    });

    users.ADMIN = adminAcc.user; employees.ADMIN = adminAcc.emp;
    users.HR_MANAGER = hrAcc.user; employees.HR_MANAGER = hrAcc.emp;
    users.MANAGER = mgrAcc.user; employees.MANAGER = mgrAcc.emp;
    users.OTHER_MANAGER = otherMgrAcc.user; employees.OTHER_MANAGER = otherMgrAcc.emp;
    users.EMPLOYEE = empAcc.user; employees.EMPLOYEE = empAcc.emp;
    users.PEER_EMPLOYEE = peerAcc.user; employees.PEER_EMPLOYEE = peerAcc.emp;
    users.RECRUITER = recAcc.user; employees.RECRUITER = recAcc.emp;
    users.PAYROLL_ADMIN = payAcc.user; employees.PAYROLL_ADMIN = payAcc.emp;

    tokens.ADMIN = await loginTab('admin@prvision.test', 'Password@123', 'tab-adm');
    tokens.HR_MANAGER = await loginTab('hr@prvision.test', 'Password@123', 'tab-hr');
    tokens.MANAGER = await loginTab('manager@prvision.test', 'Password@123', 'tab-mgr');
    tokens.OTHER_MANAGER = await loginTab('other.manager@prvision.test', 'Password@123', 'tab-omgr');
    tokens.EMPLOYEE = await loginTab('employee@prvision.test', 'Password@123', 'tab-emp');
    tokens.PEER_EMPLOYEE = await loginTab('peer@prvision.test', 'Password@123', 'tab-peer');
    tokens.RECRUITER = await loginTab('recruiter@prvision.test', 'Password@123', 'tab-rec');
    tokens.PAYROLL_ADMIN = await loginTab('payroll@prvision.test', 'Password@123', 'tab-pay');
  }, 30000);

  afterAll(() => {
    if (fs.existsSync(UPLOAD_ROOT)) {
      for (const entry of fs.readdirSync(UPLOAD_ROOT)) {
        if (!initialUploadSnapshot.has(entry) && !entry.startsWith('.')) {
          try {
            fs.rmSync(path.join(UPLOAD_ROOT, entry), { recursive: true, force: true });
          } catch (_) {
            // Ignore cleanup lock
          }
        }
      }
    }
  });

  // ===========================================================================
  // STEP 5 (RUN FIRST WHILE SALARY STRUCTURES ARE STRICTLY PAY-01..06):
  // COMPREHENSIVE JUNE 2026 PAYROLL VERIFICATION TABLE
  // ===========================================================================
  describe('STEP 5: Comprehensive Payroll Calculation Verification (June 2026 Matrix)', () => {
    it('processes June 2026 payroll for 6 deterministic edge-case employees with exact rupee-level accuracy, rounding, locking, and PDF output', async () => {
      // Configure June 2026 Holidays:
      // Wed 2026-06-10 (Org-wide Non-Optional) -> workingDays HQ = 21
      // Fri 2026-06-12 (Pune Branch Only Non-Optional) -> Pune Mon-Fri = 20, Pune 6-day Night = 24
      // Fri 2026-06-19 (Optional Holiday) -> ignored by LOP/workingDays
      const h1 = await authReq('post', '/api/v1/holidays', tokens.HR_MANAGER).send({
        name: 'Company Foundation Day',
        date: localNoon(2026, 6, 10).toISOString(),
        isOptional: false,
      });
      const h2 = await authReq('post', '/api/v1/holidays', tokens.HR_MANAGER).send({
        name: 'Pune Regional Holiday',
        date: localNoon(2026, 6, 12).toISOString(),
        branchId: puneBranch._id,
        isOptional: false,
      });
      const h3 = await authReq('post', '/api/v1/holidays', tokens.HR_MANAGER).send({
        name: 'Optional Festival Day',
        date: localNoon(2026, 6, 19).toISOString(),
        isOptional: true,
      });
      expect(h1.status).toBe(201);
      expect(h2.status).toBe(201);
      expect(h3.status).toBe(201);

      const makePayEmp = async ({ key, firstName, email, branchId, shiftId, joiningDate }) => {
        const res = await authReq('post', '/api/v1/employees', tokens.HR_MANAGER).send({
          firstName,
          lastName: 'PayCase',
          email,
          departmentId: engDept._id,
          designationId: engSde._id,
          branchId,
          shiftId,
          joiningDate: joiningDate.toISOString(),
          createUserAccount: key === 'p1',
          password: 'Password@123',
          role: ROLES.EMPLOYEE,
        });
        expect(res.status).toBe(201);
        payEmp[key] = res.body.data.employee;
      };

      await makePayEmp({ key: 'p1', firstName: 'FullMonth', email: 'pay01@prvision.test', branchId: hqBranch._id, shiftId: dayShift._id, joiningDate: localNoon(2025, 1, 1) });
      await makePayEmp({ key: 'p2', firstName: 'PartialAtt', email: 'pay02@prvision.test', branchId: hqBranch._id, shiftId: dayShift._id, joiningDate: localNoon(2025, 1, 1) });
      await makePayEmp({ key: 'p3', firstName: 'LeaveSplit', email: 'pay03@prvision.test', branchId: hqBranch._id, shiftId: dayShift._id, joiningDate: localNoon(2025, 1, 1) });
      await makePayEmp({ key: 'p4', firstName: 'MidJoiner', email: 'pay04@prvision.test', branchId: hqBranch._id, shiftId: dayShift._id, joiningDate: localNoon(2026, 6, 15) });
      await makePayEmp({ key: 'p5', firstName: 'MidExit', email: 'pay05@prvision.test', branchId: hqBranch._id, shiftId: dayShift._id, joiningDate: localNoon(2025, 1, 1) });
      await makePayEmp({ key: 'p6', firstName: 'PuneShift6', email: 'pay06@prvision.test', branchId: puneBranch._id, shiftId: nightShift._id, joiningDate: localNoon(2025, 1, 1) });

      // Mark p5 Resigned mid-month with lastWorkingDate 2026-06-16 (serves 1..5,8,9,11,12,15,16 = 11 days; unserved = 10)
      const resigRes = await authReq('patch', `/api/v1/employees/${payEmp.p5._id}/resignation`, tokens.HR_MANAGER).send({
        resignationDate: localNoon(2026, 6, 1).toISOString(),
        lastWorkingDate: localNoon(2026, 6, 16).toISOString(),
        exitInterviewNotes: 'Personal relocation',
      });
      expect(resigRes.status).toBe(200);

      // Case p2: 2 Absent + 1 Half-Day + 1 initially Absent record corrected via PATCH /adjust -> Present
      await Attendance.insertMany([
        { employeeId: payEmp.p2._id, date: localNoon(2026, 6, 1), status: ATTENDANCE_STATUS.ABSENT },
        { employeeId: payEmp.p2._id, date: localNoon(2026, 6, 2), status: ATTENDANCE_STATUS.ABSENT },
        { employeeId: payEmp.p2._id, date: localNoon(2026, 6, 3), status: ATTENDANCE_STATUS.HALF_DAY },
      ]);
      const absentToFix = await Attendance.create({
        employeeId: payEmp.p2._id,
        date: localNoon(2026, 6, 4),
        status: ATTENDANCE_STATUS.ABSENT,
      });
      const adjRes = await authReq('patch', `/api/v1/attendance/${absentToFix._id}/adjust`, tokens.HR_MANAGER).send({
        checkInTime: localNoon(2026, 6, 4, 9, 0).toISOString(),
        checkOutTime: localNoon(2026, 6, 4, 18, 0).toISOString(),
        status: ATTENDANCE_STATUS.PRESENT,
        notes: 'Approved biometric miss correction',
      });
      expect(adjRes.status).toBe(200);
      expect(adjRes.body.data.record.status).toBe(ATTENDANCE_STATUS.PRESENT);

      // Case p3: Paid CL (2 days: June 1-2) + Unpaid LWP (3 days: June 15-17)
      await LeaveRequest.insertMany([
        {
          employeeId: payEmp.p3._id,
          leaveTypeId: clType._id,
          startDate: localNoon(2026, 6, 1),
          endDate: localNoon(2026, 6, 2),
          totalDays: 2,
          reason: 'Family event',
          status: LEAVE_STATUS.APPROVED,
        },
        {
          employeeId: payEmp.p3._id,
          leaveTypeId: lwpType._id,
          startDate: localNoon(2026, 6, 15),
          endDate: localNoon(2026, 6, 17),
          totalDays: 3,
          reason: 'Extended LWP',
          status: LEAVE_STATUS.APPROVED,
        },
      ]);

      // Save SalaryStructures via real API endpoint
      const saveStruct = async (payload) => {
        const res = await authReq('post', '/api/v1/payroll/structures', tokens.PAYROLL_ADMIN).send(payload);
        expect(res.status).toBe(201);
        return res.body.data.structure;
      };

      await saveStruct({
        employeeId: payEmp.p1._id,
        basicSalary: 30000,
        hra: 12000,
        specialAllowance: 8000,
        conveyanceAllowance: 2000,
        customComponents: [
          { name: 'Tech Allowance', type: 'earning', calculationType: 'percentage_of_basic', value: 10 },
          { name: 'Perf Bonus', type: 'earning', calculationType: 'percentage_of_gross', value: 10 },
          { name: 'Canteen Recovery', type: 'deduction', calculationType: 'flat', value: 500 },
        ],
        statutoryConfig: { pfEnabled: true, pfEmployeeRate: 12, esiEnabled: true, esiEmployeeRate: 0.75, professionalTax: 200, tdsDeduction: 1500 },
      });
      await saveStruct({
        employeeId: payEmp.p2._id,
        basicSalary: 21000,
        hra: 8400,
        specialAllowance: 4200,
        statutoryConfig: { pfEnabled: true, pfEmployeeRate: 12, esiEnabled: false, professionalTax: 200, tdsDeduction: 0 },
      });
      await saveStruct({
        employeeId: payEmp.p3._id,
        basicSalary: 42000,
        hra: 14000,
        specialAllowance: 7000,
        statutoryConfig: { pfEnabled: true, pfEmployeeRate: 12, esiEnabled: false, professionalTax: 200, tdsDeduction: 0 },
      });
      await saveStruct({
        employeeId: payEmp.p4._id,
        basicSalary: 35000,
        hra: 14000,
        specialAllowance: 7000,
        statutoryConfig: { pfEnabled: true, pfEmployeeRate: 12, esiEnabled: false, professionalTax: 200, tdsDeduction: 0 },
      });
      await saveStruct({
        employeeId: payEmp.p5._id,
        basicSalary: 42000,
        hra: 14000,
        specialAllowance: 7000,
        statutoryConfig: { pfEnabled: true, pfEmployeeRate: 12, esiEnabled: false, professionalTax: 200, tdsDeduction: 0 },
      });
      await saveStruct({
        employeeId: payEmp.p6._id,
        basicSalary: 24000,
        hra: 9600,
        specialAllowance: 2400,
        statutoryConfig: { pfEnabled: true, pfEmployeeRate: 12, esiEnabled: false, professionalTax: 200, tdsDeduction: 0 },
      });

      // Confirm statutoryConfig.isVerifiedByProfessional defaults to false
      const p1StructRes = await authReq('get', `/api/v1/payroll/structures/${payEmp.p1._id}`, tokens.PAYROLL_ADMIN);
      expect(p1StructRes.status).toBe(200);
      expect(p1StructRes.body.data.structure.statutoryConfig.isVerifiedByProfessional).toBe(false);

      // Generate Payroll Run for June 2026
      const genRes = await authReq('post', '/api/v1/payroll/runs/generate', tokens.PAYROLL_ADMIN).send({
        month: 6,
        year: 2026,
        notes: 'June 2026 Simulation Run',
      });
      expect(genRes.status).toBe(200);
      const run1 = genRes.body.data.run;
      expect(run1.status).toBe(PAYROLL_STATUS.APPROVED);
      expect(run1.totalEmployees).toBe(6);

      // Fetch all 6 payslips and verify exact calculations
      const slipsRes = await authReq('get', '/api/v1/payroll/payslips?month=6&year=2026&limit=50', tokens.PAYROLL_ADMIN);
      expect(slipsRes.status).toBe(200);
      const slips = slipsRes.body.data.payslips;
      expect(slips).toHaveLength(6);

      const slipByEmp = new Map(slips.map((s) => [String(s.employeeId._id || s.employeeId), s]));

      const s1 = slipByEmp.get(String(payEmp.p1._id));
      const s2 = slipByEmp.get(String(payEmp.p2._id));
      const s3 = slipByEmp.get(String(payEmp.p3._id));
      const s4 = slipByEmp.get(String(payEmp.p4._id));
      const s5 = slipByEmp.get(String(payEmp.p5._id));
      const s6 = slipByEmp.get(String(payEmp.p6._id));

      // Case p1: 21/21 working days; gross = 30k+12k+8k+2k+3k + 10%(55k) = 60500; ded = 3600+454+200+1500+500 = 6254; net = 54246
      expect(s1).toMatchObject({ workingDays: 21, presentDays: 21, lopDays: 0, basicSalary: 30000, grossSalary: 60500, totalDeductions: 6254, netSalary: 54246 });

      // Case p2: 21 working, 2 Absent + 1 Half = 2.5 LOP, 18.5 present; gross = 29600, ded = 2420, net = 27180
      expect(s2).toMatchObject({ workingDays: 21, presentDays: 18.5, lopDays: 2.5, basicSalary: 18500, grossSalary: 29600, totalDeductions: 2420, netSalary: 27180 });

      // Case p3: 2 Paid + 3 Unpaid LWP = 3 LOP, 18 present; gross = 54000, ded = 4520, net = 49480
      expect(s3).toMatchObject({ workingDays: 21, presentDays: 18, lopDays: 3, basicSalary: 36000, grossSalary: 54000, totalDeductions: 4520, netSalary: 49480 });
      expect(s3.calculationSnapshot.paidLeaveDays).toBe(2);
      expect(s3.calculationSnapshot.unpaidLeaveDays).toBe(3);

      // Case p4: Joined June 15 -> 9 unserved days, 12 present; gross = 32000, ded = 2600, net = 29400
      expect(s4).toMatchObject({ workingDays: 21, presentDays: 12, lopDays: 9, basicSalary: 20000, grossSalary: 32000, totalDeductions: 2600, netSalary: 29400 });
      expect(s4.calculationSnapshot.unservedDays).toBe(9);

      // Case p5: Exit June 16 -> 10 unserved days, 11 present; gross = 22000+7333+3667=33000, ded = 2840, net = 30160
      expect(s5).toMatchObject({ workingDays: 21, presentDays: 11, lopDays: 10, basicSalary: 22000, grossSalary: 33000, totalDeductions: 2840, netSalary: 30160 });
      expect(s5.calculationSnapshot.unservedDays).toBe(10);

      // Case p6: Pune Branch (regional holiday June 12) + 6-day Night Shift ([0] Sunday off) = 24 working days (June 19 optional counted as working)
      expect(s6).toMatchObject({ workingDays: 24, presentDays: 24, lopDays: 0, basicSalary: 24000, grossSalary: 36000, totalDeductions: 3080, netSalary: 32920 });

      // Verify PayrollRun totals match sum of payslips cleanly
      const expectedTotalGross = 60500 + 29600 + 54000 + 32000 + 33000 + 36000; // 245100
      const expectedTotalDed = 6254 + 2420 + 4520 + 2600 + 2840 + 3080;       // 21714
      const expectedTotalNet = 54246 + 27180 + 49480 + 29400 + 30160 + 32920; // 223386
      expect(run1.totalGrossSalary).toBe(expectedTotalGross);
      expect(run1.totalDeductions).toBe(expectedTotalDed);
      expect(run1.totalNetSalary).toBe(expectedTotalNet);

      // Document finding: regenerating while run is still Approved (before Pay/Lock) currently overwrites Payslips
      const regenUnlockedRes = await authReq('post', '/api/v1/payroll/runs/generate', tokens.PAYROLL_ADMIN).send({
        month: 6,
        year: 2026,
        notes: 'Unlocked regeneration check',
      });
      expect(regenUnlockedRes.status).toBe(200);
      expect(regenUnlockedRes.body.data.run.totalNetSalary).toBe(expectedTotalNet);

      // Mark run as Paid (locks PayrollRun and updates all Payslips)
      const payRes = await authReq('patch', `/api/v1/payroll/runs/${regenUnlockedRes.body.data.run._id}/pay`, tokens.PAYROLL_ADMIN);
      expect(payRes.status).toBe(200);
      expect(payRes.body.data.run.status).toBe(PAYROLL_STATUS.PAID);
      expect(payRes.body.data.run.isLocked).toBe(true);

      // Subsequent re-run after Paid/Locked must be blocked (400)
      const lockedRes = await authReq('post', '/api/v1/payroll/runs/generate', tokens.PAYROLL_ADMIN).send({
        month: 6,
        year: 2026,
      });
      expect(lockedRes.status).toBe(400);

      // Verify no reversal endpoint exists in API
      const reverseRes = await authReq('post', `/api/v1/payroll/runs/${run1._id}/reverse`, tokens.PAYROLL_ADMIN);
      expect(reverseRes.status).toBe(404);

      // Verify unlocked regeneration replaces previous payslip IDs, then re-fetch s1 for PDF test
      const refreshedSlipsRes = await authReq('get', '/api/v1/payroll/payslips?month=6&year=2026&limit=50', tokens.PAYROLL_ADMIN);
      const refreshedS1 = refreshedSlipsRes.body.data.payslips.find(
        (p) => String(p.employeeId._id || p.employeeId) === String(payEmp.p1._id)
      );
      expect(refreshedS1).toBeTruthy();
      expect(String(refreshedS1._id)).not.toBe(String(s1._id));

      // Employee self-service PDF download (p1) vs unauthorized peer IDOR block
      const p1Token = await loginTab('pay01@prvision.test', 'Password@123', 'tab-p1');
      const p1PdfRes = await authReq('get', `/api/v1/payroll/payslips/${refreshedS1._id}/pdf`, p1Token, 'tab-p1');
      expect(p1PdfRes.status).toBe(200);
      expect(p1PdfRes.headers['content-type']).toContain('application/pdf');
      expect(Buffer.from(p1PdfRes.body).subarray(0, 5).toString('ascii')).toBe('%PDF-');

      const peerPdfRes = await authReq('get', `/api/v1/payroll/payslips/${refreshedS1._id}/pdf`, tokens.EMPLOYEE);
      expect(peerPdfRes.status).toBe(403);
    });
  });

  // ===========================================================================
  // STEP 2: COMPLETE EMPLOYEE LIFECYCLE WORKFLOW
  // ===========================================================================
  describe('STEP 2: Complete Employee Lifecycle Workflow', () => {
    it('executes full lifecycle (Create -> Salary -> Confirm -> Promote -> Update -> Resign -> Relieving Letter -> Deactivate + Guards)', async () => {
      // Create new Probation employee under HR Manager
      const createRes = await authReq('post', '/api/v1/employees', tokens.HR_MANAGER).send({
        firstName: 'Karan',
        lastName: 'Malhotra',
        email: 'karan.lifecycle@prvision.test',
        phone: '+91-9811112222',
        departmentId: engDept._id,
        designationId: engSde._id,
        branchId: hqBranch._id,
        managerId: employees.MANAGER._id,
        shiftId: dayShift._id,
        joiningDate: localNoon(2026, 7, 1).toISOString(),
        probationPeriodMonths: 3,
        createUserAccount: true,
        password: 'Password@123',
        role: ROLES.EMPLOYEE,
      });
      expect(createRes.status).toBe(201);
      const karan = createRes.body.data.employee;
      expect(karan.employmentStatus).toBe(LIFECYCLE_STAGES.PROBATION);
      expect(karan.employeeId).toMatch(/^EMP-\d+/);

      // Duplicate email rejected (409)
      const dupRes = await authReq('post', '/api/v1/employees', tokens.HR_MANAGER).send({
        firstName: 'Dup',
        lastName: 'Karan',
        email: 'karan.lifecycle@prvision.test',
        departmentId: engDept._id,
        designationId: engSde._id,
      });
      expect(dupRes.status).toBe(409);

      // HR cannot create ADMIN user (403 privilege guard)
      const privEscRes = await authReq('post', '/api/v1/employees', tokens.HR_MANAGER).send({
        firstName: 'Rogue',
        lastName: 'Admin',
        email: 'rogue.admin@prvision.test',
        departmentId: engDept._id,
        designationId: engSde._id,
        createUserAccount: true,
        role: ROLES.ADMIN,
      });
      expect(privEscRes.status).toBe(403);

      // Self-manager & 2-hop circular manager prevented (400)
      const selfMgrRes = await authReq('put', `/api/v1/employees/${karan._id}`, tokens.HR_MANAGER).send({
        managerId: karan._id,
      });
      expect(selfMgrRes.status).toBe(400);

      const cycleMgrRes = await authReq('put', `/api/v1/employees/${employees.MANAGER._id}`, tokens.HR_MANAGER).send({
        managerId: karan._id,
      });
      expect(cycleMgrRes.status).toBe(400);

      // Save SalaryStructure
      const salRes = await authReq('post', '/api/v1/payroll/structures', tokens.PAYROLL_ADMIN).send({
        employeeId: karan._id,
        basicSalary: 23000,
        hra: 9200,
        specialAllowance: 2300,
        statutoryConfig: { pfEnabled: true, pfEmployeeRate: 12, professionalTax: 200 },
      });
      expect(salRes.status).toBe(201);

      // Confirm Probation
      const confirmRes = await authReq('patch', `/api/v1/employees/${karan._id}/confirm`, tokens.HR_MANAGER);
      expect(confirmRes.status).toBe(200);
      expect(confirmRes.body.data.employee.employmentStatus).toBe(LIFECYCLE_STAGES.CONFIRMED);
      expect(confirmRes.body.data.employee.confirmationDate).toBeTruthy();

      // Promote
      const promoteRes = await authReq('patch', `/api/v1/employees/${karan._id}/promote`, tokens.HR_MANAGER).send({
        newDesignationId: engLead._id,
        remarks: 'Exceeded Q3 engineering goals',
      });
      expect(promoteRes.status).toBe(200);
      expect(promoteRes.body.data.employee.employmentStatus).toBe(LIFECYCLE_STAGES.PROMOTED);
      expect(String(promoteRes.body.data.employee.designationId)).toBe(String(engLead._id));

      // Self-profile update allows phone while ignoring role/department tampering
      const karanToken = await loginTab('karan.lifecycle@prvision.test', 'Password@123', 'tab-karan');
      const mePatch = await authReq('patch', '/api/v1/employees/me', karanToken, 'tab-karan').send({
        phone: '+91-9900001111',
        departmentId: hrDept._id,
      });
      expect(mePatch.status).toBe(200);
      expect(mePatch.body.data.employee.phone).toBe('+91-9900001111');
      expect(String(mePatch.body.data.employee.departmentId._id || mePatch.body.data.employee.departmentId)).toBe(String(engDept._id));

      // Process Resignation (lastWorkingDate: July 15, 2026) -> Eligible in July 2026 (prorated), excluded in August 2026
      const resigRes = await authReq('patch', `/api/v1/employees/${karan._id}/resignation`, tokens.HR_MANAGER).send({
        resignationDate: localNoon(2026, 7, 5).toISOString(),
        lastWorkingDate: localNoon(2026, 7, 15).toISOString(),
        exitInterviewNotes: 'Higher studies',
      });
      expect(resigRes.status).toBe(200);
      expect(resigRes.body.data.employee.employmentStatus).toBe(LIFECYCLE_STAGES.RESIGNED);

      // July 2026 payroll (23 Mon-Fri working days: July 1..31 has 8 weekend days = 23; July 1..15 has 11 weekdays -> 11 present, 12 unserved)
      const julyRun = await authReq('post', '/api/v1/payroll/runs/generate', tokens.PAYROLL_ADMIN).send({ month: 7, year: 2026 });
      expect(julyRun.status).toBe(200);
      const karanJulySlip = await Payslip.findOne({ employeeId: karan._id, month: 7, year: 2026 }).lean();
      expect(karanJulySlip).toBeTruthy();
      expect(karanJulySlip.presentDays).toBe(11);
      expect(karanJulySlip.calculationSnapshot.unservedDays).toBe(12);

      // Relieving Letter & Deactivate
      const relRes = await authReq('patch', `/api/v1/employees/${karan._id}/relieving-letter`, tokens.HR_MANAGER);
      expect(relRes.status).toBe(200);
      expect(relRes.body.data.employee.employmentStatus).toBe(LIFECYCLE_STAGES.RELIEVED);
      expect(relRes.body.data.employee.relievingLetterIssued).toBe(true);

      // August 2026 payroll -> Karan excluded (lastWorkingDate July 15 < Aug 1)
      const augRunBeforeDeactivate = await authReq('post', '/api/v1/payroll/runs/generate', tokens.PAYROLL_ADMIN).send({ month: 8, year: 2026 });
      expect(augRunBeforeDeactivate.status).toBe(200);
      const karanAugSlip = await Payslip.findOne({ employeeId: karan._id, month: 8, year: 2026 }).lean();
      expect(karanAugSlip).toBeNull();

      // Deactivate Karan -> isDeleted=true, user.isActive=false, session revoked, JWT rejected
      const delRes = await authReq('delete', `/api/v1/employees/${karan._id}`, tokens.HR_MANAGER);
      expect(delRes.status).toBe(200);
      const deactivatedUser = await User.findById(karan.userId).lean();
      expect(deactivatedUser.isActive).toBe(false);
      const afterMe = await authReq('get', '/api/v1/auth/me', karanToken, 'tab-karan');
      expect([401, 403]).toContain(afterMe.status);
    });
  });

  // ===========================================================================
  // STEP 3: COMPLETE ATTENDANCE TO PAYROLL WORKFLOW
  // ===========================================================================
  describe('STEP 3: Attendance Check-in/out, Night Shift, Biometric Sync & Regularization -> Payroll', () => {
    it('handles check-in/out, duplicate guard, biometric sync, employee regularization, HR approval & overtime without impossible hours', async () => {
      // Live check-in & check-out for peer employee (nightShift) & duplicate punch rejection
      const ciRes = await authReq('post', '/api/v1/attendance/check-in', tokens.PEER_EMPLOYEE, 'tab-peer');
      expect(ciRes.status).toBe(200);
      const dupCi = await authReq('post', '/api/v1/attendance/check-in', tokens.PEER_EMPLOYEE, 'tab-peer');
      expect(dupCi.status).toBe(400);

      const coRes = await authReq('post', '/api/v1/attendance/check-out', tokens.PEER_EMPLOYEE, 'tab-peer');
      expect(coRes.status).toBe(200);
      expect(coRes.body.data.record.totalHours).toBeGreaterThanOrEqual(0);
      expect(coRes.body.data.record.overtimeHours).toBeGreaterThanOrEqual(0);
      const dupCo = await authReq('post', '/api/v1/attendance/check-out', tokens.PEER_EMPLOYEE, 'tab-peer');
      expect(dupCo.status).toBe(400);

      // Night shift 10h adjustment calculation (22:00 Aug 3 to 08:00 Aug 4 against 8h shift = 10h worked, 2h OT)
      const nightRec = await Attendance.create({
        employeeId: employees.PEER_EMPLOYEE._id,
        shiftId: nightShift._id,
        date: localNoon(2026, 8, 3),
        status: ATTENDANCE_STATUS.PRESENT,
      });
      const nightAdj = await authReq('patch', `/api/v1/attendance/${nightRec._id}/adjust`, tokens.HR_MANAGER).send({
        checkInTime: localNoon(2026, 8, 3, 22, 0).toISOString(),
        checkOutTime: localNoon(2026, 8, 4, 8, 0).toISOString(),
        status: ATTENDANCE_STATUS.PRESENT,
      });
      expect(nightAdj.status).toBe(200);
      expect(nightAdj.body.data.record.totalHours).toBe(10);
      expect(nightAdj.body.data.record.overtimeHours).toBe(2);

      // Biometric sync batch for Amit (employee@prvision.test) on Aug 5, 2026 + unknown employee code ignored
      const bioRes = await authReq('post', '/api/v1/attendance/biometric-sync', tokens.ADMIN).send({
        logs: [
          { employeeCode: employees.EMPLOYEE.employeeId, timestamp: localNoon(2026, 8, 5, 9, 0).toISOString(), deviceId: 'BIO-HQ-1' },
          { employeeCode: employees.EMPLOYEE.employeeId, timestamp: localNoon(2026, 8, 5, 19, 30).toISOString(), deviceId: 'BIO-HQ-1' },
          { employeeCode: 'UNKNOWN-999', timestamp: localNoon(2026, 8, 5, 9, 0).toISOString(), deviceId: 'BIO-HQ-1' },
        ],
      });
      expect(bioRes.status).toBe(200);
      expect(bioRes.body.data.syncedCount).toBe(2);

      // Regularization workflow: Amit gets marked Absent on Sept 2, 2026 -> submits correction -> HR approves -> Overtime 3h & 0 LOP!
      const sepAbsentRec = await Attendance.create({
        employeeId: employees.EMPLOYEE._id,
        date: localNoon(2026, 9, 2),
        status: ATTENDANCE_STATUS.ABSENT,
      });

      // Invalid inverted times rejected
      const badCorr = await authReq('post', `/api/v1/attendance/${sepAbsentRec._id}/correction`, tokens.EMPLOYEE).send({
        requestedCheckIn: localNoon(2026, 9, 2, 18, 0).toISOString(),
        requestedCheckOut: localNoon(2026, 9, 2, 9, 0).toISOString(),
        reason: 'Inverted punch test',
      });
      expect(badCorr.status).toBe(400);

      // Colleague cannot request correction for Amit (IDOR 403)
      const idorCorr = await authReq('post', `/api/v1/attendance/${sepAbsentRec._id}/correction`, tokens.PEER_EMPLOYEE).send({
        requestedCheckIn: localNoon(2026, 9, 2, 9, 0).toISOString(),
        requestedCheckOut: localNoon(2026, 9, 2, 18, 0).toISOString(),
        reason: 'Cross user test',
      });
      expect(idorCorr.status).toBe(403);

      // Valid correction request
      const okCorr = await authReq('post', `/api/v1/attendance/${sepAbsentRec._id}/correction`, tokens.EMPLOYEE).send({
        requestedCheckIn: localNoon(2026, 9, 2, 9, 0).toISOString(),
        requestedCheckOut: localNoon(2026, 9, 2, 20, 0).toISOString(),
        reason: 'Biometric scanner offline during client deploy',
      });
      expect(okCorr.status).toBe(200);
      expect(okCorr.body.data.record.correctionRequest.status).toBe('Pending');

      // HR approves adjustment (11 hours against 8h shift = 3h OT)
      const approveCorr = await authReq('patch', `/api/v1/attendance/${sepAbsentRec._id}/adjust`, tokens.HR_MANAGER).send({
        checkInTime: localNoon(2026, 9, 2, 9, 0).toISOString(),
        checkOutTime: localNoon(2026, 9, 2, 20, 0).toISOString(),
        status: ATTENDANCE_STATUS.PRESENT,
        correctionStatus: 'Approved',
      });
      expect(approveCorr.status).toBe(200);
      expect(approveCorr.body.data.record.totalHours).toBe(11);
      expect(approveCorr.body.data.record.overtimeHours).toBe(3);
      expect(approveCorr.body.data.record.correctionRequest.status).toBe('Approved');
    });
  });

  // ===========================================================================
  // STEP 4: COMPLETE LEAVE WORKFLOW -> ATTENDANCE & PAYROLL SYNC
  // ===========================================================================
  describe('STEP 4: Complete Leave Workflow (Paid/Unpaid, Balance Lifecycle, Cancellation & Payroll LOP)', () => {
    it('verifies Paid vs Unpaid leave application, manager approval/rejection, attendance sync, cancellation limits, and September 2026 payroll deduction', async () => {
      // Check initial CL balance for Amit (12/0/0/12)
      const initBal = await authReq('get', '/api/v1/leaves/balances', tokens.EMPLOYEE);
      expect(initBal.status).toBe(200);
      const clInit = initBal.body.data.balances.find((b) => String(b.leaveTypeId._id || b.leaveTypeId) === String(clType._id));
      expect(clInit.remaining).toBe(12);

      // Invalid inverted dates & insufficient balance checks
      const invDateRes = await authReq('post', '/api/v1/leaves/apply', tokens.EMPLOYEE).send({
        leaveTypeId: clType._id,
        startDate: localNoon(2026, 9, 10).toISOString(),
        endDate: localNoon(2026, 9, 8).toISOString(),
        totalDays: 2,
        reason: 'Inverted date test',
      });
      expect(invDateRes.status).toBe(400);

      const excBalRes = await authReq('post', '/api/v1/leaves/apply', tokens.EMPLOYEE).send({
        leaveTypeId: clType._id,
        startDate: localNoon(2026, 9, 7).toISOString(),
        endDate: localNoon(2026, 9, 25).toISOString(),
        totalDays: 15,
        reason: 'Exceeds CL balance',
      });
      expect(excBalRes.status).toBe(400);

      // 1. Apply 2-day Paid Leave (Sept 7-8, 2026 Mon-Tue)
      const applyPaid = await authReq('post', '/api/v1/leaves/apply', tokens.EMPLOYEE).send({
        leaveTypeId: clType._id,
        startDate: localNoon(2026, 9, 7).toISOString(),
        endDate: localNoon(2026, 9, 8).toISOString(),
        totalDays: 2,
        reason: 'Paid casual leave',
      });
      expect(applyPaid.status).toBe(201);
      const paidLeaveId = applyPaid.body.data.leaveRequest._id;

      // Overlap rejected (400)
      const overlapRes = await authReq('post', '/api/v1/leaves/apply', tokens.EMPLOYEE).send({
        leaveTypeId: slType._id,
        startDate: localNoon(2026, 9, 8).toISOString(),
        endDate: localNoon(2026, 9, 9).toISOString(),
        totalDays: 2,
        reason: 'Overlapping leave',
      });
      expect(overlapRes.status).toBe(400);

      // Non-direct manager blocked from reviewing (403); direct manager approves
      const wrongMgrReview = await authReq('patch', `/api/v1/leaves/requests/${paidLeaveId}/review`, tokens.OTHER_MANAGER).send({ status: LEAVE_STATUS.APPROVED });
      expect(wrongMgrReview.status).toBe(403);

      const mgrApprove = await authReq('patch', `/api/v1/leaves/requests/${paidLeaveId}/review`, tokens.MANAGER).send({
        status: LEAVE_STATUS.APPROVED,
        remarks: 'Approved by reporting manager',
      });
      expect(mgrApprove.status).toBe(200);

      // Double approval rejected (400)
      const doubleApprove = await authReq('patch', `/api/v1/leaves/requests/${paidLeaveId}/review`, tokens.MANAGER).send({ status: LEAVE_STATUS.APPROVED });
      expect(doubleApprove.status).toBe(400);

      // Employee self-cancellation of already-approved leave is forbidden (403); balance & 'On Leave' attendance remain intact
      const cancelApprovedRes = await authReq('post', `/api/v1/leaves/requests/${paidLeaveId}/cancel`, tokens.EMPLOYEE);
      expect(cancelApprovedRes.status).toBe(403);

      const onLeaveAtt = await Attendance.find({
        employeeId: employees.EMPLOYEE._id,
        status: ATTENDANCE_STATUS.ON_LEAVE,
      }).lean();
      expect(onLeaveAtt.length).toBeGreaterThanOrEqual(2);

      // 2. Apply & Reject 1-day Paid Leave -> balance restored cleanly
      const applyToReject = await authReq('post', '/api/v1/leaves/apply', tokens.EMPLOYEE).send({
        leaveTypeId: clType._id,
        startDate: localNoon(2026, 9, 14).toISOString(),
        endDate: localNoon(2026, 9, 14).toISOString(),
        totalDays: 1,
        reason: 'Will be rejected',
      });
      expect(applyToReject.status).toBe(201);
      const rejectRes = await authReq('patch', `/api/v1/leaves/requests/${applyToReject.body.data.leaveRequest._id}/review`, tokens.MANAGER).send({
        status: LEAVE_STATUS.REJECTED,
        remarks: 'Release deadline',
      });
      expect(rejectRes.status).toBe(200);

      // 3. Apply & Cancel Pending Leave -> balance restored cleanly
      const applyToCancel = await authReq('post', '/api/v1/leaves/apply', tokens.EMPLOYEE).send({
        leaveTypeId: clType._id,
        startDate: localNoon(2026, 9, 16).toISOString(),
        endDate: localNoon(2026, 9, 16).toISOString(),
        totalDays: 1,
        reason: 'Will cancel while pending',
      });
      expect(applyToCancel.status).toBe(201);
      const cancelPendingRes = await authReq('post', `/api/v1/leaves/requests/${applyToCancel.body.data.leaveRequest._id}/cancel`, tokens.EMPLOYEE);
      expect(cancelPendingRes.status).toBe(200);
      expect(cancelPendingRes.body.data.leaveRequest.status).toBe(LEAVE_STATUS.CANCELLED);

      const postBal = await authReq('get', '/api/v1/leaves/balances', tokens.EMPLOYEE);
      const clAfter = postBal.body.data.balances.find((b) => String(b.leaveTypeId._id || b.leaveTypeId) === String(clType._id));
      expect(clAfter).toMatchObject({ allocated: 12, used: 2, pending: 0, remaining: 10 });

      // 4. Apply & Approve Unpaid Leave LWP (Sept 21-22 Mon-Tue = 2 days)
      const applyLwp = await authReq('post', '/api/v1/leaves/apply', tokens.EMPLOYEE).send({
        leaveTypeId: lwpType._id,
        startDate: localNoon(2026, 9, 21).toISOString(),
        endDate: localNoon(2026, 9, 22).toISOString(),
        totalDays: 2,
        reason: 'Unpaid extended trip',
      });
      expect(applyLwp.status).toBe(201);
      const approveLwp = await authReq('patch', `/api/v1/leaves/requests/${applyLwp.body.data.leaveRequest._id}/review`, tokens.MANAGER).send({ status: LEAVE_STATUS.APPROVED });
      expect(approveLwp.status).toBe(200);

      // Give Amit an active SalaryStructure & process Sept 2026 Payroll (22 Mon-Fri working days: 0 holidays; 2 paid leaves + 1 regularized Present -> 0 LOP; 2 LWP -> 2 LOP)
      await authReq('post', '/api/v1/payroll/structures', tokens.PAYROLL_ADMIN).send({
        employeeId: employees.EMPLOYEE._id,
        basicSalary: 22000,
        hra: 11000,
        specialAllowance: 0,
        statutoryConfig: { pfEnabled: true, pfEmployeeRate: 12, professionalTax: 200 },
      });

      const sepRunRes = await authReq('post', '/api/v1/payroll/runs/generate', tokens.PAYROLL_ADMIN).send({ month: 9, year: 2026 });
      expect(sepRunRes.status).toBe(200);
      const amitSepSlip = await Payslip.findOne({ employeeId: employees.EMPLOYEE._id, month: 9, year: 2026 }).lean();
      expect(amitSepSlip).toBeTruthy();
      // 22 working days, 20 present (2 paid CL days count as paid, 2 LWP days become LOP)
      expect(amitSepSlip.workingDays).toBe(22);
      expect(amitSepSlip.presentDays).toBe(20);
      expect(amitSepSlip.lopDays).toBe(2);
      // earnedBasic = 20000, earnedHra = 10000 -> gross = 30000; PF = 2400 + PT = 200 -> net = 27400
      expect(amitSepSlip.grossSalary).toBe(30000);
      expect(amitSepSlip.totalDeductions).toBe(2600);
      expect(amitSepSlip.netSalary).toBe(27400);
    });
  });

  // ===========================================================================
  // STEP 6: RECRUITMENT TO EMPLOYEE CONVERSION
  // ===========================================================================
  describe('STEP 6: Recruitment Pipeline -> Employee Provisioning', () => {
    it('creates job, tracks & interviews candidates, blocks rejected/duplicate conversion, prevents double convert, and provisions User+Employee+LeaveBalance', async () => {
      const jobRes = await authReq('post', '/api/v1/recruitment/jobs', tokens.RECRUITER).send({
        title: 'Senior Full-Stack Engineer',
        departmentId: engDept._id,
        designationId: engSde._id,
        branchId: puneBranch._id,
        openingsCount: 2,
        type: 'Full-Time',
        description: 'Build scalable HRMS modules in React and Node.js',
      });
      expect(jobRes.status).toBe(201);
      const job = jobRes.body.data.job;

      // Add 3 candidates: Rohan (eligible), Neha (rejected), DupEmail (collision)
      const rohanRes = await authReq('post', '/api/v1/recruitment/candidates', tokens.RECRUITER).send({
        jobOpeningId: job._id,
        fullName: 'Rohan Kulkarni',
        email: 'rohan.kulkarni@prvision.test',
        phone: '+91-9822223333',
        currentCompany: 'TechCorp',
        expectedCtc: 1800000,
        noticePeriodDays: 30,
      });
      const nehaRes = await authReq('post', '/api/v1/recruitment/candidates', tokens.RECRUITER).send({
        jobOpeningId: job._id,
        fullName: 'Neha Sharma',
        email: 'neha.rejected@prvision.test',
      });
      const dupCandRes = await authReq('post', '/api/v1/recruitment/candidates', tokens.RECRUITER).send({
        jobOpeningId: job._id,
        fullName: 'Amit Conflict',
        email: 'employee@prvision.test',
      });
      expect(rohanRes.status).toBe(201);
      expect(nehaRes.status).toBe(201);
      expect(dupCandRes.status).toBe(201);

      const rohan = rohanRes.body.data.candidate;
      const neha = nehaRes.body.data.candidate;
      const dupCand = dupCandRes.body.data.candidate;

      // Edit candidate & schedule interview
      const editCandRes = await authReq('put', `/api/v1/recruitment/candidates/${rohan._id}`, tokens.RECRUITER).send({
        expectedCtc: 1950000,
        notes: 'Strong distributed systems background',
      });
      expect(editCandRes.status).toBe(200);

      for (const stage of ['Screening', 'Interviewing', 'Offered']) {
        const stRes = await authReq('patch', `/api/v1/recruitment/candidates/${rohan._id}/status`, tokens.RECRUITER).send({
          status: stage,
          rating: 5,
          interviewSchedule: stage === 'Interviewing' ? { scheduledAt: localNoon(2026, 10, 5, 11, 0).toISOString(), interviewerName: 'Vikram Rao', mode: 'Technical Round' } : undefined,
        });
        expect(stRes.status).toBe(200);
      }

      // Reject Neha -> conversion must fail (400)
      await authReq('patch', `/api/v1/recruitment/candidates/${neha._id}/status`, tokens.RECRUITER).send({ status: 'Rejected' });
      const rejConv = await authReq('post', `/api/v1/recruitment/candidates/${neha._id}/convert`, tokens.HR_MANAGER).send({});
      expect(rejConv.status).toBe(400);

      // Duplicate email conversion blocked (409)
      const dupConv = await authReq('post', `/api/v1/recruitment/candidates/${dupCand._id}/convert`, tokens.HR_MANAGER).send({});
      expect(dupConv.status).toBe(409);

      // Recruiter blocked from converting (403)
      const recConv = await authReq('post', `/api/v1/recruitment/candidates/${rohan._id}/convert`, tokens.RECRUITER).send({});
      expect(recConv.status).toBe(403);

      // HR converts Rohan -> creates Employee, User, LeaveBalance & sets Hired
      const convRes = await authReq('post', `/api/v1/recruitment/candidates/${rohan._id}/convert`, tokens.HR_MANAGER).send({
        joiningDate: localNoon(2026, 10, 15).toISOString(),
        probationPeriodMonths: 3,
      });
      expect(convRes.status).toBe(201);
      const onboarded = convRes.body.data.employee;
      expect(onboarded.employeeId).toMatch(/^PRV-\d{4}/);
      expect(convRes.body.data.candidate.status).toBe('Hired');

      // Double conversion prevented (400)
      const doubleConv = await authReq('post', `/api/v1/recruitment/candidates/${rohan._id}/convert`, tokens.HR_MANAGER).send({});
      expect(doubleConv.status).toBe(400);

      // Newly converted Rohan logs in, views profile & balance, and HR assigns SalaryStructure
      const rohanToken = await loginTab('rohan.kulkarni@prvision.test', 'Welcome@123', 'tab-rohan');
      const rohanMe = await authReq('get', '/api/v1/employees/me', rohanToken, 'tab-rohan');
      expect(rohanMe.status).toBe(200);
      const rohanBal = await authReq('get', '/api/v1/leaves/balances', rohanToken, 'tab-rohan');
      expect(rohanBal.status).toBe(200);
      expect(rohanBal.body.data.balances.length).toBeGreaterThanOrEqual(3);

      const rohanSal = await authReq('post', '/api/v1/payroll/structures', tokens.PAYROLL_ADMIN).send({
        employeeId: onboarded._id,
        basicSalary: 50000,
        hra: 20000,
      });
      expect(rohanSal.status).toBe(201);
    });
  });

  // ===========================================================================
  // STEP 7: EXPENSES & DOCUMENTS END-TO-END WORKFLOWS
  // ===========================================================================
  describe('STEP 7: Expense Claims & Private Document Vault Workflows', () => {
    it('enforces receipt validation, state transitions, reimbursement RBAC, upload cleanup, and private download security', async () => {
      // Negative expense rejected
      const negExp = await authReq('post', '/api/v1/expenses', tokens.EMPLOYEE).send({
        title: 'Negative Cab',
        category: 'Travel',
        amount: -100,
      });
      expect(negExp.status).toBe(400);

      // Spoofed magic-byte receipt rejected
      const spoofRes = await authReq('post', '/api/v1/expenses', tokens.EMPLOYEE)
        .field('title', 'Spoofed Receipt')
        .field('category', 'Travel')
        .field('amount', '500')
        .attach('receipt', SPOOFED_EXE_BUFFER, { filename: 'receipt.pdf', contentType: 'application/pdf' });
      expect(spoofRes.status).toBe(400);

      // Valid PNG receipt expense submission
      const subExp = await authReq('post', '/api/v1/expenses', tokens.EMPLOYEE)
        .field('title', 'Client Site Cab')
        .field('category', 'Travel')
        .field('amount', '1850')
        .field('date', localNoon(2026, 9, 10).toISOString())
        .attach('receipt', VALID_PNG_BUFFER, { filename: 'cab.png', contentType: 'image/png' });
      expect(subExp.status).toBe(201);
      const claimId = subExp.body.data.claim._id;

      // Direct /uploads access blocked
      const receiptFile = subExp.body.data.claim.receiptUrl.replace(/^receipt:/, '');
      const rawUploadRes = await authReq('get', `/uploads/${receiptFile}`, tokens.EMPLOYEE);
      expect(rawUploadRes.status).toBe(403);

      // Colleague cannot view receipt (403); Owner & direct Manager can (200 + nosniff + private, no-store)
      const peerReceipt = await authReq('get', `/api/v1/expenses/${claimId}/receipt`, tokens.PEER_EMPLOYEE);
      expect(peerReceipt.status).toBe(403);
      const mgrReceipt = await authReq('get', `/api/v1/expenses/${claimId}/receipt`, tokens.MANAGER);
      expect(mgrReceipt.status).toBe(200);
      expect(mgrReceipt.headers['x-content-type-options']).toBe('nosniff');
      expect(mgrReceipt.headers['cache-control']).toContain('no-store');

      // Employee self-approval blocked (403); Direct manager approves (200); Manager cannot Reimburse (403); Payroll reimburses (200)
      expect((await authReq('patch', `/api/v1/expenses/${claimId}/review`, tokens.EMPLOYEE).send({ status: 'Approved' })).status).toBe(403);
      expect((await authReq('patch', `/api/v1/expenses/${claimId}/review`, tokens.MANAGER).send({ status: 'Approved' })).status).toBe(200);
      expect((await authReq('patch', `/api/v1/expenses/${claimId}/review`, tokens.MANAGER).send({ status: 'Reimbursed' })).status).toBe(403);
      const reimRes = await authReq('patch', `/api/v1/expenses/${claimId}/review`, tokens.PAYROLL_ADMIN).send({ status: 'Reimbursed' });
      expect(reimRes.status).toBe(200);
      expect(reimRes.body.data.claim.reimbursedDate).toBeTruthy();

      // Reimbursed claim locked against further modifications (400)
      expect((await authReq('patch', `/api/v1/expenses/${claimId}/review`, tokens.HR_MANAGER).send({ status: 'Rejected' })).status).toBe(400);

      // Private Document Upload -> Authorized Download -> Colleague 403 -> HR Delete cleans DB & file
      const upDoc = await authReq('post', '/api/v1/documents/upload', tokens.HR_MANAGER)
        .field('title', 'Amit Appointment Letter')
        .field('category', 'Appointment Letter')
        .field('employeeId', String(employees.EMPLOYEE._id))
        .attach('file', VALID_PDF_BUFFER, { filename: 'appointment.pdf', contentType: 'application/pdf' });
      expect(upDoc.status).toBe(201);
      const doc = upDoc.body.data.document;
      const diskPath = path.join(UPLOAD_ROOT, doc.fileName);
      expect(fs.existsSync(diskPath)).toBe(true);

      const ownerDl = await authReq('get', `/api/v1/documents/${doc._id}/download`, tokens.EMPLOYEE);
      expect(ownerDl.status).toBe(200);
      expect(ownerDl.headers['x-content-type-options']).toBe('nosniff');
      expect((await authReq('get', `/api/v1/documents/${doc._id}/download`, tokens.PEER_EMPLOYEE)).status).toBe(403);

      const delDocRes = await authReq('delete', `/api/v1/documents/${doc._id}`, tokens.HR_MANAGER);
      expect(delDocRes.status).toBe(200);
      expect(await Document.findById(doc._id).lean()).toBeNull();
      expect(fs.existsSync(diskPath)).toBe(false);
    });
  });

  // ===========================================================================
  // STEP 8: PERFORMANCE, TRAINING & ASSETS WORKFLOWS
  // ===========================================================================
  describe('STEP 8: Performance Reviews, Training Progress & Assets Lifecycle', () => {
    it('completes end-to-end Performance review, Training enrollment/completion, and Asset assign/maintenance/retire rules', async () => {
      // Performance workflow
      const perfInit = await authReq('post', '/api/v1/performance', tokens.MANAGER).send({
        employeeId: employees.EMPLOYEE._id,
        reviewCycle: 'Q3-2026',
        goals: [{ title: 'Deliver RBAC hardening', weightage: 100 }],
      });
      expect(perfInit.status).toBe(201);
      const revId = perfInit.body.data.review._id;
      expect(perfInit.body.data.review.status).toBe('Self Review Pending');

      // Duplicate cycle rejected (409); non-team review by manager rejected (403)
      expect((await authReq('post', '/api/v1/performance', tokens.MANAGER).send({ employeeId: employees.EMPLOYEE._id, reviewCycle: 'Q3-2026' })).status).toBe(409);
      expect((await authReq('post', '/api/v1/performance', tokens.MANAGER).send({ employeeId: employees.PEER_EMPLOYEE._id, reviewCycle: 'Q3-2026' })).status).toBe(403);

      const selfRes = await authReq('patch', `/api/v1/performance/${revId}/self-review`, tokens.EMPLOYEE).send({
        selfRating: 4,
        goals: [{ title: 'Deliver RBAC hardening', weightage: 100, status: 'Achieved', progress: 100 }],
        comments: 'Completed on schedule',
      });
      expect(selfRes.status).toBe(200);
      expect(selfRes.body.data.review.status).toBe('Manager Review Pending');

      const mgrEval = await authReq('patch', `/api/v1/performance/${revId}/manager-review`, tokens.MANAGER).send({
        managerRating: 5,
        finalScore: 4.5,
        strengths: 'Architectural ownership',
      });
      expect(mgrEval.status).toBe(200);
      expect(mgrEval.body.data.review.status).toBe('Completed');

      // Editing Completed review rejected (400)
      expect((await authReq('patch', `/api/v1/performance/${revId}/self-review`, tokens.EMPLOYEE).send({ selfRating: 5 })).status).toBe(400);

      // Training workflow
      expect((await authReq('post', '/api/v1/training/programs', tokens.HR_MANAGER).send({
        title: 'Invalid Date Program',
        trainerName: 'Security Team',
        startDate: localNoon(2026, 10, 10).toISOString(),
        endDate: localNoon(2026, 10, 5).toISOString(),
      })).status).toBe(400);

      const progRes = await authReq('post', '/api/v1/training/programs', tokens.HR_MANAGER).send({
        title: 'OWASP Application Security',
        category: 'Compliance & POSH',
        trainerName: 'AppSec Guild',
        startDate: localNoon(2026, 10, 1).toISOString(),
        endDate: localNoon(2026, 10, 5).toISOString(),
        durationHours: 12,
      });
      expect(progRes.status).toBe(201);
      const progId = progRes.body.data.program._id;

      // Manager cannot enroll non-report (403); can enroll Amit (201)
      expect((await authReq('post', `/api/v1/training/programs/${progId}/assign`, tokens.MANAGER).send({ employeeIds: [employees.PEER_EMPLOYEE._id] })).status).toBe(403);
      const enrRes = await authReq('post', `/api/v1/training/programs/${progId}/assign`, tokens.MANAGER).send({ employeeIds: [employees.EMPLOYEE._id] });
      expect(enrRes.status).toBe(201);
      const assignId = enrRes.body.data.assignments[0]._id;

      const compRes = await authReq('patch', `/api/v1/training/assignments/${assignId}/progress`, tokens.EMPLOYEE).send({
        status: 'Completed',
        score: 94,
        feedback: 'Very practical curriculum',
      });
      expect(compRes.status).toBe(200);
      expect(compRes.body.data.assignment.completedDate).toBeTruthy();

      const progsList = await authReq('get', '/api/v1/training/programs', tokens.HR_MANAGER);
      const updatedProg = progsList.body.data.programs.find((p) => String(p._id) === String(progId));
      expect(updatedProg.completedCount).toBe(1);

      // Asset workflow
      const astRes = await authReq('post', '/api/v1/assets', tokens.HR_MANAGER).send({
        assetTag: 'PRV-LAP-900',
        name: 'MacBook Pro 16',
        category: 'Laptop',
        purchaseCost: 240000,
        condition: 'New',
      });
      expect(astRes.status).toBe(201);
      const assetId = astRes.body.data.asset._id;

      expect((await authReq('post', `/api/v1/assets/${assetId}/assign`, tokens.HR_MANAGER).send({ employeeId: employees.EMPLOYEE._id })).status).toBe(200);
      // Double assign blocked (400)
      expect((await authReq('post', `/api/v1/assets/${assetId}/assign`, tokens.HR_MANAGER).send({ employeeId: employees.PEER_EMPLOYEE._id })).status).toBe(400);

      // Return with Needs Maintenance -> Under Repair, cannot assign
      const retMaint = await authReq('post', `/api/v1/assets/${assetId}/return`, tokens.HR_MANAGER).send({ conditionAtReturn: 'Needs Maintenance', remarks: 'Battery bulge' });
      expect(retMaint.status).toBe(200);
      expect(retMaint.body.data.asset.status).toBe('Under Repair');
      expect((await authReq('post', `/api/v1/assets/${assetId}/assign`, tokens.HR_MANAGER).send({ employeeId: employees.EMPLOYEE._id })).status).toBe(400);

      // Restore to Available, reassign & return as Retired -> Decommissioned, cannot assign
      await authReq('put', `/api/v1/assets/${assetId}`, tokens.HR_MANAGER).send({ status: 'Available', condition: 'Good' });
      await authReq('post', `/api/v1/assets/${assetId}/assign`, tokens.HR_MANAGER).send({ employeeId: employees.EMPLOYEE._id });
      const retRetire = await authReq('post', `/api/v1/assets/${assetId}/return`, tokens.HR_MANAGER).send({ conditionAtReturn: 'Retired', remarks: 'End of life' });
      expect(retRetire.body.data.asset.status).toBe('Decommissioned');
      expect((await authReq('post', `/api/v1/assets/${assetId}/assign`, tokens.HR_MANAGER).send({ employeeId: employees.PEER_EMPLOYEE._id })).status).toBe(400);
    });
  });

  // ===========================================================================
  // STEP 9: ANNOUNCEMENTS, NOTIFICATIONS & DASHBOARD CONSISTENCY
  // ===========================================================================
  describe('STEP 9: Targeted Announcements, Dashboard Sync & Notifications Audit', () => {
    it('enforces branch+dept targeting, expiry, edit/unpublish on announcements & dashboard, and audits automated Notification behavior', async () => {
      // Create org-wide notice, Pune-HR targeted notice, and Draft notice
      const orgNotice = await authReq('post', '/api/v1/announcements', tokens.HR_MANAGER).send({
        title: 'Annual Townhall 2026',
        content: 'All hands on Oct 30 at 4 PM IST',
        priority: 'Important',
        isPinned: true,
        isActive: true,
      });
      const puneNotice = await authReq('post', '/api/v1/announcements', tokens.HR_MANAGER).send({
        title: 'Pune Campus Maintenance',
        content: 'Power backup drill for Pune HR wing',
        targetBranchId: puneBranch._id,
        targetDepartmentId: hrDept._id,
        isActive: true,
      });
      const expiredNotice = await authReq('post', '/api/v1/announcements', tokens.HR_MANAGER).send({
        title: 'Expired Security Drill',
        content: 'Already ended last year',
        expiresAt: localNoon(2025, 1, 1).toISOString(),
        isActive: true,
      });
      expect(orgNotice.status).toBe(201);
      expect(puneNotice.status).toBe(201);
      expect(expiredNotice.status).toBe(201);

      // Amit (HQ + Eng) sees Org-Wide, NOT Pune-HR, NOT Expired
      const empAnn = await authReq('get', '/api/v1/announcements', tokens.EMPLOYEE);
      const empTitles = empAnn.body.data.announcements.map((a) => a.title);
      expect(empTitles).toContain('Annual Townhall 2026');
      expect(empTitles).not.toContain('Pune Campus Maintenance');
      expect(empTitles).not.toContain('Expired Security Drill');

      // Peer (Pune + HR) sees BOTH Org-Wide & Pune-HR via Announcements and Dashboard
      const peerDash = await authReq('get', '/api/v1/dashboard/stats', tokens.PEER_EMPLOYEE);
      const peerDashTitles = peerDash.body.data.announcements.map((a) => a.title);
      expect(peerDashTitles).toContain('Annual Townhall 2026');
      expect(peerDashTitles).toContain('Pune Campus Maintenance');

      // Edit & Unpublish Org-Wide notice -> hidden from dashboard immediately
      await authReq('put', `/api/v1/announcements/${orgNotice.body.data.announcement._id}`, tokens.HR_MANAGER).send({
        title: 'Annual Townhall 2026 (Cancelled)',
        isActive: false,
      });
      const empDashAfter = await authReq('get', '/api/v1/dashboard/stats', tokens.EMPLOYEE);
      expect(empDashAfter.body.data.announcements.map((a) => a.title)).not.toContain('Annual Townhall 2026 (Cancelled)');

      // Audit automated Notification generation across workflows
      const autoNotificationsCount = await Notification.countDocuments();
      expect(autoNotificationsCount).toBe(0); // Known Gap: workflow controllers do not automatically emit Notification records yet

      // Verify Notification read/unread endpoints with synthetic notifications
      const n1 = await Notification.create({ recipientId: users.EMPLOYEE._id, title: 'Leave Approved', message: 'Your CL was approved' });
      await Notification.create({ recipientId: users.EMPLOYEE._id, title: 'Payslip Ready', message: 'Sept payslip ready' });
      const getNotif = await authReq('get', '/api/v1/notifications', tokens.EMPLOYEE);
      expect(getNotif.status).toBe(200);
      expect(getNotif.body.data.unreadCount).toBe(2);
      await authReq('patch', `/api/v1/notifications/${n1._id}/read`, tokens.EMPLOYEE);
      await authReq('patch', '/api/v1/notifications/read-all', tokens.EMPLOYEE);
      const getNotifAfter = await authReq('get', '/api/v1/notifications', tokens.EMPLOYEE);
      expect(getNotifAfter.body.data.unreadCount).toBe(0);
    });
  });

  // ===========================================================================
  // STEP 10: COMPLETE ROLE-BASED END-TO-END MATRIX (ALL 7 ROLES + HR ENUM CHECK)
  // ===========================================================================
  describe('STEP 10: Full 7-Role RBAC & Grievances Matrix', () => {
    it('enforces exact ROLES enum (rejecting HR) and enforces allow/403 boundaries across all 7 roles on real business APIs', async () => {
      // Verify 'HR' role string is invalid per User schema (system uses HR_MANAGER)
      await expect(
        User.create({ name: 'Bad HR', email: 'badhr@prvision.test', password: 'Password@123', role: 'HR' })
      ).rejects.toThrow();

      // Grievance confidentiality workflow
      const grievRes = await authReq('post', '/api/v1/grievances', tokens.EMPLOYEE).send({
        category: 'Payroll & Compensation',
        priority: 'High',
        subject: 'Tax slab query',
        description: 'Request clarification on Section 80C exemption',
        isConfidential: true,
      });
      expect(grievRes.status).toBe(201);
      const grievId = grievRes.body.data.grievance._id;

      // Colleague & Manager cannot read Amit's confidential grievance; HR resolves it
      expect((await authReq('get', '/api/v1/grievances', tokens.PEER_EMPLOYEE)).body.data.grievances.some((g) => String(g._id) === String(grievId))).toBe(false);
      expect((await authReq('patch', `/api/v1/grievances/${grievId}/status`, tokens.MANAGER).send({ status: 'Resolved' })).status).toBe(403);
      expect((await authReq('patch', `/api/v1/grievances/${grievId}/status`, tokens.HR_MANAGER).send({ status: 'Resolved', resolutionNotes: 'Answered via email' })).status).toBe(200);

      // Permission Matrix Check across all 7 valid roles
      const matrixChecks = [
        // EMPLOYEE
        { role: 'EMPLOYEE', token: tokens.EMPLOYEE, method: 'get', url: '/api/v1/payroll/payslips', expected: 200 },
        { role: 'EMPLOYEE', token: tokens.EMPLOYEE, method: 'get', url: '/api/v1/payroll/runs', expected: 403 },
        { role: 'EMPLOYEE', token: tokens.EMPLOYEE, method: 'get', url: '/api/v1/reports/employees', expected: 403 },
        { role: 'EMPLOYEE', token: tokens.EMPLOYEE, method: 'get', url: '/api/v1/system/audit-logs', expected: 403 },
        // MANAGER
        { role: 'MANAGER', token: tokens.MANAGER, method: 'get', url: '/api/v1/reports/attendance', expected: 200 },
        { role: 'MANAGER', token: tokens.MANAGER, method: 'get', url: '/api/v1/reports/payroll', expected: 403 },
        { role: 'MANAGER', token: tokens.MANAGER, method: 'post', url: '/api/v1/organization/branches', expected: 403 },
        // RECRUITER
        { role: 'RECRUITER', token: tokens.RECRUITER, method: 'get', url: '/api/v1/recruitment/candidates', expected: 200 },
        { role: 'RECRUITER', token: tokens.RECRUITER, method: 'get', url: '/api/v1/reports/payroll', expected: 403 },
        { role: 'RECRUITER', token: tokens.RECRUITER, method: 'get', url: '/api/v1/payroll/runs', expected: 403 },
        // PAYROLL_ADMIN
        { role: 'PAYROLL_ADMIN', token: tokens.PAYROLL_ADMIN, method: 'get', url: '/api/v1/reports/payroll', expected: 200 },
        { role: 'PAYROLL_ADMIN', token: tokens.PAYROLL_ADMIN, method: 'get', url: '/api/v1/system/diagnostics', expected: 403 },
        { role: 'PAYROLL_ADMIN', token: tokens.PAYROLL_ADMIN, method: 'post', url: '/api/v1/recruitment/jobs', expected: 403 },
        // HR_MANAGER
        { role: 'HR_MANAGER', token: tokens.HR_MANAGER, method: 'get', url: '/api/v1/system/audit-logs', expected: 200 },
        { role: 'HR_MANAGER', token: tokens.HR_MANAGER, method: 'get', url: '/api/v1/system/diagnostics', expected: 403 },
        { role: 'HR_MANAGER', token: tokens.HR_MANAGER, method: 'put', url: '/api/v1/organization/settings', expected: 403 },
        // ADMIN & SUPER_ADMIN
        { role: 'ADMIN', token: tokens.ADMIN, method: 'get', url: '/api/v1/system/diagnostics', expected: 200 },
        { role: 'SUPER_ADMIN', token: tokens.SUPER_ADMIN, method: 'get', url: '/api/v1/system/diagnostics', expected: 200 },
      ];

      for (const chk of matrixChecks) {
        const res = await authReq(chk.method, chk.url, chk.token).send({});
        expect(res.status, `Matrix failure for ${chk.role} -> ${chk.method.toUpperCase()} ${chk.url}`).toBe(chk.expected);
      }
    });
  });

  // ===========================================================================
  // STEP 11: SIMULATED PRODUCTION DATA INTEGRITY SWEEP AFTER FULL E2E WORKFLOWS
  // ===========================================================================
  describe('STEP 11: Post-Workflow Comprehensive Relational & Financial Data Integrity Check', () => {
    it('verifies zero duplicates, zero orphan links, exact balance equations, exact payroll totals, and valid asset/hour invariants', async () => {
      const [
        allUsers,
        allEmps,
        allDepts,
        allDesigs,
        allBranches,
        allLeaveTypes,
        allLeaveBalances,
        allLeaveRequests,
        allAtts,
        allStructs,
        allRuns,
        allPayslips,
        allAssets,
        allAssetAssigns,
      ] = await Promise.all([
        User.find({}).lean(),
        Employee.find({}).lean(),
        Department.find({}).lean(),
        Designation.find({}).lean(),
        Branch.find({}).lean(),
        LeaveType.find({}).lean(),
        LeaveBalance.find({}).lean(),
        LeaveRequest.find({}).lean(),
        Attendance.find({}).lean(),
        SalaryStructure.find({}).lean(),
        PayrollRun.find({}).lean(),
        Payslip.find({}).lean(),
        Asset.find({}).lean(),
        AssetAssignment.find({}).lean(),
      ]);

      const empIds = new Set(allEmps.map((e) => String(e._id)));
      const userMap = new Map(allUsers.map((u) => [String(u._id), u]));
      const deptIds = new Set(allDepts.map((d) => String(d._id)));
      const desigIds = new Set(allDesigs.map((d) => String(d._id)));
      const branchIds = new Set(allBranches.map((b) => String(b._id)));
      const ltIds = new Set(allLeaveTypes.map((l) => String(l._id)));

      // 1. Unique active emails & codes
      const seenActiveEmails = new Set();
      const seenCodes = new Set();
      for (const e of allEmps) {
        expect(seenCodes.has(e.employeeId)).toBe(false);
        seenCodes.add(e.employeeId);
        if (!e.isDeleted) {
          const email = e.email.toLowerCase();
          expect(seenActiveEmails.has(email)).toBe(false);
          seenActiveEmails.add(email);
        }
        expect(deptIds.has(String(e.departmentId))).toBe(true);
        expect(desigIds.has(String(e.designationId))).toBe(true);
        if (e.branchId) expect(branchIds.has(String(e.branchId))).toBe(true);
        if (e.userId) {
          const u = userMap.get(String(e.userId));
          expect(u).toBeTruthy();
          expect(String(u.employeeId)).toBe(String(e._id));
        }
      }

      // 2. LeaveBalance zero orphans & exact math
      for (const lb of allLeaveBalances) {
        expect(empIds.has(String(lb.employeeId))).toBe(true);
        for (const item of lb.balances) {
          expect(ltIds.has(String(item.leaveTypeId))).toBe(true);
          const expectedRem = Math.max(0, Math.round((item.allocated - item.used - item.pending) * 10) / 10);
          expect(item.remaining).toBe(expectedRem);
        }
      }

      // 3. LeaveRequest zero orphans & valid ranges
      for (const lr of allLeaveRequests) {
        expect(empIds.has(String(lr.employeeId))).toBe(true);
        expect(ltIds.has(String(lr.leaveTypeId))).toBe(true);
        expect(new Date(lr.endDate).getTime()).toBeGreaterThanOrEqual(new Date(lr.startDate).getTime());
      }

      // 4. Attendance zero impossible hours
      for (const a of allAtts) {
        expect(empIds.has(String(a.employeeId))).toBe(true);
        expect(a.totalHours || 0).toBeGreaterThanOrEqual(0);
        expect(a.totalHours || 0).toBeLessThanOrEqual(24);
        expect(a.overtimeHours || 0).toBeGreaterThanOrEqual(0);
      }

      // 5. PayrollRun totals match Payslip sums + net === gross - ded
      for (const s of allStructs) expect(empIds.has(String(s.employeeId))).toBe(true);
      for (const r of allRuns) {
        const runSlips = allPayslips.filter((p) => String(p.payrollRunId) === String(r._id));
        expect(runSlips.length).toBe(r.totalEmployees);
        expect(runSlips.reduce((acc, p) => acc + p.grossSalary, 0)).toBe(r.totalGrossSalary);
        expect(runSlips.reduce((acc, p) => acc + p.totalDeductions, 0)).toBe(r.totalDeductions);
        expect(runSlips.reduce((acc, p) => acc + p.netSalary, 0)).toBe(r.totalNetSalary);
        for (const p of runSlips) {
          expect(empIds.has(String(p.employeeId))).toBe(true);
          expect(p.netSalary).toBe(Math.max(0, p.grossSalary - p.totalDeductions));
        }
      }

      // 6. Asset state & active AssetAssignment consistency
      for (const asset of allAssets) {
        const activeAssigns = allAssetAssigns.filter(
          (aa) => String(aa.assetId) === String(asset._id) && aa.status === 'Active'
        );
        if (asset.status === 'Assigned') {
          expect(asset.currentAssignedTo).toBeTruthy();
          expect(activeAssigns).toHaveLength(1);
        } else {
          expect(asset.currentAssignedTo).toBeNull();
          expect(activeAssigns).toHaveLength(0);
        }
      }
    });
  });
});
