import { describe, it, expect, beforeAll } from 'vitest';
import './setup.js';
import { api } from './setup.js';
import { ATTENDANCE_STATUS, LEAVE_STATUS, LIFECYCLE_STAGES, PAYROLL_STATUS, ROLES } from '../src/config/constants.js';

import CompanySettings from '../src/models/CompanySettings.js';
import Branch from '../src/models/Branch.js';
import Department from '../src/models/Department.js';
import Designation from '../src/models/Designation.js';
import Shift from '../src/models/Shift.js';
import Holiday from '../src/models/Holiday.js';
import Employee from '../src/models/Employee.js';
import User from '../src/models/User.js';
import Attendance from '../src/models/Attendance.js';
import LeaveType from '../src/models/LeaveType.js';
import LeaveBalance from '../src/models/LeaveBalance.js';
import LeaveRequest from '../src/models/LeaveRequest.js';
import PayrollRun from '../src/models/PayrollRun.js';
import Payslip from '../src/models/Payslip.js';
import SalaryStructure from '../src/models/SalaryStructure.js';
import PayrollAdjustment from '../src/models/PayrollAdjustment.js';
import AuditLog from '../src/models/AuditLog.js';

const localNoon = (year, month, day, hour = 12, minute = 0) =>
  new Date(year, month - 1, day, hour, minute, 0, 0);

describe('Phase 6.1 — Approved Leave Cancellation Authorization, Atomicity & Payroll Adjustment Workflow', () => {
  const tokens = {};
  const emps = {};
  let clType;
  let lwpType;

  const loginTab = async (email, tabId) => {
    const res = await api
      .post('/api/v1/auth/login')
      .set('X-Tab-Id', tabId)
      .send({ email, password: 'Password@123' });
    expect(res.status).toBe(200);
    return res.body.data.tokens.accessToken;
  };

  const authReq = (method, url, token, tabId = 'tab-p61') =>
    api[method](url).set('Authorization', `Bearer ${token}`).set('X-Tab-Id', tabId);

  beforeAll(async () => {
    await CompanySettings.create({
      companyName: 'PR VISION INNOVATIONS',
      contactEmail: 'contact@prvision.com',
      settings: { workingDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'], standardWorkHoursPerDay: 8 },
    });

    const branch = await Branch.create({
      name: 'Bengaluru HQ',
      code: 'HQ-61',
      isHeadquarters: true,
      address: { city: 'Bengaluru', state: 'Karnataka', country: 'India' },
    });
    const dept = await Department.create({ name: 'Engineering', code: 'ENG-61' });
    const desig = await Designation.create({ title: 'Engineer', departmentId: dept._id, code: 'ENG', level: 2 });
    const shift = await Shift.create({
      name: 'General 5-Day',
      code: 'GEN5',
      startTime: '09:00',
      endTime: '18:00',
      weeklyOffDays: [0, 6],
      isDefault: true,
    });

    clType = await LeaveType.create({ name: 'Casual Leave', code: 'CL', defaultDaysPerYear: 12, isPaid: true });
    lwpType = await LeaveType.create({ name: 'Leave Without Pay', code: 'LWP', defaultDaysPerYear: 15, isPaid: false });

    const createRoleUser = async ({ code, firstName, lastName, email, role, managerId = null }) => {
      const emp = await Employee.create({
        employeeId: code,
        firstName,
        lastName,
        email,
        departmentId: dept._id,
        designationId: desig._id,
        branchId: branch._id,
        shiftId: shift._id,
        managerId,
        joiningDate: localNoon(2025, 1, 1),
        employmentStatus: LIFECYCLE_STAGES.CONFIRMED,
      });
      const user = await User.create({
        name: `${firstName} ${lastName}`,
        email,
        password: 'Password@123',
        role,
        employeeId: emp._id,
        branchId: branch._id,
        isActive: true,
      });
      emp.userId = user._id;
      await emp.save();
      return { emp: emp.toObject(), token: await loginTab(email, `tab-${code}`) };
    };

    const admin = await createRoleUser({ code: 'E61-01', firstName: 'Admin', lastName: 'One', email: 'admin61@prvision.test', role: ROLES.ADMIN });
    const hr = await createRoleUser({ code: 'E61-02', firstName: 'Meera', lastName: 'HR', email: 'hr61@prvision.test', role: ROLES.HR_MANAGER });
    const mgr = await createRoleUser({ code: 'E61-03', firstName: 'Vikram', lastName: 'Mgr', email: 'mgr61@prvision.test', role: ROLES.MANAGER });
    const emp1 = await createRoleUser({ code: 'E61-04', firstName: 'Amit', lastName: 'Emp', email: 'emp61@prvision.test', role: ROLES.EMPLOYEE, managerId: mgr.emp._id });
    const emp2 = await createRoleUser({ code: 'E61-05', firstName: 'Priya', lastName: 'Peer', email: 'peer61@prvision.test', role: ROLES.EMPLOYEE, managerId: mgr.emp._id });
    const payroll = await createRoleUser({ code: 'E61-06', firstName: 'Arjun', lastName: 'Pay', email: 'pay61@prvision.test', role: ROLES.PAYROLL_ADMIN });
    const recruiter = await createRoleUser({ code: 'E61-07', firstName: 'Sonal', lastName: 'Rec', email: 'rec61@prvision.test', role: ROLES.RECRUITER });

    tokens.ADMIN = admin.token; emps.ADMIN = admin.emp;
    tokens.HR_MANAGER = hr.token; emps.HR_MANAGER = hr.emp;
    tokens.MANAGER = mgr.token; emps.MANAGER = mgr.emp;
    tokens.EMPLOYEE = emp1.token; emps.EMPLOYEE = emp1.emp;
    tokens.PEER = emp2.token; emps.PEER = emp2.emp;
    tokens.PAYROLL_ADMIN = payroll.token; emps.PAYROLL_ADMIN = payroll.emp;
    tokens.RECRUITER = recruiter.token; emps.RECRUITER = recruiter.emp;
  });

  it('allows HR to cancel both Pending and Approved leaves, enforces mandatory reason for Approved, blocks unauthorized roles/owners (403), and writes AuditLogs', async () => {
    // 1. HR cancels a Pending leave without mandatory reason & restores pending balance
    const pApply = await authReq('post', '/api/v1/leaves/apply', tokens.EMPLOYEE).send({
      leaveTypeId: clType._id,
      startDate: localNoon(2028, 4, 3).toISOString(),
      endDate: localNoon(2028, 4, 4).toISOString(),
      totalDays: 2,
      reason: 'Pending holiday request',
    });
    expect(pApply.status).toBe(201);
    const pendingId = pApply.body.data.leaveRequest._id;

    // Peer employee cannot cancel Amit's Pending request (403)
    expect((await authReq('post', `/api/v1/leaves/requests/${pendingId}/cancel`, tokens.PEER)).status).toBe(403);

    // HR cancels Pending leave cleanly
    const hrCancelPending = await authReq('post', `/api/v1/leaves/requests/${pendingId}/cancel`, tokens.HR_MANAGER).send({
      cancellationReason: 'Replaced by comp-off',
    });
    expect(hrCancelPending.status).toBe(200);
    expect(hrCancelPending.body.data.leaveRequest.status).toBe(LEAVE_STATUS.CANCELLED);

    const balAfterPendingCancel = await LeaveBalance.findOne({ employeeId: emps.EMPLOYEE._id, year: 2028 }).lean();
    const clPendingItem = balAfterPendingCancel.balances.find((b) => String(b.leaveTypeId) === String(clType._id));
    expect(clPendingItem).toMatchObject({ allocated: 12, used: 0, pending: 0, remaining: 12 });

    // 2. Apply and Approve a 2-day leave (2028-04-10..11 Mon-Tue future dates)
    const appRes = await authReq('post', '/api/v1/leaves/apply', tokens.EMPLOYEE).send({
      leaveTypeId: clType._id,
      startDate: localNoon(2028, 4, 10).toISOString(),
      endDate: localNoon(2028, 4, 11).toISOString(),
      totalDays: 2,
      reason: 'Annual family travel',
    });
    expect(appRes.status).toBe(201);
    const approvedId = appRes.body.data.leaveRequest._id;

    expect(
      (await authReq('patch', `/api/v1/leaves/requests/${approvedId}/review`, tokens.MANAGER).send({ status: LEAVE_STATUS.APPROVED })).status
    ).toBe(200);

    // Non-HR roles blocked from cancelling Approved leave (including applicant EMPLOYEE & team MANAGER)
    for (const [roleName, tk] of [
      ['EMPLOYEE', tokens.EMPLOYEE],
      ['PEER', tokens.PEER],
      ['MANAGER', tokens.MANAGER],
      ['PAYROLL_ADMIN', tokens.PAYROLL_ADMIN],
      ['RECRUITER', tokens.RECRUITER],
    ]) {
      const denyRes = await authReq('post', `/api/v1/leaves/requests/${approvedId}/cancel`, tk).send({
        cancellationReason: `Unauthorized attempt by ${roleName}`,
      });
      expect(denyRes.status, `Role ${roleName} should receive 403`).toBe(403);
    }

    // Approved cancellation requires mandatory reason (>= 3 chars)
    expect((await authReq('post', `/api/v1/leaves/requests/${approvedId}/cancel`, tokens.HR_MANAGER).send({})).status).toBe(400);
    expect((await authReq('post', `/api/v1/leaves/requests/${approvedId}/cancel`, tokens.HR_MANAGER).send({ cancellationReason: '  x ' })).status).toBe(400);

    // Valid HR Approved cancellation succeeds, restores balance, removes future On Leave docs, logs AuditLog
    const hrCancelApproved = await authReq('post', `/api/v1/leaves/requests/${approvedId}/cancel`, tokens.HR_MANAGER).send({
      cancellationReason: 'Employee withdrew vacation due to project launch',
    });
    expect(hrCancelApproved.status).toBe(200);
    expect(hrCancelApproved.body.data.leaveRequest.status).toBe(LEAVE_STATUS.CANCELLED);
    expect(hrCancelApproved.body.data.leaveRequest.cancellationReason).toBe('Employee withdrew vacation due to project launch');
    expect(hrCancelApproved.body.data.balanceRestored).toMatchObject({ allocated: 12, used: 0, pending: 0, remaining: 12 });

    // Future On Leave placeholders deleted so future dates are not misclassified as Absent
    const futureAtt = await Attendance.find({
      employeeId: emps.EMPLOYEE._id,
      date: { $gte: localNoon(2028, 4, 10, 0, 0), $lte: localNoon(2028, 4, 11, 23, 59) },
    }).lean();
    expect(futureAtt).toHaveLength(0);

    // Duplicate sequential cancellation blocked (400) and balance never over-restored
    const dupCancel = await authReq('post', `/api/v1/leaves/requests/${approvedId}/cancel`, tokens.ADMIN).send({
      cancellationReason: 'Retry cancel',
    });
    expect(dupCancel.status).toBe(400);
    const balFinal = await LeaveBalance.findOne({ employeeId: emps.EMPLOYEE._id, year: 2028 }).lean();
    const clFinal = balFinal.balances.find((b) => String(b.leaveTypeId) === String(clType._id));
    expect(clFinal).toMatchObject({ allocated: 12, used: 0, pending: 0, remaining: 12 });

    // Verify complete AuditLog fields
    const audit = await AuditLog.findOne({
      entity: 'LeaveRequest',
      entityId: approvedId,
      action: 'LEAVE_CANCELLED',
    }).lean();
    expect(audit).toBeTruthy();
    expect(audit.actorRole).toBe(ROLES.HR_MANAGER);
    expect(audit.actorEmail).toBe('hr61@prvision.test');
    expect(audit.details.previousStatus).toBe(LEAVE_STATUS.APPROVED);
    expect(audit.details.newStatus).toBe(LEAVE_STATUS.CANCELLED);
    expect(audit.details.cancellationReason).toBe('Employee withdrew vacation due to project launch');
    expect(audit.details.cancelledAt).toBeTruthy();
  });

  it('prevents concurrent duplicate cancellation and double balance restoration via atomic Compare-And-Set', async () => {
    const applyRes = await authReq('post', '/api/v1/leaves/apply', tokens.EMPLOYEE).send({
      leaveTypeId: clType._id,
      startDate: localNoon(2028, 5, 8).toISOString(),
      endDate: localNoon(2028, 5, 10).toISOString(),
      totalDays: 3,
      reason: 'Race condition test',
    });
    expect(applyRes.status).toBe(201);
    const reqId = applyRes.body.data.leaveRequest._id;

    expect(
      (await authReq('patch', `/api/v1/leaves/requests/${reqId}/review`, tokens.MANAGER).send({ status: LEAVE_STATUS.APPROVED })).status
    ).toBe(200);

    // Launch HR and Admin cancel concurrently against the same Approved request
    const [resA, resB] = await Promise.all([
      authReq('post', `/api/v1/leaves/requests/${reqId}/cancel`, tokens.HR_MANAGER).send({
        cancellationReason: 'Concurrent cancel attempt A',
      }),
      authReq('post', `/api/v1/leaves/requests/${reqId}/cancel`, tokens.ADMIN).send({
        cancellationReason: 'Concurrent cancel attempt B',
      }),
    ]);

    const statuses = [resA.status, resB.status].sort();
    expect(statuses).toEqual([200, 400]);

    // Verify balance used returned strictly to 0 once (remaining = 12)
    const bal = await LeaveBalance.findOne({ employeeId: emps.EMPLOYEE._id, year: 2028 }).lean();
    const cl = bal.balances.find((b) => String(b.leaveTypeId) === String(clType._id));
    expect(cl).toMatchObject({ allocated: 12, used: 0, pending: 0, remaining: 12 });
  });

  it('reverts past On Leave attendance appropriately (Absent if unpunched, Present if checked-in, removes off-days/holidays) and updates unlocked payroll', async () => {
    // Past month (Feb 2026) Mon-Fri week: 2026-02-02 (Mon) .. 2026-02-08 (Sun) -> 5 weekdays + 2 weekend off days
    // Put a non-optional company Holiday on Wed 2026-02-04 -> 4 scheduled working days
    await Holiday.create({
      name: 'Midweek Off-Day',
      date: localNoon(2026, 2, 4),
      year: 2026,
      isOptional: false,
    });

    // Save SalaryStructure ONLY for emps.PEER so Feb/March 2026 runs stay isolated cleanly to emps.PEER
    await authReq('post', '/api/v1/payroll/structures', tokens.PAYROLL_ADMIN).send({
      employeeId: emps.PEER._id,
      basicSalary: 19000, // Feb 2026 has 19 working days (20 weekdays - 1 holiday Feb 4) => 1000/day
      hra: 0,
      specialAllowance: 0,
      statutoryConfig: { pfEnabled: false, esiEnabled: false, professionalTax: 0, tdsDeduction: 0 },
    });

    // Apply & approve Paid Leave across Feb 2..Feb 8 (4 working days across Mon-Tue, Thu-Fri + Wed holiday + Sat/Sun)
    const lvRes = await authReq('post', '/api/v1/leaves/apply', tokens.PEER).send({
      leaveTypeId: clType._id,
      startDate: localNoon(2026, 2, 2).toISOString(),
      endDate: localNoon(2026, 2, 8).toISOString(),
      totalDays: 4,
      reason: 'Past month leave spanning weekend & holiday',
    });
    expect(lvRes.status).toBe(201);
    const lvId = lvRes.body.data.leaveRequest._id;

    expect(
      (await authReq('patch', `/api/v1/leaves/requests/${lvId}/review`, tokens.HR_MANAGER).send({ status: LEAVE_STATUS.APPROVED })).status
    ).toBe(200);

    // Employee actually punched in cleanly on Feb 2 (Attendance still had On Leave from before or updated checkInTime)
    await Attendance.findOneAndUpdate(
      { employeeId: emps.PEER._id, date: { $gte: localNoon(2026, 2, 2, 0, 0), $lte: localNoon(2026, 2, 2, 23, 59) } },
      { $set: { checkInTime: localNoon(2026, 2, 2, 9, 0), checkOutTime: localNoon(2026, 2, 2, 18, 0), totalHours: 9 } }
    );

    // HR cancels Approved leave (Feb 2026 payroll is NOT yet paid/locked)
    const cancelPast = await authReq('post', `/api/v1/leaves/requests/${lvId}/cancel`, tokens.HR_MANAGER).send({
      cancellationReason: 'Restoring leave after project revisit; Feb 2 was worked, Feb 3/5/6 unworked',
    });
    expect(cancelPast.status).toBe(200);
    expect(cancelPast.body.data.attendanceSync).toMatchObject({
      revertedToPresent: 1,     // Feb 2 had checkInTime -> Present
      revertedToAbsent: 3,      // Feb 3, 5, 6 unpunched workdays -> Absent
      removedFutureOrOff: 3,    // Feb 4 (holiday) + Feb 7 (Sat) + Feb 8 (Sun) removed
    });
    expect(cancelPast.body.data.payrollImpact.hasLockedPayroll).toBe(false);

    // Verify Attendance states in DB
    const checkDay = async (d) =>
      Attendance.findOne({
        employeeId: emps.PEER._id,
        date: { $gte: localNoon(2026, 2, d, 0, 0), $lte: localNoon(2026, 2, d, 23, 59) },
      }).lean();

    expect((await checkDay(2)).status).toBe(ATTENDANCE_STATUS.PRESENT);
    expect((await checkDay(3)).status).toBe(ATTENDANCE_STATUS.ABSENT);
    expect(await checkDay(4)).toBeNull(); // holiday removed
    expect(await checkDay(7)).toBeNull(); // Saturday removed

    // Verify unlocked Feb 2026 payroll now counts those 3 reverted Absent days as 3 LOP days (16/19 * 19000 = 16000)
    const febRun = await authReq('post', '/api/v1/payroll/runs/generate', tokens.PAYROLL_ADMIN).send({ month: 2, year: 2026 });
    expect(febRun.status).toBe(200);
    const febSlip = await Payslip.findOne({ employeeId: emps.PEER._id, month: 2, year: 2026 }).lean();
    expect(febSlip).toMatchObject({ workingDays: 19, presentDays: 16, lopDays: 3, netSalary: 16000 });
  });

  it('keeps Paid/Locked historical payroll 100% immutable, queues safe PayrollAdjustment on approved leave cancellation, and settles it in the next payroll run', async () => {
    // Ensure clean active SalaryStructure for emps.EMPLOYEE for Jan 2026 & March 2026 (22 working days in March 2026: Mar 1 Sun .. Mar 31 Tue -> 9 weekend days = 22 workdays)
    await SalaryStructure.updateMany({}, { isActive: false });
    await authReq('post', '/api/v1/payroll/structures', tokens.PAYROLL_ADMIN).send({
      employeeId: emps.EMPLOYEE._id,
      basicSalary: 22000, // March 2026 (22 workdays) => 1000/day
      hra: 0,
      specialAllowance: 0,
      statutoryConfig: { pfEnabled: false, esiEnabled: false, professionalTax: 0, tdsDeduction: 0 },
    });

    // Scenario A: Employee has 2-day Approved Paid Leave (Mar 9-10 Mon-Tue) & 2-day Approved LWP Leave (Mar 23-24 Mon-Tue)
    const clApply = await authReq('post', '/api/v1/leaves/apply', tokens.EMPLOYEE).send({
      leaveTypeId: clType._id,
      startDate: localNoon(2026, 3, 9).toISOString(),
      endDate: localNoon(2026, 3, 10).toISOString(),
      totalDays: 2,
      reason: 'Locked month paid leave test',
    });
    const lwpApply = await authReq('post', '/api/v1/leaves/apply', tokens.EMPLOYEE).send({
      leaveTypeId: lwpType._id,
      startDate: localNoon(2026, 3, 23).toISOString(),
      endDate: localNoon(2026, 3, 24).toISOString(),
      totalDays: 2,
      reason: 'Locked month unpaid leave test',
    });
    expect(clApply.status).toBe(201);
    expect(lwpApply.status).toBe(201);

    const clId = clApply.body.data.leaveRequest._id;
    const lwpId = lwpApply.body.data.leaveRequest._id;

    expect((await authReq('patch', `/api/v1/leaves/requests/${clId}/review`, tokens.MANAGER).send({ status: LEAVE_STATUS.APPROVED })).status).toBe(200);
    expect((await authReq('patch', `/api/v1/leaves/requests/${lwpId}/review`, tokens.MANAGER).send({ status: LEAVE_STATUS.APPROVED })).status).toBe(200);

    // Run & LOCK March 2026 payroll (22 workdays, 2 LWP LOP => 20 present, netSalary = 20000)
    const marGen = await authReq('post', '/api/v1/payroll/runs/generate', tokens.PAYROLL_ADMIN).send({ month: 3, year: 2026 });
    expect(marGen.status).toBe(200);
    const marRunId = marGen.body.data.run._id;
    expect((await authReq('patch', `/api/v1/payroll/runs/${marRunId}/pay`, tokens.PAYROLL_ADMIN)).status).toBe(200);

    const marRunSnapshot = await PayrollRun.findById(marRunId).lean();
    const marSlipSnapshot = await Payslip.findOne({ employeeId: emps.EMPLOYEE._id, month: 3, year: 2026 }).lean();
    expect(marSlipSnapshot).toMatchObject({ workingDays: 22, presentDays: 20, lopDays: 2, netSalary: 20000, paymentStatus: 'Paid' });

    // 1. HR cancels the Paid Leave (Mar 9-10) AFTER payroll lock -> historical Mar payroll untouched, Pending DEDUCTION (2 days * 1000 = 2000) queued
    const cancelLockedCl = await authReq('post', `/api/v1/leaves/requests/${clId}/cancel`, tokens.HR_MANAGER).send({
      cancellationReason: 'Retroactive leave revocation post payroll close',
    });
    expect(cancelLockedCl.status).toBe(200);
    expect(cancelLockedCl.body.data.payrollImpact.hasLockedPayroll).toBe(true);
    expect(cancelLockedCl.body.data.payrollImpact.historicalPayrollModified).toBe(false);
    expect(cancelLockedCl.body.data.payrollImpact.adjustments).toHaveLength(1);
    expect(cancelLockedCl.body.data.payrollImpact.adjustments[0]).toMatchObject({
      adjustmentType: 'DEDUCTION',
      days: 2,
      amount: 2000,
      status: 'Pending',
      sourceMonth: 3,
      sourceYear: 2026,
    });

    // 2. HR cancels the LWP Unpaid Leave (Mar 23-24) AFTER payroll lock -> Pending CREDIT (2 days * 1000 = 2000) queued
    const cancelLockedLwp = await authReq('post', `/api/v1/leaves/requests/${lwpId}/cancel`, tokens.HR_MANAGER).send({
      cancellationReason: 'LWP reversed to regular pay',
    });
    expect(cancelLockedLwp.status).toBe(200);
    expect(cancelLockedLwp.body.data.payrollImpact.adjustments[0]).toMatchObject({
      adjustmentType: 'CREDIT',
      days: 2,
      amount: 2000,
      status: 'Pending',
      sourceMonth: 3,
      sourceYear: 2026,
    });

    // Confirm historical March 2026 PayrollRun and Payslip are 100% unchanged byte-for-byte
    const marRunAfter = await PayrollRun.findById(marRunId).lean();
    const marSlipAfter = await Payslip.findOne({ employeeId: emps.EMPLOYEE._id, month: 3, year: 2026 }).lean();
    expect(marRunAfter.totalGrossSalary).toBe(marRunSnapshot.totalGrossSalary);
    expect(marRunAfter.totalNetSalary).toBe(marRunSnapshot.totalNetSalary);
    expect(marRunAfter.isLocked).toBe(true);
    expect(marSlipAfter.grossSalary).toBe(marSlipSnapshot.grossSalary);
    expect(marSlipAfter.netSalary).toBe(marSlipSnapshot.netSalary);
    expect(marSlipAfter.lopDays).toBe(2);

    // RBAC on adjustment endpoints: Peer cannot view Amit's adjustments (403); Employee cannot approve own adjustment (403)
    const creditAdjId = cancelLockedLwp.body.data.payrollImpact.adjustments[0]._id;
    const dedAdjId = cancelLockedCl.body.data.payrollImpact.adjustments[0]._id;

    expect((await authReq('get', `/api/v1/payroll/adjustments?employeeId=${emps.EMPLOYEE._id}`, tokens.PEER)).status).toBe(403);
    expect((await authReq('patch', `/api/v1/payroll/adjustments/${creditAdjId}`, tokens.EMPLOYEE).send({ status: 'Approved' })).status).toBe(403);

    // Payroll Admin approves the CREDIT (for April 2026 run) and waives the DEDUCTION (or let's test both: approve CREDIT + approve DEDUCTION? Wait — let's test CREDIT applied and DEDUCTION waived cleanly!)
    const apprCredit = await authReq('patch', `/api/v1/payroll/adjustments/${creditAdjId}`, tokens.PAYROLL_ADMIN).send({
      status: 'Approved',
      targetMonth: 4,
      targetYear: 2026,
      reviewNotes: 'Approved arrears credit for April disbursement',
    });
    expect(apprCredit.status).toBe(200);
    expect(apprCredit.body.data.adjustment.status).toBe('Approved');

    const waiveDed = await authReq('patch', `/api/v1/payroll/adjustments/${dedAdjId}`, tokens.HR_MANAGER).send({
      status: 'Waived',
      reviewNotes: 'Employee regularized attendance offline',
    });
    expect(waiveDed.status).toBe(200);
    expect(waiveDed.body.data.adjustment.status).toBe('Waived');

    // Run April 2026 payroll -> base 22000 + approved CREDIT 2000 = 24000 gross & net; Waived deduction NOT charged
    const aprRun = await authReq('post', '/api/v1/payroll/runs/generate', tokens.PAYROLL_ADMIN).send({ month: 4, year: 2026 });
    expect(aprRun.status).toBe(200);

    const aprSlip = await Payslip.findOne({ employeeId: emps.EMPLOYEE._id, month: 4, year: 2026 }).lean();
    expect(aprSlip.grossSalary).toBe(24000);
    expect(aprSlip.totalDeductions).toBe(0);
    expect(aprSlip.netSalary).toBe(24000);
    expect(aprSlip.earnings.some((e) => e.name.includes('Leave Adjustment Credit (3/2026)') && e.amount === 2000)).toBe(true);

    // Settled adjustment is now Applied and cannot be re-reviewed or applied twice in May 2026
    const settledAdj = await PayrollAdjustment.findById(creditAdjId).lean();
    expect(settledAdj.status).toBe('Applied');
    expect(String(settledAdj.appliedPayrollRunId)).toBe(String(aprRun.body.data.run._id));
    expect((await authReq('patch', `/api/v1/payroll/adjustments/${creditAdjId}`, tokens.PAYROLL_ADMIN).send({ status: 'Waived' })).status).toBe(400);

    const mayRun = await authReq('post', '/api/v1/payroll/runs/generate', tokens.PAYROLL_ADMIN).send({ month: 5, year: 2026 });
    expect(mayRun.status).toBe(200);
    const maySlip = await Payslip.findOne({ employeeId: emps.EMPLOYEE._id, month: 5, year: 2026 }).lean();
    expect(maySlip.netSalary).toBe(22000); // Normal pay, not double-credited
  });
});
