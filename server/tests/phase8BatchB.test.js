import { describe, it, expect, beforeAll } from 'vitest';
import mongoose from 'mongoose';
import './setup.js';
import { api } from './setup.js';
import { env } from '../src/config/env.js';
import {
  ATTENDANCE_STATUS,
  LEAVE_STATUS,
  LIFECYCLE_STAGES,
  PAYROLL_STATUS,
  ROLES,
} from '../src/config/constants.js';
import {
  BATCH_B_INDEX_PLAN,
  applyBatchBIndexes,
  rollbackBatchBIndexes,
} from '../src/scripts/migrateIndexesBatchB.js';

import CompanySettings from '../src/models/CompanySettings.js';
import Branch from '../src/models/Branch.js';
import Department from '../src/models/Department.js';
import Designation from '../src/models/Designation.js';
import Shift from '../src/models/Shift.js';
import Employee from '../src/models/Employee.js';
import User from '../src/models/User.js';
import Attendance from '../src/models/Attendance.js';
import LeaveType from '../src/models/LeaveType.js';
import LeaveRequest from '../src/models/LeaveRequest.js';
import Holiday from '../src/models/Holiday.js';
import PayrollRun from '../src/models/PayrollRun.js';
import JobOpening from '../src/models/JobOpening.js';
import Candidate from '../src/models/Candidate.js';
import Announcement from '../src/models/Announcement.js';
import Document from '../src/models/Document.js';
import AuditLog from '../src/models/AuditLog.js';
import ExpenseClaim from '../src/models/ExpenseClaim.js';
import Grievance from '../src/models/Grievance.js';
import PerformanceReview from '../src/models/PerformanceReview.js';
import TrainingProgram from '../src/models/TrainingProgram.js';
import TrainingAssignment from '../src/models/TrainingAssignment.js';

function collectStages(node, out = []) {
  if (!node || typeof node !== 'object') return out;
  if (node.stage) out.push(node.stage);
  if (node.inputStage) collectStages(node.inputStage, out);
  if (Array.isArray(node.inputStages)) node.inputStages.forEach((n) => collectStages(n, out));
  if (Array.isArray(node.shards)) node.shards.forEach((s) => collectStages(s.winningPlan || s, out));
  return out;
}

describe('Phase 8 Batch B — Database Index Plan, Dashboard Optimization & Employee Options API', () => {
  let branches;
  let departments;
  let designationEng;
  let shift;
  let leaveType;

  let tokens = {};
  let users = {};
  let employees = {};

  const password = 'Password@123';
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  const yesterday = new Date(startOfToday);
  yesterday.setDate(yesterday.getDate() - 1);

  const login = async (email, tabId) => {
    const res = await api
      .post('/api/v1/auth/login')
      .set('X-Tab-Id', tabId)
      .send({ email, password });
    expect(res.status).toBe(200);
    return res.body.data.tokens.accessToken;
  };

  beforeAll(async () => {
    await CompanySettings.create({
      companyName: 'PR VISION INNOVATIONS',
      contactEmail: 'hr@prvision.com',
    });

    branches = await Branch.insertMany([
      {
        name: 'Bengaluru HQ',
        code: 'BLR-HQ',
        isHeadquarters: true,
        address: { city: 'Bengaluru', state: 'Karnataka', country: 'India' },
      },
      {
        name: 'Mumbai Hub',
        code: 'MUM-01',
        isHeadquarters: false,
        address: { city: 'Mumbai', state: 'Maharashtra', country: 'India' },
      },
    ]);

    departments = await Department.insertMany([
      { name: 'Engineering', code: 'ENG', branchId: branches[0]._id },
      { name: 'Human Resources', code: 'HR', branchId: branches[0]._id },
      { name: 'Finance', code: 'FIN', branchId: branches[1]._id },
    ]);

    designationEng = await Designation.create({
      title: 'Senior Software Engineer',
      code: 'ENG-SSE',
      departmentId: departments[0]._id,
      level: 3,
    });

    shift = await Shift.create({
      name: 'Standard Day Shift',
      code: 'DAY',
      startTime: '09:30',
      endTime: '18:30',
      isDefault: true,
    });

    leaveType = await LeaveType.create({ name: 'Casual Leave', code: 'CL', defaultDaysPerYear: 12 });

    // Create users across all RBAC roles
    users.admin = await User.create({
      name: 'Admin User',
      email: 'admin.b@prvision.com',
      password,
      role: ROLES.ADMIN,
      branchId: branches[0]._id,
    });
    users.hr = await User.create({
      name: 'HR Manager',
      email: 'hr.b@prvision.com',
      password,
      role: ROLES.HR_MANAGER,
      branchId: branches[0]._id,
    });
    users.payroll = await User.create({
      name: 'Payroll Admin',
      email: 'payroll.b@prvision.com',
      password,
      role: ROLES.PAYROLL_ADMIN,
      branchId: branches[1]._id,
    });
    users.recruiter = await User.create({
      name: 'Talent Recruiter',
      email: 'recruiter.b@prvision.com',
      password,
      role: ROLES.RECRUITER,
      branchId: branches[0]._id,
    });
    users.manager = await User.create({
      name: 'Engineering Manager',
      email: 'manager.b@prvision.com',
      password,
      role: ROLES.MANAGER,
      branchId: branches[0]._id,
    });
    users.soloManager = await User.create({
      name: 'Solo Manager',
      email: 'solomgr.b@prvision.com',
      password,
      role: ROLES.MANAGER,
      branchId: branches[1]._id,
    });
    users.orphanManager = await User.create({
      name: 'Orphan Manager',
      email: 'orphanmgr.b@prvision.com',
      password,
      role: ROLES.MANAGER,
      branchId: branches[0]._id,
    });
    users.emp = await User.create({
      name: 'Aarav Rao',
      email: 'aarav.b@prvision.com',
      password,
      role: ROLES.EMPLOYEE,
      branchId: branches[0]._id,
    });

    // Employee records
    employees.manager = await Employee.create({
      userId: users.manager._id,
      employeeId: 'PRV-1001',
      firstName: 'Vikram',
      lastName: 'Desai',
      email: 'manager.b@prvision.com',
      branchId: branches[0]._id,
      departmentId: departments[0]._id,
      designationId: designationEng._id,
      shiftId: shift._id,
      employmentStatus: LIFECYCLE_STAGES.CONFIRMED,
      joiningDate: new Date(now.getTime() - 90 * 86400000),
      dateOfBirth: new Date(1989, 3, 12),
      bankDetails: { accountNumber: '999988887777', bankName: 'ICICI', ifscCode: 'ICIC0001122' },
    });
    users.manager.employeeId = employees.manager._id;
    await users.manager.save();

    employees.soloManager = await Employee.create({
      userId: users.soloManager._id,
      employeeId: 'PRV-1002',
      firstName: 'Meera',
      lastName: 'Joshi',
      email: 'solomgr.b@prvision.com',
      branchId: branches[1]._id,
      departmentId: departments[2]._id,
      designationId: designationEng._id,
      shiftId: shift._id,
      employmentStatus: LIFECYCLE_STAGES.CONFIRMED,
      joiningDate: new Date(now.getTime() - 60 * 86400000),
    });
    users.soloManager.employeeId = employees.soloManager._id;
    await users.soloManager.save();

    employees.hr = await Employee.create({
      userId: users.hr._id,
      employeeId: 'PRV-1003',
      firstName: 'Sonia',
      lastName: 'Kapoor',
      email: 'hr.b@prvision.com',
      branchId: branches[0]._id,
      departmentId: departments[1]._id,
      designationId: designationEng._id,
      shiftId: shift._id,
      employmentStatus: LIFECYCLE_STAGES.CONFIRMED,
      joiningDate: new Date(now.getTime() - 5 * 86400000), // new joiner
      dateOfBirth: new Date(1991, 8, 22),
    });
    users.hr.employeeId = employees.hr._id;
    await users.hr.save();

    employees.payroll = await Employee.create({
      userId: users.payroll._id,
      employeeId: 'PRV-1004',
      firstName: 'Ramesh',
      lastName: 'Iyer',
      email: 'payroll.b@prvision.com',
      branchId: branches[1]._id,
      departmentId: departments[2]._id,
      designationId: designationEng._id,
      shiftId: shift._id,
      employmentStatus: LIFECYCLE_STAGES.PROMOTED,
      joiningDate: new Date(now.getTime() - 150 * 86400000),
    });
    users.payroll.employeeId = employees.payroll._id;
    await users.payroll.save();

    employees.recruiter = await Employee.create({
      userId: users.recruiter._id,
      employeeId: 'PRV-1005',
      firstName: 'Divya',
      lastName: 'Menon',
      email: 'recruiter.b@prvision.com',
      branchId: branches[0]._id,
      departmentId: departments[1]._id,
      designationId: designationEng._id,
      shiftId: shift._id,
      employmentStatus: LIFECYCLE_STAGES.CONFIRMED,
      joiningDate: new Date(now.getTime() - 75 * 86400000),
    });
    users.recruiter.employeeId = employees.recruiter._id;
    await users.recruiter.save();

    // Direct reports for manager + unrelated + exited + soft-deleted
    employees.emp1 = await Employee.create({
      userId: users.emp._id,
      employeeId: 'PRV-1006',
      firstName: 'Aarav',
      lastName: 'Rao',
      email: 'aarav.b@prvision.com',
      phone: '+91-9876543210',
      address: { street: '42 MG Road', city: 'Bengaluru', country: 'India' },
      emergencyContact: { name: 'Parent', phone: '+91-9000000000', relationship: 'Father' },
      bankDetails: { accountNumber: '123456789012', bankName: 'HDFC', ifscCode: 'HDFC0000123' },
      branchId: branches[0]._id,
      departmentId: departments[0]._id,
      designationId: designationEng._id,
      managerId: employees.manager._id,
      shiftId: shift._id,
      employmentStatus: LIFECYCLE_STAGES.CONFIRMED,
      joiningDate: new Date(now.getTime() - 10 * 86400000),
      dateOfBirth: new Date(1996, 5, 1),
    });
    users.emp.employeeId = employees.emp1._id;
    await users.emp.save();

    employees.emp2 = await Employee.create({
      employeeId: 'PRV-1007',
      firstName: 'Bhavna',
      lastName: 'Kulkarni',
      email: 'bhavna.b@prvision.com',
      branchId: branches[0]._id,
      departmentId: departments[0]._id,
      designationId: designationEng._id,
      managerId: employees.manager._id,
      shiftId: shift._id,
      employmentStatus: LIFECYCLE_STAGES.PROBATION,
      joiningDate: new Date(now.getTime() - 200 * 86400000),
    });

    // Direct report with Half-day today (verifies teamPresentToday counts Present+Late only, NOT Half-day)
    employees.empHalf = await Employee.create({
      employeeId: 'PRV-1008',
      firstName: 'Chetan',
      lastName: 'Sinha',
      email: 'chetan.b@prvision.com',
      branchId: branches[1]._id,
      departmentId: departments[2]._id,
      designationId: designationEng._id,
      managerId: employees.manager._id,
      shiftId: shift._id,
      employmentStatus: LIFECYCLE_STAGES.CONFIRMED,
      joiningDate: new Date(now.getTime() - 200 * 86400000),
    });

    // Unrelated employee (different manager)
    employees.unrelated = await Employee.create({
      employeeId: 'PRV-1009',
      firstName: 'Zoya',
      lastName: 'Khan',
      email: 'zoya.b@prvision.com',
      branchId: branches[1]._id,
      departmentId: departments[2]._id,
      designationId: designationEng._id,
      managerId: null,
      shiftId: shift._id,
      employmentStatus: LIFECYCLE_STAGES.CONFIRMED,
      joiningDate: new Date(now.getTime() - 250 * 86400000),
    });

    // Exited employees (non-deleted)
    employees.resigned = await Employee.create({
      employeeId: 'PRV-1010',
      firstName: 'Exited',
      lastName: 'Resigned',
      email: 'resigned.b@prvision.com',
      branchId: branches[0]._id,
      departmentId: departments[0]._id,
      designationId: designationEng._id,
      managerId: employees.manager._id,
      shiftId: shift._id,
      employmentStatus: LIFECYCLE_STAGES.RESIGNED,
      joiningDate: new Date(now.getTime() - 300 * 86400000),
    });
    employees.relieved = await Employee.create({
      employeeId: 'PRV-1011',
      firstName: 'Exited',
      lastName: 'Relieved',
      email: 'relieved.b@prvision.com',
      branchId: branches[0]._id,
      departmentId: departments[0]._id,
      designationId: designationEng._id,
      shiftId: shift._id,
      employmentStatus: LIFECYCLE_STAGES.RELIEVED,
      joiningDate: new Date(now.getTime() - 300 * 86400000),
    });
    employees.terminated = await Employee.create({
      employeeId: 'PRV-1012',
      firstName: 'Exited',
      lastName: 'Terminated',
      email: 'terminated.b@prvision.com',
      branchId: branches[0]._id,
      departmentId: departments[0]._id,
      designationId: designationEng._id,
      shiftId: shift._id,
      employmentStatus: LIFECYCLE_STAGES.TERMINATED,
      joiningDate: new Date(now.getTime() - 300 * 86400000),
    });

    // Soft-deleted employee (must never show up in /options or active counts)
    employees.deleted = await Employee.create({
      employeeId: 'PRV-1013',
      firstName: 'Ghost',
      lastName: 'Deleted',
      email: 'ghost.b@prvision.com',
      branchId: branches[0]._id,
      departmentId: departments[0]._id,
      designationId: designationEng._id,
      managerId: employees.manager._id,
      shiftId: shift._id,
      employmentStatus: LIFECYCLE_STAGES.CONFIRMED,
      isDeleted: true,
    });

    // Attendance records covering Present, Late, Half-day, Absent across today & yesterday
    await Attendance.insertMany([
      {
        employeeId: employees.manager._id,
        date: startOfToday,
        status: ATTENDANCE_STATUS.PRESENT,
        checkInTime: new Date(startOfToday.getTime() + 9 * 3600000),
        branchId: branches[0]._id,
      },
      {
        employeeId: employees.emp1._id,
        date: startOfToday,
        status: ATTENDANCE_STATUS.LATE,
        checkInTime: new Date(startOfToday.getTime() + 10 * 3600000),
        checkOutTime: new Date(startOfToday.getTime() + 18 * 3600000),
        branchId: branches[0]._id,
      },
      {
        employeeId: employees.emp2._id,
        date: startOfToday,
        status: ATTENDANCE_STATUS.PRESENT,
        checkInTime: new Date(startOfToday.getTime() + 9 * 3600000),
        branchId: branches[0]._id,
      },
      {
        employeeId: employees.empHalf._id,
        date: startOfToday,
        status: ATTENDANCE_STATUS.HALF_DAY,
        checkInTime: new Date(startOfToday.getTime() + 9.5 * 3600000),
        branchId: branches[1]._id,
      },
      {
        employeeId: employees.unrelated._id,
        date: startOfToday,
        status: ATTENDANCE_STATUS.ABSENT,
        branchId: branches[1]._id,
      },
      {
        employeeId: employees.recruiter._id,
        date: startOfToday,
        status: ATTENDANCE_STATUS.HALF_DAY,
        checkInTime: new Date(startOfToday.getTime() + 10 * 3600000),
        branchId: branches[0]._id,
      },
      // Yesterday records for 7-day trend & ESS monthlyPresentDays parity
      {
        employeeId: employees.emp1._id,
        date: yesterday,
        status: ATTENDANCE_STATUS.PRESENT,
        checkInTime: new Date(yesterday.getTime() + 9 * 3600000),
        branchId: branches[0]._id,
      },
      {
        employeeId: employees.empHalf._id,
        date: yesterday,
        status: ATTENDANCE_STATUS.HALF_DAY,
        checkInTime: new Date(yesterday.getTime() + 9 * 3600000),
        branchId: branches[1]._id,
      },
    ]);

    await LeaveRequest.insertMany([
      {
        employeeId: employees.emp1._id,
        leaveTypeId: leaveType._id,
        startDate: startOfToday,
        endDate: startOfToday,
        totalDays: 1,
        reason: 'Pending own leave',
        status: LEAVE_STATUS.PENDING,
      },
      {
        employeeId: employees.emp2._id,
        leaveTypeId: leaveType._id,
        startDate: startOfToday,
        endDate: startOfToday,
        totalDays: 1,
        reason: 'Approved today',
        status: LEAVE_STATUS.APPROVED,
      },
      {
        employeeId: employees.unrelated._id,
        leaveTypeId: leaveType._id,
        startDate: startOfToday,
        endDate: startOfToday,
        totalDays: 1,
        reason: 'Unrelated pending leave',
        status: LEAVE_STATUS.PENDING,
      },
    ]);

    await ExpenseClaim.create({
      employeeId: employees.emp1._id,
      category: 'Travel',
      title: 'Client Visit',
      amount: 2500,
      date: startOfToday,
      status: 'Pending',
    });

    await Grievance.create({
      employeeId: employees.emp1._id,
      ticketNumber: 'GRV-B-001',
      subject: 'AC Issue',
      category: 'Facility & Work Environment',
      description: 'Warm AC in Bay 2',
      status: 'Open',
    });

    await PayrollRun.insertMany([
      {
        month: 10,
        year: now.getFullYear(),
        status: PAYROLL_STATUS.PAID,
        totalNetSalary: 980000,
        processedBy: users.payroll._id,
      },
      {
        month: 11,
        year: now.getFullYear(),
        status: PAYROLL_STATUS.APPROVED,
        totalNetSalary: 1050000,
        processedBy: users.payroll._id,
      },
    ]);

    const job = await JobOpening.create({
      title: 'Platform Architect',
      departmentId: departments[0]._id,
      designationId: designationEng._id,
      branchId: branches[0]._id,
      description: 'Lead backend systems.',
      status: 'Open',
    });
    await Candidate.create({
      jobOpeningId: job._id,
      fullName: 'Kiran Bose',
      email: 'kiran.b@cand.com',
      status: 'Interviewing',
    });

    await Holiday.insertMany([
      {
        name: 'Republic Day',
        date: new Date(now.getTime() + 10 * 86400000),
        year: now.getFullYear(),
        branchId: null,
      },
      {
        name: 'Past Holiday',
        date: new Date(now.getTime() - 10 * 86400000),
        year: now.getFullYear(),
        branchId: null,
      },
    ]);

    // Branch + department scoped announcements (plus expired + inactive)
    await Announcement.insertMany([
      {
        title: 'Org-Wide Policy',
        message: 'Applies to everyone',
        publishedBy: users.hr._id,
        targetBranchId: null,
        targetDepartmentId: null,
        isPinned: true,
        isActive: true,
      },
      {
        title: 'BLR-HQ Engineering Notice',
        message: 'BLR Eng only',
        publishedBy: users.hr._id,
        targetBranchId: branches[0]._id,
        targetDepartmentId: departments[0]._id,
        isPinned: false,
        isActive: true,
      },
      {
        title: 'MUM Finance Only Notice',
        message: 'Mumbai Finance only',
        publishedBy: users.hr._id,
        targetBranchId: branches[1]._id,
        targetDepartmentId: departments[2]._id,
        isPinned: false,
        isActive: true,
      },
      {
        title: 'Expired Notice',
        message: 'Should stay hidden',
        publishedBy: users.hr._id,
        isActive: true,
        expiresAt: new Date(now.getTime() - 3600000),
      },
      {
        title: 'Inactive Notice',
        message: 'Draft notice',
        publishedBy: users.hr._id,
        isActive: false,
      },
    ]);

    await Document.create({
      employeeId: employees.emp1._id,
      title: 'Offer Letter',
      category: 'Offer Letter',
      fileName: 'offer.pdf',
      fileUrl: '/uploads/documents/offer.pdf',
      uploadedBy: users.hr._id,
    });

    await PerformanceReview.create({
      employeeId: employees.emp1._id,
      reviewerId: users.manager._id,
      reviewCycle: '2026-Q4',
      status: 'Self Review Pending',
    });

    const prog = await TrainingProgram.create({
      title: 'MongoDB Indexing Workshop',
      category: 'Technical',
      trainerName: 'Principal DBA',
      startDate: new Date(now.getTime() + 86400000),
      endDate: new Date(now.getTime() + 2 * 86400000),
    });
    await TrainingAssignment.create({
      programId: prog._id,
      employeeId: employees.emp1._id,
      status: 'Enrolled',
    });

    await AuditLog.create({
      actorId: users.admin._id,
      actorEmail: users.admin.email,
      actorRole: users.admin.role,
      action: 'EMPLOYEE_CREATED',
      entity: 'Employee',
      details: { secretToken: 'must-be-masked', note: 'Created test employee' },
    });

    tokens.admin = await login('admin.b@prvision.com', 'tab-a');
    tokens.hr = await login('hr.b@prvision.com', 'tab-h');
    tokens.payroll = await login('payroll.b@prvision.com', 'tab-p');
    tokens.recruiter = await login('recruiter.b@prvision.com', 'tab-r');
    tokens.manager = await login('manager.b@prvision.com', 'tab-m');
    tokens.soloManager = await login('solomgr.b@prvision.com', 'tab-sm');
    tokens.orphanManager = await login('orphanmgr.b@prvision.com', 'tab-om');
    tokens.emp = await login('aarav.b@prvision.com', 'tab-e');
  });

  describe('1. Dashboard API Parity, Isolation & Real-Time Freshness', () => {
    it('returns exact KPI, trend, department, birthday, payroll & audit parity for ADMIN & HR_MANAGER', async () => {
      const [adminRes, hrRes] = await Promise.all([
        api.get('/api/v1/dashboard/stats').set('Authorization', `Bearer ${tokens.admin}`),
        api.get('/api/v1/dashboard/stats').set('Authorization', `Bearer ${tokens.hr}`),
      ]);

      expect(adminRes.status).toBe(200);
      expect(hrRes.status).toBe(200);

      // Non-deleted seeded employees: manager, soloManager, hr, payroll, recruiter, emp1, emp2, empHalf, unrelated, resigned, relieved, terminated = 12
      // Inactive exited among non-deleted = 3 (resigned, relieved, terminated) => active = 9
      const kpi = adminRes.body.data.kpi;
      expect(kpi.totalEmployees).toBe(12);
      expect(kpi.resignedEmployees).toBe(3);
      expect(kpi.activeEmployees).toBe(9);
      expect(kpi.newJoiners).toBe(2); // hr (5d) + emp1 (10d)
      expect(kpi.presentToday).toBe(5); // manager (Present) + emp1 (Late) + emp2 (Present) + empHalf (Half-day) + recruiter (Half-day)
      expect(kpi.lateToday).toBe(1); // emp1
      expect(kpi.absentToday).toBe(1); // unrelated
      expect(kpi.onLeaveToday).toBe(1); // emp2 Approved
      expect(kpi.pendingLeaves).toBe(2); // emp1 + unrelated Pending
      expect(kpi.pendingExpenses).toBe(1);
      expect(kpi.pendingApprovals).toBe(3);
      expect(kpi.attendancePercentage).toBe(Math.round((5 / 9) * 100));
      expect(kpi.openJobCount).toBe(1);
      expect(kpi.activeCandidates).toBe(1);
      expect(kpi.latestPayroll).toEqual({
        month: 11,
        year: now.getFullYear(),
        totalNetSalary: 1050000,
        status: PAYROLL_STATUS.APPROVED,
      });

      // Department breakdown sums to total non-deleted employees (Engineering: 4, HR: 2 + emp2/manager/etc)
      const deptMap = Object.fromEntries(
        adminRes.body.data.departmentDistribution.map((d) => [d.name, d.count])
      );
      expect(deptMap).toEqual({
        Engineering: 6,
        Finance: 4,
        'Human Resources': 2,
      });

      // Attendance trends: HALF_DAY excluded from `present`, only PRESENT + LATE counted, grouped by UTC day string
      const todayUtcKey = startOfToday.toISOString().split('T')[0];
      const yestUtcKey = yesterday.toISOString().split('T')[0];
      const todayTrend = adminRes.body.data.attendanceTrends.find((t) => t._id === todayUtcKey);
      const yestTrend = adminRes.body.data.attendanceTrends.find((t) => t._id === yestUtcKey);
      expect(todayTrend).toEqual({ _id: todayUtcKey, present: 3, late: 1 }); // manager(P)+emp1(L)+emp2(P)
      expect(yestTrend).toEqual({ _id: yestUtcKey, present: 1, late: 0 }); // emp1(P) only; empHalf(HD) excluded

      // Upcoming holidays excludes past holidays
      expect(adminRes.body.data.upcomingHolidays.map((h) => h.name)).toEqual(['Republic Day']);

      // Upcoming birthdays populated with departmentId.name
      expect(adminRes.body.data.upcomingBirthdays.length).toBe(3);
      expect(adminRes.body.data.upcomingBirthdays[0].departmentId).toHaveProperty('name');

      // Audit logs sanitized cleanly for Admin/HR
      expect(adminRes.body.data.recentActivities.length).toBe(1);
      expect(adminRes.body.data.recentActivities[0].details).toBeTruthy();

      // HR matches Admin org KPIs
      expect(hrRes.body.data.kpi.totalEmployees).toBe(kpi.totalEmployees);
      expect(hrRes.body.data.kpi.latestPayroll).toEqual(kpi.latestPayroll);
    });

    it('enforces role data boundaries for PAYROLL_ADMIN, RECRUITER, MANAGER, and EMPLOYEE', async () => {
      const [payRes, recRes, mgrRes, soloMgrRes, empRes] = await Promise.all([
        api.get('/api/v1/dashboard/stats').set('Authorization', `Bearer ${tokens.payroll}`),
        api.get('/api/v1/dashboard/stats').set('Authorization', `Bearer ${tokens.recruiter}`),
        api.get('/api/v1/dashboard/stats').set('Authorization', `Bearer ${tokens.manager}`),
        api.get('/api/v1/dashboard/stats').set('Authorization', `Bearer ${tokens.soloManager}`),
        api.get('/api/v1/dashboard/stats').set('Authorization', `Bearer ${tokens.emp}`),
      ]);

      // Payroll Admin: sees payroll + attendance + resignedEmployees, omits audit/birthdays/jobs/candidates
      expect(payRes.body.data.kpi.latestPayroll.month).toBe(11);
      expect(payRes.body.data.kpi.resignedEmployees).toBe(3);
      expect(payRes.body.data.kpi.openJobCount).toBe(0);
      expect(payRes.body.data.kpi.activeCandidates).toBe(0);
      expect(payRes.body.data.kpi.pendingExpenses).toBe(0);
      expect(payRes.body.data.upcomingBirthdays).toEqual([]);
      expect(payRes.body.data.recentActivities).toEqual([]);
      expect(payRes.body.data.announcements.map((a) => a.title)).toContain('MUM Finance Only Notice');
      expect(payRes.body.data.announcements.map((a) => a.title)).not.toContain('BLR-HQ Engineering Notice');

      // Recruiter: sees jobs + candidates, omits attendanceTrends/payroll/birthdays/auditLogs
      expect(recRes.body.data.kpi.openJobCount).toBe(1);
      expect(recRes.body.data.kpi.activeCandidates).toBe(1);
      expect(recRes.body.data.kpi.resignedEmployees).toBe(0);
      expect(recRes.body.data.kpi.presentToday).toBe(0);
      expect(recRes.body.data.kpi.latestPayroll).toBeNull();
      expect(recRes.body.data.kpi.statusToday).toBe(ATTENDANCE_STATUS.HALF_DAY);
      expect(recRes.body.data.attendanceTrends).toEqual([]);
      expect(recRes.body.data.upcomingBirthdays).toEqual([]);
      expect(recRes.body.data.recentActivities).toEqual([]);

      // Manager: direct team = emp1, emp2, empHalf, resigned = 4 (deleted excluded!)
      // teamPresentToday = PRESENT + LATE among direct team = emp1 (Late) + emp2 (Present) = 2 (empHalf excluded)
      // teamPendingLeaves = emp1 pending leave = 1 (unrelated ignored!)
      expect(mgrRes.body.data.kpi.teamCount).toBe(4);
      expect(mgrRes.body.data.kpi.teamPresentToday).toBe(2);
      expect(mgrRes.body.data.kpi.teamPendingLeaves).toBe(1);
      expect(mgrRes.body.data.kpi.checkedIn).toBe(true);
      expect(mgrRes.body.data.kpi.statusToday).toBe(ATTENDANCE_STATUS.PRESENT);
      expect(mgrRes.body.data.announcements.map((a) => a.title)).toEqual([
        'Org-Wide Policy',
        'BLR-HQ Engineering Notice',
      ]);

      // Manager with zero direct reports
      expect(soloMgrRes.body.data.kpi.teamCount).toBe(0);
      expect(soloMgrRes.body.data.kpi.teamPresentToday).toBe(0);
      expect(soloMgrRes.body.data.kpi.teamPendingLeaves).toBe(0);

      // ESS Employee: monthlyPresentDays counts PRESENT + LATE in current month
      expect(empRes.body.data.kpi.checkedIn).toBe(true);
      expect(empRes.body.data.kpi.checkedOut).toBe(true);
      expect(empRes.body.data.kpi.statusToday).toBe(ATTENDANCE_STATUS.LATE);
      expect(empRes.body.data.kpi.pendingLeaves).toBe(1);
      const expectedMonthly = yesterday.getMonth() === startOfToday.getMonth() ? 2 : 1;
      expect(empRes.body.data.kpi.monthlyPresentDays).toBe(expectedMonthly);
      expect(empRes.body.data.announcements.map((a) => a.title)).toEqual([
        'Org-Wide Policy',
        'BLR-HQ Engineering Notice',
      ]);
    });

    it('never serves stale cached KPI metrics after real-time employee/leave mutations', async () => {
      const before = await api.get('/api/v1/dashboard/stats').set('Authorization', `Bearer ${tokens.admin}`);
      const prevTotal = before.body.data.kpi.totalEmployees;

      const tempEmp = await Employee.create({
        employeeId: 'PRV-9999',
        firstName: 'Fresh',
        lastName: 'Hire',
        email: 'fresh.hire@prvision.com',
        branchId: branches[0]._id,
        departmentId: departments[0]._id,
        designationId: designationEng._id,
        employmentStatus: LIFECYCLE_STAGES.CONFIRMED,
      });

      const afterCreate = await api.get('/api/v1/dashboard/stats').set('Authorization', `Bearer ${tokens.admin}`);
      expect(afterCreate.body.data.kpi.totalEmployees).toBe(prevTotal + 1);

      await Employee.deleteOne({ _id: tempEmp._id });

      const afterCleanup = await api.get('/api/v1/dashboard/stats').set('Authorization', `Bearer ${tokens.admin}`);
      expect(afterCleanup.body.data.kpi.totalEmployees).toBe(prevTotal);
    });
  });

  describe('2. Lightweight Employee Options API (GET /api/v1/employees/options)', () => {
    it('routes /options before /:id, excludes deleted & inactive staff by default, and strips PII/bank fields', async () => {
      const res = await api
        .get('/api/v1/employees/options?limit=100')
        .set('Authorization', `Bearer ${tokens.admin}`);

      expect(res.status).toBe(200);
      const rows = res.body.data.employees;
      // Non-deleted active: manager, soloManager, hr, payroll, recruiter, emp1, emp2, empHalf, unrelated = 9
      expect(rows.length).toBe(9);
      expect(res.body.data.pagination).toEqual({
        total: 9,
        page: 1,
        pages: 1,
        limit: 100,
      });

      const ids = rows.map((r) => r.employeeId);
      expect(ids).not.toContain('PRV-1010'); // Resigned
      expect(ids).not.toContain('PRV-1011'); // Relieved
      expect(ids).not.toContain('PRV-1012'); // Terminated
      expect(ids).not.toContain('PRV-1013'); // Soft-deleted

      // Verify strict minimal projection on every row
      for (const row of rows) {
        expect(Object.keys(row).sort()).toEqual(['_id', 'email', 'employeeId', 'firstName', 'lastName']);
        expect(row.bankDetails).toBeUndefined();
        expect(row.address).toBeUndefined();
        expect(row.phone).toBeUndefined();
        expect(row.emergencyContact).toBeUndefined();
        expect(row.previousEmployment).toBeUndefined();
        expect(row.departmentId).toBeUndefined();
      }

      // Alphabetical ordering check
      expect(rows[0].firstName).toBe('Aarav');
    });

    it('supports search, departmentId, branchId, includeInactive, status, and safe pagination limits', async () => {
      const searchRes = await api
        .get('/api/v1/employees/options?search=Rao')
        .set('Authorization', `Bearer ${tokens.hr}`);
      expect(searchRes.status).toBe(200);
      expect(searchRes.body.data.employees.map((e) => e.employeeId)).toEqual(['PRV-1006']);

      // Regex special characters must be escaped safely (no ReDoS / crash)
      const regexSafeRes = await api
        .get('/api/v1/employees/options?search=.*[invalid')
        .set('Authorization', `Bearer ${tokens.hr}`);
      expect(regexSafeRes.status).toBe(200);
      expect(regexSafeRes.body.data.employees).toEqual([]);

      // Department + Branch filter
      const deptRes = await api
        .get(`/api/v1/employees/options?departmentId=${departments[0]._id}&branchId=${branches[0]._id}`)
        .set('Authorization', `Bearer ${tokens.hr}`);
      expect(deptRes.status).toBe(200);
      expect(deptRes.body.data.employees.map((e) => e.employeeId)).toEqual(['PRV-1006', 'PRV-1007', 'PRV-1001']);

      // Invalid ObjectId rejected cleanly with 400
      const badDeptRes = await api
        .get('/api/v1/employees/options?departmentId=not-an-id')
        .set('Authorization', `Bearer ${tokens.hr}`);
      expect(badDeptRes.status).toBe(400);

      // includeInactive includes exited non-deleted employees while still excluding soft-deleted
      const incInactiveRes = await api
        .get('/api/v1/employees/options?includeInactive=true')
        .set('Authorization', `Bearer ${tokens.hr}`);
      expect(incInactiveRes.status).toBe(200);
      expect(incInactiveRes.body.data.pagination.total).toBe(12);
      expect(incInactiveRes.body.data.employees.map((e) => e.employeeId)).not.toContain('PRV-1013');

      // Explicit pagination page/limit + cap at 200
      const pageRes = await api
        .get('/api/v1/employees/options?page=2&limit=3')
        .set('Authorization', `Bearer ${tokens.admin}`);
      expect(pageRes.status).toBe(200);
      expect(pageRes.body.data.employees.length).toBe(3);
      expect(pageRes.body.data.pagination).toEqual({
        total: 9,
        page: 2,
        pages: 3,
        limit: 3,
      });

      const cappedRes = await api
        .get('/api/v1/employees/options?limit=999')
        .set('Authorization', `Bearer ${tokens.admin}`);
      expect(cappedRes.status).toBe(200);
      expect(cappedRes.body.data.pagination.limit).toBe(200);
    });

    it('enforces RBAC & ownership scope across ADMIN, PAYROLL_ADMIN, MANAGER, RECRUITER, and EMPLOYEE', async () => {
      const [payRes, mgrRes, orphanMgrRes, recRes, empRes] = await Promise.all([
        api.get('/api/v1/employees/options').set('Authorization', `Bearer ${tokens.payroll}`),
        api.get('/api/v1/employees/options').set('Authorization', `Bearer ${tokens.manager}`),
        api.get('/api/v1/employees/options').set('Authorization', `Bearer ${tokens.orphanManager}`),
        api.get('/api/v1/employees/options').set('Authorization', `Bearer ${tokens.recruiter}`),
        api.get('/api/v1/employees/options').set('Authorization', `Bearer ${tokens.emp}`),
      ]);

      expect(payRes.status).toBe(200);
      expect(payRes.body.data.employees.length).toBe(9);

      // Manager strictly sees active direct reports ONLY (emp1, emp2, empHalf; excludes resigned/deleted/unrelated)
      expect(mgrRes.status).toBe(200);
      expect(mgrRes.body.data.employees.map((e) => e.employeeId)).toEqual(['PRV-1006', 'PRV-1007', 'PRV-1008']);

      // Manager without employee profile -> 403
      expect(orphanMgrRes.status).toBe(403);

      // Recruiter & Employee blocked -> 403
      expect(recRes.status).toBe(403);
      expect(empRes.status).toBe(403);
    });

    it('keeps existing GET /api/v1/employees populated directory 100% backward compatible', async () => {
      const dirRes = await api
        .get('/api/v1/employees?limit=20')
        .set('Authorization', `Bearer ${tokens.admin}`);

      expect(dirRes.status).toBe(200);
      expect(dirRes.body.data.employees.length).toBe(12);
      const sample = dirRes.body.data.employees[0];
      expect(sample.departmentId).toHaveProperty('name');
      expect(sample.designationId).toHaveProperty('title');
      expect(sample.branchId).toHaveProperty('name');
      expect(sample.bankDetails).toBeUndefined();
    });
  });

  describe('3. Index Synchronization Safety & Explain Plan Verification', () => {
    it('keeps SYNC_INDEXES disabled by default and verifies IXSCAN with zero COLLSCAN/in-mem SORT', async () => {
      expect(env.SYNC_INDEXES).toBe(false);
      await mongoose.syncIndexes();

      const explainTargets = [
        ['payrollruns', PayrollRun.find().sort({ year: -1, month: -1 }).limit(20)],
        ['jobopenings', JobOpening.find({ status: 'Open' }).sort({ createdAt: -1 }).limit(20)],
        ['candidates-status', Candidate.find({ status: 'Interviewing' }).sort({ appliedDate: -1 }).limit(20)],
        ['candidates-job', Candidate.find({ jobOpeningId: new mongoose.Types.ObjectId() }).sort({ appliedDate: -1 }).limit(20)],
        ['announcements', Announcement.find({ isActive: true }).sort({ isPinned: -1, createdAt: -1 }).limit(4)],
        ['documents', Document.find({ employeeId: employees.emp1._id }).sort({ createdAt: -1 }).limit(20)],
        ['designations', Designation.find({ isDeleted: false }).sort({ level: 1, title: 1 }).limit(20)],
        ['branches', Branch.find({ isDeleted: false }).sort({ isHeadquarters: -1, name: 1 }).limit(20)],
        ['performancereviews', PerformanceReview.find().sort({ createdAt: -1 }).limit(20)],
        ['trainingprograms', TrainingProgram.find().sort({ startDate: 1 }).limit(20)],
        ['trainingassignments', TrainingAssignment.find({ employeeId: employees.emp1._id }).sort({ createdAt: -1 }).limit(20)],
        ['expenseclaims', ExpenseClaim.find().sort({ createdAt: -1 }).limit(20)],
        ['grievances', Grievance.find().sort({ createdAt: -1 }).limit(20)],
        ['shifts', Shift.find({ isActive: true }).sort({ createdAt: -1 }).limit(20)],
        [
          'employees-dept',
          Employee.find({ isDeleted: false, departmentId: departments[0]._id }).sort({ createdAt: -1 }).limit(20),
        ],
        [
          'employees-options',
          Employee.find({ isDeleted: false }).sort({ firstName: 1, lastName: 1, employeeId: 1 }).limit(50),
        ],
      ];

      for (const [tag, query] of explainTargets) {
        const explained = await query.explain('executionStats');
        const stages = collectStages(explained.queryPlanner?.winningPlan);
        expect(stages, `${tag} must use IXSCAN`).toContain('IXSCAN');
        expect(stages, `${tag} must avoid COLLSCAN`).not.toContain('COLLSCAN');
        expect(stages, `${tag} must avoid in-memory SORT`).not.toContain('SORT');
      }
    });

    it('verifies reversible index migration dry-run, rollback (down), and reapply (up)', async () => {
      const db = mongoose.connection.db;

      const dryUp = await applyBatchBIndexes(db, { dryRun: true });
      expect(dryUp.length).toBe(BATCH_B_INDEX_PLAN.length);

      const downResult = await rollbackBatchBIndexes(db, { dryRun: false });
      const droppedCount = downResult.filter((r) => r.action === 'dropped').length;
      expect(droppedCount).toBe(BATCH_B_INDEX_PLAN.length);

      // Unique pre-existing indexes must remain untouched after Batch B rollback
      const prIndexes = await db.collection('payrollruns').indexes();
      expect(prIndexes.some((idx) => idx.name === 'month_1_year_1' && idx.unique === true)).toBe(true);
      expect(prIndexes.some((idx) => idx.name === '_id_')).toBe(true);

      const upResult = await applyBatchBIndexes(db, { dryRun: false });
      const createdCount = upResult.filter((r) => r.action === 'created').length;
      expect(createdCount).toBe(BATCH_B_INDEX_PLAN.length);
    });
  });
});
