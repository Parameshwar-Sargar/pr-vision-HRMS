import mongoose from 'mongoose';
import { z } from 'zod';
import LeaveRequest from '../../models/LeaveRequest.js';
import LeaveType from '../../models/LeaveType.js';
import LeaveBalance from '../../models/LeaveBalance.js';
import Employee from '../../models/Employee.js';
import Attendance from '../../models/Attendance.js';
import Shift from '../../models/Shift.js';
import Holiday from '../../models/Holiday.js';
import PayrollRun from '../../models/PayrollRun.js';
import Payslip from '../../models/Payslip.js';
import SalaryStructure from '../../models/SalaryStructure.js';
import PayrollAdjustment from '../../models/PayrollAdjustment.js';
import { ATTENDANCE_STATUS, LEAVE_STATUS, PAYROLL_STATUS, ROLES } from '../../config/constants.js';
import { sendSuccess, sendError, parsePagination, buildPaginationMeta } from '../../utils/responseUtils.js';
import { isAdminOrHR, isValidObjectId } from '../../utils/securityUtils.js';
import { logAudit } from '../../middleware/auditMiddleware.js';

const leaveApplySchema = z.object({
  leaveTypeId: z.string().min(1, 'Leave type is required'),
  startDate: z.string().min(1, 'Start date is required'),
  endDate: z.string().min(1, 'End date is required'),
  totalDays: z.coerce.number().min(0.5, 'Total days must be at least 0.5'),
  reason: z.string().trim().min(3, 'Reason must be at least 3 characters'),
});

const recalculateBalanceItem = (item) => {
  item.remaining = Math.max(
    0,
    Math.round(((item.allocated || 0) - (item.used || 0) - (item.pending || 0)) * 10) / 10
  );
};

const toLocalDateKey = (date) => {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const syncApprovedLeaveToAttendance = async ({ employeeId, branchId, startDate, endDate }) => {
  const cursor = new Date(startDate);
  cursor.setHours(0, 0, 0, 0);
  const lastDay = new Date(endDate);
  lastDay.setHours(0, 0, 0, 0);

  let guardDays = 0;
  while (cursor <= lastDay && guardDays < 62) {
    const dayStart = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate(), 0, 0, 0);
    const dayEnd = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate(), 23, 59, 59);

    const existing = await Attendance.findOne({
      employeeId,
      date: { $gte: dayStart, $lte: dayEnd },
    });

    if (!existing) {
      await Attendance.create({
        employeeId,
        date: dayStart,
        status: ATTENDANCE_STATUS.ON_LEAVE,
        branchId: branchId || null,
        clockMethod: 'Manual',
        notes: 'Marked On Leave from approved leave request',
      });
    } else if (!existing.checkInTime && existing.status === ATTENDANCE_STATUS.ABSENT) {
      existing.status = ATTENDANCE_STATUS.ON_LEAVE;
      existing.notes = existing.notes || 'Marked On Leave from approved leave request';
      await existing.save();
    }

    cursor.setDate(cursor.getDate() + 1);
    guardDays += 1;
  }
};

const resolveScheduleContext = async (employee, rangeStart, rangeEnd) => {
  const [empShift, defaultShift, holidays] = await Promise.all([
    employee?.shiftId
      ? Shift.findById(employee.shiftId).select('weeklyOffDays').lean()
      : Promise.resolve(null),
    Shift.findOne({ isDefault: true, isActive: true }).select('weeklyOffDays').lean(),
    Holiday.find({
      date: { $gte: rangeStart, $lte: rangeEnd },
      isOptional: { $ne: true },
    })
      .select('date branchId')
      .lean(),
  ]);

  const weeklyOffSet = new Set(empShift?.weeklyOffDays || defaultShift?.weeklyOffDays || [0, 6]);
  const empBranchStr = employee?.branchId ? employee.branchId.toString() : null;
  const holidayKeys = new Set(
    holidays
      .filter((h) => !h.branchId || (empBranchStr && h.branchId.toString() === empBranchStr))
      .map((h) => toLocalDateKey(h.date))
  );

  return { weeklyOffSet, holidayKeys };
};

const syncCancelledApprovedLeaveToAttendance = async ({
  employee,
  leaveRequest,
  cancellationReason,
}) => {
  const start = new Date(leaveRequest.startDate);
  start.setHours(0, 0, 0, 0);
  const end = new Date(leaveRequest.endDate);
  end.setHours(23, 59, 59, 999);

  const [{ weeklyOffSet, holidayKeys }, otherApprovedLeaves, leaveAttendanceRecords] =
    await Promise.all([
      resolveScheduleContext(employee, start, end),
      LeaveRequest.find({
        _id: { $ne: leaveRequest._id },
        employeeId: leaveRequest.employeeId,
        status: LEAVE_STATUS.APPROVED,
        startDate: { $lte: end },
        endDate: { $gte: start },
      })
        .select('startDate endDate')
        .lean(),
      Attendance.find({
        employeeId: leaveRequest.employeeId,
        date: { $gte: start, $lte: end },
        status: ATTENDANCE_STATUS.ON_LEAVE,
      }),
    ]);

  const coveredKeys = new Set();
  for (const lr of otherApprovedLeaves) {
    const c = new Date(lr.startDate);
    c.setHours(0, 0, 0, 0);
    const e = new Date(lr.endDate);
    e.setHours(0, 0, 0, 0);
    let guard = 0;
    while (c <= e && guard < 62) {
      coveredKeys.add(toLocalDateKey(c));
      c.setDate(c.getDate() + 1);
      guard += 1;
    }
  }

  const now = new Date();
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  let revertedToPresent = 0;
  let revertedToAbsent = 0;
  let removedFutureOrOff = 0;
  let skippedOverlappingApproved = 0;
  const impactedAbsentDates = [];

  for (const rec of leaveAttendanceRecords) {
    const recDate = new Date(rec.date);
    const key = toLocalDateKey(recDate);

    if (coveredKeys.has(key)) {
      skippedOverlappingApproved += 1;
      continue;
    }

    if (rec.checkInTime) {
      rec.status =
        rec.totalHours > 0 && rec.totalHours < 4
          ? ATTENDANCE_STATUS.HALF_DAY
          : ATTENDANCE_STATUS.PRESENT;
      rec.notes = `Restored to ${rec.status} after approved leave cancellation (${cancellationReason})`;
      await rec.save();
      revertedToPresent += 1;
    } else if (
      recDate > endOfToday ||
      weeklyOffSet.has(recDate.getDay()) ||
      holidayKeys.has(key)
    ) {
      await Attendance.deleteOne({ _id: rec._id });
      removedFutureOrOff += 1;
    } else {
      rec.status = ATTENDANCE_STATUS.ABSENT;
      rec.notes = `Reverted to Absent after approved leave cancellation (${cancellationReason})`;
      await rec.save();
      revertedToAbsent += 1;
      impactedAbsentDates.push(key);
    }
  }

  return {
    revertedToPresent,
    revertedToAbsent,
    removedFutureOrOff,
    skippedOverlappingApproved,
    impactedAbsentDates,
    weeklyOffSet,
    holidayKeys,
  };
};

const handleLockedPayrollForCancelledLeave = async ({
  leaveRequest,
  employee,
  attendanceSync,
  cancellationReason,
  actorUserId,
}) => {
  const cursor = new Date(leaveRequest.startDate);
  cursor.setHours(12, 0, 0, 0);
  const lastDay = new Date(leaveRequest.endDate);
  lastDay.setHours(12, 0, 0, 0);

  const monthBuckets = new Map();
  let guard = 0;
  while (cursor <= lastDay && guard < 62) {
    const key = toLocalDateKey(cursor);
    if (
      !attendanceSync.weeklyOffSet.has(cursor.getDay()) &&
      !attendanceSync.holidayKeys.has(key)
    ) {
      const month = cursor.getMonth() + 1;
      const year = cursor.getFullYear();
      const mk = `${year}-${month}`;
      if (!monthBuckets.has(mk)) monthBuckets.set(mk, { month, year, workKeys: [] });
      monthBuckets.get(mk).workKeys.push(key);
    }
    cursor.setDate(cursor.getDate() + 1);
    guard += 1;
  }

  if (monthBuckets.size === 0) {
    return { hasLockedPayroll: false, historicalPayrollModified: false, adjustments: [] };
  }

  const periods = Array.from(monthBuckets.values()).map(({ month, year }) => ({ month, year }));
  const runs = await PayrollRun.find({ $or: periods }).lean();
  const lockedRuns = runs.filter((r) => r.status === PAYROLL_STATUS.PAID || r.isLocked);

  if (lockedRuns.length === 0) {
    return { hasLockedPayroll: false, historicalPayrollModified: false, adjustments: [] };
  }

  const absentSet = new Set(attendanceSync.impactedAbsentDates || []);
  const isPaidLeave = leaveRequest.leaveTypeId?.isPaid !== false;
  const salary = await SalaryStructure.findOne({ employeeId: employee._id })
    .sort({ isActive: -1, effectiveFrom: -1 })
    .lean();

  const baseBasic = salary?.basicSalary || 0;
  const fullMonthBase =
    baseBasic +
    (salary?.hra || 0) +
    (salary?.specialAllowance || 0) +
    (salary?.conveyanceAllowance || 0) +
    (salary?.customComponents || [])
      .filter((c) => c.type === 'earning' && c.calculationType !== 'percentage_of_gross')
      .reduce(
        (sum, c) =>
          sum + (c.calculationType === 'percentage_of_basic' ? (baseBasic * c.value) / 100 : c.value),
        0
      );

  const adjustments = [];
  for (const run of lockedRuns) {
    const bucket = monthBuckets.get(`${run.year}-${run.month}`);
    if (!bucket) continue;

    const payslip = await Payslip.findOne({
      employeeId: employee._id,
      month: run.month,
      year: run.year,
    }).lean();

    if (!payslip) continue;

    let affectedDays = 0;
    let adjustmentType = null;

    if (!isPaidLeave) {
      const scheduledInMonth =
        monthBuckets.size === 1
          ? Math.min(leaveRequest.totalDays, bucket.workKeys.length)
          : bucket.workKeys.length;
      affectedDays = Math.min(scheduledInMonth, payslip.lopDays || scheduledInMonth);
      adjustmentType = 'CREDIT';
    } else {
      const unpunchedAbsentDays = bucket.workKeys.filter((k) => absentSet.has(k)).length;
      if (unpunchedAbsentDays > 0) {
        affectedDays =
          unpunchedAbsentDays === 1 && leaveRequest.totalDays < 1
            ? leaveRequest.totalDays
            : unpunchedAbsentDays;
        adjustmentType = 'DEDUCTION';
      }
    }

    if (!adjustmentType || affectedDays <= 0) continue;

    const effectiveFullGross =
      fullMonthBase > 0
        ? fullMonthBase
        : payslip.presentDays > 0
        ? (payslip.grossSalary / payslip.presentDays) * (payslip.workingDays || 1)
        : 0;
    const dailyRate = payslip.workingDays > 0 ? effectiveFullGross / payslip.workingDays : 0;
    const amount = Math.max(0, Math.round(dailyRate * affectedDays));

    const adjustment = await PayrollAdjustment.findOneAndUpdate(
      { leaveRequestId: leaveRequest._id, sourceMonth: run.month, sourceYear: run.year },
      {
        $setOnInsert: {
          employeeId: employee._id,
          leaveRequestId: leaveRequest._id,
          sourcePayrollRunId: run._id,
          sourcePayslipId: payslip._id,
          sourceMonth: run.month,
          sourceYear: run.year,
          adjustmentCategory: 'APPROVED_LEAVE_CANCELLATION',
          adjustmentType,
          days: affectedDays,
          amount,
          reason: `Approved leave cancelled after locked payroll (${run.month}/${run.year}): ${cancellationReason}`,
          status: 'Pending',
          createdBy: actorUserId,
        },
      },
      { upsert: true, new: true }
    ).lean();

    adjustments.push(adjustment);
  }

  return {
    hasLockedPayroll: true,
    historicalPayrollModified: false,
    adjustments,
  };
};

/**
 * List Leave Types
 */
export const getLeaveTypes = async (req, res, next) => {
  try {
    const query = { isActive: true };
    const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 50, maxLimit: 200 });

    const [leaveTypes, total] = await Promise.all([
      LeaveType.find(query).skip(skip).limit(limit).lean(),
      LeaveType.countDocuments(query),
    ]);

    return sendSuccess(res, 'Leave types retrieved.', {
      leaveTypes,
      pagination: buildPaginationMeta(total, page, limit),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Create Leave Type (HR / Admin)
 */
export const createLeaveType = async (req, res, next) => {
  try {
    const { name, code, defaultDaysPerYear, isPaid, requiresApproval, accrualFrequency } = req.body;
    const leaveType = await LeaveType.create({
      name,
      code: code.toUpperCase(),
      defaultDaysPerYear: Number(defaultDaysPerYear) || 12,
      isPaid: isPaid ?? true,
      requiresApproval: requiresApproval ?? true,
      accrualFrequency: accrualFrequency || 'Yearly',
    });
    return sendSuccess(res, 'Leave type created.', { leaveType }, 201);
  } catch (error) {
    next(error);
  }
};

/**
 * Get Leave Balances for an employee (or current user)
 */
export const getLeaveBalances = async (req, res, next) => {
  try {
    let targetEmployeeId = req.query.employeeId;

    if (isAdminOrHR(req.user.role)) {
      if (!targetEmployeeId) {
        targetEmployeeId = req.verifiedEmployeeId;
      } else if (!isValidObjectId(targetEmployeeId)) {
        return sendError(res, 'Invalid employee ID format.', [], 400);
      }
    } else if (req.user.role === ROLES.MANAGER) {
      if (!req.verifiedEmployeeId) {
        return sendError(res, 'Access denied: No manager employee profile found.', [], 403);
      }
      if (!targetEmployeeId || targetEmployeeId.toString() === req.verifiedEmployeeId.toString()) {
        targetEmployeeId = req.verifiedEmployeeId;
      } else {
        const targetEmp = await Employee.findOne({
          _id: targetEmployeeId,
          managerId: req.verifiedEmployeeId,
          isDeleted: false,
        })
          .select('_id')
          .lean();
        if (!targetEmp) {
          return sendError(res, 'Access denied: You can only view leave balances for your direct reporting team.', [], 403);
        }
      }
    } else {
      if (!req.verifiedEmployeeId) {
        return sendError(res, 'Access denied: No employee profile found.', [], 403);
      }
      if (targetEmployeeId && targetEmployeeId.toString() !== req.verifiedEmployeeId.toString()) {
        return sendError(res, "Access denied: You cannot view another employee's leave balances.", [], 403);
      }
      targetEmployeeId = req.verifiedEmployeeId;
    }

    if (!targetEmployeeId) {
      return sendSuccess(res, 'No employee record linked.', { balances: [] });
    }

    const currentYear = new Date().getFullYear();
    let balanceDoc = await LeaveBalance.findOne({
      employeeId: targetEmployeeId,
      year: currentYear,
    })
      .populate('balances.leaveTypeId')
      .lean();

    if (!balanceDoc) {
      const leaveTypes = await LeaveType.find({ isActive: true }).lean();
      const created = await LeaveBalance.create({
        employeeId: targetEmployeeId,
        year: currentYear,
        balances: leaveTypes.map((lt) => ({
          leaveTypeId: lt._id,
          allocated: lt.defaultDaysPerYear,
          used: 0,
          pending: 0,
          remaining: lt.defaultDaysPerYear,
        })),
      });
      const populated = await created.populate('balances.leaveTypeId');
      balanceDoc = populated.toObject();
    }

    return sendSuccess(res, 'Leave balances retrieved.', { balances: balanceDoc.balances });
  } catch (error) {
    next(error);
  }
};

/**
 * Apply for Leave
 */
export const applyLeave = async (req, res, next) => {
  try {
    const validated = leaveApplySchema.parse(req.body);
    if (!isValidObjectId(validated.leaveTypeId)) {
      return sendError(res, 'Invalid leave type ID.', [], 400);
    }

    const start = new Date(validated.startDate);
    const end = new Date(validated.endDate);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return sendError(res, 'Invalid leave start or end date.', [], 400);
    }
    if (end < start) {
      return sendError(res, 'End date cannot be earlier than start date.', [], 400);
    }

    const employeeId = req.verifiedEmployeeId;
    if (!employeeId) {
      return sendError(res, 'Access denied: No employee profile is linked to this authenticated user account.', [], 403);
    }

    const year = start.getFullYear();

    const [employee, leaveType, overlap, existingBalanceDoc] = await Promise.all([
      Employee.findOne({ _id: employeeId, isDeleted: false })
        .select('_id firstName lastName employeeId departmentId')
        .lean(),
      LeaveType.findOne({ _id: validated.leaveTypeId, isActive: true }).lean(),
      LeaveRequest.findOne({
        employeeId,
        status: { $in: [LEAVE_STATUS.PENDING, LEAVE_STATUS.APPROVED] },
        $or: [{ startDate: { $lte: end }, endDate: { $gte: start } }],
      })
        .select('_id')
        .lean(),
      LeaveBalance.findOne({
        employeeId,
        year,
      }),
    ]);

    if (!employee) {
      return sendError(res, 'Active employee profile not found.', [], 404);
    }

    if (!leaveType) {
      return sendError(res, 'Selected leave type was not found or is inactive.', [], 404);
    }

    if (overlap) {
      return sendError(
        res,
        'You already have an active or pending leave request that overlaps with these dates.',
        [],
        400
      );
    }

    let balanceDoc = existingBalanceDoc;
    if (!balanceDoc) {
      const allActiveTypes = await LeaveType.find({ isActive: true }).select('_id defaultDaysPerYear').lean();
      balanceDoc = await LeaveBalance.create({
        employeeId,
        year,
        balances: allActiveTypes.map((lt) => {
          const quota = lt.defaultDaysPerYear ?? 12;
          return {
            leaveTypeId: lt._id,
            allocated: quota,
            used: 0,
            pending: 0,
            remaining: quota,
          };
        }),
      });
    }

    let item = balanceDoc.balances.find(
      (b) => b.leaveTypeId.toString() === validated.leaveTypeId
    );
    if (!item) {
      const quota = leaveType.defaultDaysPerYear ?? 12;
      balanceDoc.balances.push({
        leaveTypeId: leaveType._id,
        allocated: quota,
        used: 0,
        pending: 0,
        remaining: quota,
      });
      item = balanceDoc.balances[balanceDoc.balances.length - 1];
    }

    const availableDays = Math.max(
      0,
      Math.round(((item.allocated || 0) - (item.used || 0) - (item.pending || 0)) * 10) / 10
    );
    if (availableDays < validated.totalDays) {
      return sendError(
        res,
        `Insufficient leave balance. You have ${availableDays} days available, but requested ${validated.totalDays} days.`,
        [],
        400
      );
    }

    item.pending = (item.pending || 0) + validated.totalDays;
    recalculateBalanceItem(item);
    await balanceDoc.save();

    // 3. Create request
    const leaveRequest = await LeaveRequest.create({
      employeeId: employee._id,
      leaveTypeId: validated.leaveTypeId,
      startDate: start,
      endDate: end,
      totalDays: validated.totalDays,
      reason: validated.reason,
      status: LEAVE_STATUS.PENDING,
    });

    const populated = await LeaveRequest.findById(leaveRequest._id)
      .populate('employeeId', 'firstName lastName employeeId departmentId')
      .populate('leaveTypeId', 'name code isPaid')
      .lean();

    logAudit({
      req,
      action: 'LEAVE_APPLIED',
      entity: 'LeaveRequest',
      entityId: leaveRequest._id,
      details: { totalDays: validated.totalDays, startDate: start, endDate: end },
    });

    return sendSuccess(
      res,
      'Leave application submitted successfully.',
      { leaveRequest: populated, request: populated },
      201
    );
  } catch (error) {
    next(error);
  }
};

/**
 * List Leave Requests (Strictly Role Scoped & Filtered)
 */
export const getLeaveRequests = async (req, res, next) => {
  try {
    const { status, employeeId } = req.query;

    const query = {};

    if (status) {
      query.status = status;
    }

    // Strict Role-Based Data Isolation
    if (isAdminOrHR(req.user.role)) {
      if (employeeId) {
        if (!isValidObjectId(employeeId)) {
          return sendError(res, 'Invalid employee ID format.', [], 400);
        }
        query.employeeId = employeeId;
      }
    } else if (req.user.role === ROLES.MANAGER) {
      if (!req.verifiedEmployeeId) {
        return sendError(res, 'Access denied: No manager employee profile found.', [], 403);
      }
      const teamEmployees = await Employee.find({
        managerId: req.verifiedEmployeeId,
        isDeleted: false,
      })
        .select('_id')
        .lean();
      const teamIds = teamEmployees.map((e) => e._id);
      teamIds.push(req.verifiedEmployeeId);

      if (employeeId) {
        const isAllowed = teamIds.some((id) => id.toString() === employeeId.toString());
        if (!isAllowed) {
          return sendError(res, 'Access denied: You can only view leave records for your direct reporting team.', [], 403);
        }
        query.employeeId = employeeId;
      } else {
        query.employeeId = { $in: teamIds };
      }
    } else {
      // EMPLOYEE, RECRUITER, PAYROLL_ADMIN strictly scoped to self only
      if (!req.verifiedEmployeeId) {
        return sendError(res, 'Access denied: No employee profile is linked to this account.', [], 403);
      }
      if (employeeId && employeeId.toString() !== req.verifiedEmployeeId.toString()) {
        return sendError(res, 'Access denied: Employees can only view their own leave records.', [], 403);
      }
      query.employeeId = req.verifiedEmployeeId;
    }

    const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 20, maxLimit: 200 });

    const [total, requests] = await Promise.all([
      LeaveRequest.countDocuments(query),
      LeaveRequest.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('employeeId', 'firstName lastName employeeId departmentId')
        .populate('leaveTypeId', 'name code isPaid')
        .populate('reviewedBy', 'email')
        .populate('cancelledBy', 'name email role')
        .lean(),
    ]);

    return sendSuccess(res, 'Leave requests retrieved.', {
      requests,
      pagination: buildPaginationMeta(total, page, limit),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get Single Leave Request by ID (Strict Role Guard)
 */
export const getLeaveRequestById = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return sendError(res, 'Invalid leave request ID format.', [], 400);
    }

    const leaveRequest = await LeaveRequest.findById(id)
      .populate('employeeId', 'firstName lastName employeeId departmentId managerId')
      .populate('leaveTypeId', 'name code isPaid')
      .populate('reviewedBy', 'email')
      .populate('cancelledBy', 'name email role')
      .lean();

    if (!leaveRequest) {
      return sendError(res, 'Leave request not found.', [], 404);
    }

    // Role-based authorization check
    if (!isAdminOrHR(req.user.role)) {
      const targetEmpId = leaveRequest.employeeId?._id?.toString();
      const isOwn = req.verifiedEmployeeId && targetEmpId === req.verifiedEmployeeId.toString();

      if (req.user.role === ROLES.MANAGER) {
        const isReport =
          req.verifiedEmployeeId &&
          leaveRequest.employeeId?.managerId?.toString() === req.verifiedEmployeeId.toString();
        if (!isOwn && !isReport) {
          return sendError(
            res,
            'Access denied: You can only view leave requests for yourself and your direct reports.',
            [],
            403
          );
        }
      } else if (!isOwn) {
        return sendError(res, "Access denied: You cannot view another employee's leave request.", [], 403);
      }
    }

    return sendSuccess(res, 'Leave request retrieved.', { leaveRequest });
  } catch (error) {
    next(error);
  }
};

/**
 * Cancel Leave Request
 * - Pending: Owner or HR/Admin
 * - Approved: HR/Admin ONLY (employees blocked 403), mandatory cancellation reason,
 *   atomic balance restoration, attendance reversion, audit log, and locked-payroll adjustment queue.
 */
export const cancelLeaveRequest = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return sendError(res, 'Invalid leave request ID format.', [], 400);
    }

    const leaveRequest = await LeaveRequest.findById(id).populate('leaveTypeId', 'name code isPaid');
    if (!leaveRequest) {
      return sendError(res, 'Leave request not found.', [], 404);
    }

    const previousStatus = leaveRequest.status;
    if (previousStatus === LEAVE_STATUS.CANCELLED) {
      return sendError(res, 'This leave request has already been cancelled.', [], 400);
    }
    if (previousStatus === LEAVE_STATUS.REJECTED) {
      return sendError(res, 'Cannot cancel a leave request that is already rejected.', [], 400);
    }

    const isPrivilegedHR = isAdminOrHR(req.user.role);
    const isOwner =
      req.verifiedEmployeeId && leaveRequest.employeeId.toString() === req.verifiedEmployeeId.toString();

    if (previousStatus === LEAVE_STATUS.APPROVED) {
      if (!isPrivilegedHR) {
        return sendError(
          res,
          'Access denied: Only HR or Admin can cancel an approved leave request.',
          [],
          403
        );
      }
    } else if (!isOwner && !isPrivilegedHR) {
      return sendError(res, 'Access denied: You can only cancel your own leave requests.', [], 403);
    }

    const rawReasonInput = req.body?.cancellationReason ?? req.body?.reason ?? '';
    const cancellationReason = typeof rawReasonInput === 'string' ? rawReasonInput.trim() : '';

    if (previousStatus === LEAVE_STATUS.APPROVED && cancellationReason.length < 3) {
      return sendError(
        res,
        'Cancellation reason (minimum 3 characters) is required when cancelling an approved leave request.',
        [],
        400
      );
    }

    const cancelledAt = new Date();

    // Atomic state gate prevents duplicate concurrent cancellation and double balance restoration
    const cancelledRequest = await LeaveRequest.findOneAndUpdate(
      { _id: leaveRequest._id, status: previousStatus },
      {
        $set: {
          status: LEAVE_STATUS.CANCELLED,
          cancellationReason,
          cancelledBy: req.user._id,
          cancelledAt,
          cancelledFromStatus: previousStatus,
        },
      },
      { new: true }
    )
      .populate('employeeId', 'firstName lastName employeeId departmentId')
      .populate('leaveTypeId', 'name code isPaid')
      .populate('cancelledBy', 'name email role')
      .lean();

    if (!cancelledRequest) {
      return sendError(res, 'This leave request has already been cancelled or updated.', [], 400);
    }

    // Atomically restore LeaveBalance ('pending' if Pending; 'used' if Approved)
    const year = new Date(leaveRequest.startDate).getFullYear();
    const leaveTypeRef = leaveRequest.leaveTypeId?._id || leaveRequest.leaveTypeId;
    const leaveTypeObjId = new mongoose.Types.ObjectId(String(leaveTypeRef));
    const days = Number(leaveRequest.totalDays || 0);
    const fieldToDecrement = previousStatus === LEAVE_STATUS.APPROVED ? 'used' : 'pending';

    const updatedBalanceDoc = await LeaveBalance.findOneAndUpdate(
      {
        employeeId: leaveRequest.employeeId,
        year,
        'balances.leaveTypeId': leaveTypeObjId,
      },
      [
        {
          $set: {
            balances: {
              $map: {
                input: '$balances',
                as: 'item',
                in: {
                  $cond: [
                    { $eq: ['$$item.leaveTypeId', leaveTypeObjId] },
                    {
                      $let: {
                        vars: {
                          newUsed:
                            fieldToDecrement === 'used'
                              ? { $max: [0, { $subtract: [{ $ifNull: ['$$item.used', 0] }, days] }] }
                              : { $ifNull: ['$$item.used', 0] },
                          newPending:
                            fieldToDecrement === 'pending'
                              ? { $max: [0, { $subtract: [{ $ifNull: ['$$item.pending', 0] }, days] }] }
                              : { $ifNull: ['$$item.pending', 0] },
                          alloc: { $ifNull: ['$$item.allocated', 0] },
                        },
                        in: {
                          $mergeObjects: [
                            '$$item',
                            {
                              used: '$$newUsed',
                              pending: '$$newPending',
                              remaining: {
                                $max: [
                                  0,
                                  {
                                    $divide: [
                                      {
                                        $round: [
                                          {
                                            $multiply: [
                                              { $subtract: ['$$alloc', { $add: ['$$newUsed', '$$newPending'] }] },
                                              10,
                                            ],
                                          },
                                          0,
                                        ],
                                      },
                                      10,
                                    ],
                                  },
                                ],
                              },
                            },
                          ],
                        },
                      },
                    },
                    '$$item',
                  ],
                },
              },
            },
          },
        },
      ],
      { new: true }
    ).lean();

    let attendanceSyncSummary = {
      revertedToPresent: 0,
      revertedToAbsent: 0,
      removedFutureOrOff: 0,
      skippedOverlappingApproved: 0,
      impactedAbsentDates: [],
    };
    let payrollImpact = {
      hasLockedPayroll: false,
      historicalPayrollModified: false,
      adjustments: [],
    };

    if (previousStatus === LEAVE_STATUS.APPROVED) {
      const employee = await Employee.findById(leaveRequest.employeeId)
        .select('_id branchId shiftId')
        .lean();

      if (employee) {
        attendanceSyncSummary = await syncCancelledApprovedLeaveToAttendance({
          employee,
          leaveRequest,
          cancellationReason,
        });

        payrollImpact = await handleLockedPayrollForCancelledLeave({
          leaveRequest,
          employee,
          attendanceSync: attendanceSyncSummary,
          cancellationReason,
          actorUserId: req.user._id,
        });
      }
    }

    const restoredBalanceItem = updatedBalanceDoc?.balances?.find(
      (b) => b.leaveTypeId.toString() === leaveTypeObjId.toString()
    );

    await logAudit({
      req,
      action: 'LEAVE_CANCELLED',
      entity: 'LeaveRequest',
      entityId: leaveRequest._id,
      details: {
        employeeId: String(leaveRequest.employeeId),
        previousStatus,
        newStatus: LEAVE_STATUS.CANCELLED,
        actorId: String(req.user._id),
        actorEmail: req.user.email,
        actorRole: req.user.role,
        cancelledAt: cancelledAt.toISOString(),
        cancellationReason: cancellationReason || null,
        totalDays: leaveRequest.totalDays,
        restoredField: fieldToDecrement,
        restoredRemaining: restoredBalanceItem?.remaining ?? null,
        attendanceSync: {
          revertedToPresent: attendanceSyncSummary.revertedToPresent,
          revertedToAbsent: attendanceSyncSummary.revertedToAbsent,
          removedFutureOrOff: attendanceSyncSummary.removedFutureOrOff,
          skippedOverlappingApproved: attendanceSyncSummary.skippedOverlappingApproved,
        },
        payrollImpact: {
          hasLockedPayroll: payrollImpact.hasLockedPayroll,
          historicalPayrollModified: payrollImpact.historicalPayrollModified,
          pendingAdjustmentsCount: payrollImpact.adjustments.length,
        },
      },
    });

    return sendSuccess(res, 'Leave request cancelled successfully.', {
      leaveRequest: cancelledRequest,
      balanceRestored: restoredBalanceItem || null,
      attendanceSync: {
        revertedToPresent: attendanceSyncSummary.revertedToPresent,
        revertedToAbsent: attendanceSyncSummary.revertedToAbsent,
        removedFutureOrOff: attendanceSyncSummary.removedFutureOrOff,
        skippedOverlappingApproved: attendanceSyncSummary.skippedOverlappingApproved,
      },
      payrollImpact,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Approve or Reject Leave Request (Manager direct report, HR, Admin)
 */
export const reviewLeaveRequest = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, remarks } = req.body;

    if (!isValidObjectId(id)) {
      return sendError(res, 'Invalid leave request ID.', [], 400);
    }

    if (![LEAVE_STATUS.APPROVED, LEAVE_STATUS.REJECTED].includes(status)) {
      return sendError(res, "Status must be either 'Approved' or 'Rejected'.", [], 400);
    }

    const leaveRequest = await LeaveRequest.findById(id).populate('leaveTypeId');
    if (!leaveRequest) {
      return sendError(res, 'Leave request not found.', [], 404);
    }

    // Role verification: Employees cannot approve/reject
    if (req.user.role === ROLES.EMPLOYEE) {
      return sendError(res, 'Access denied: Employees cannot approve or reject leave requests.', [], 403);
    }

    if (
      !isAdminOrHR(req.user.role) &&
      req.verifiedEmployeeId &&
      leaveRequest.employeeId.toString() === req.verifiedEmployeeId.toString()
    ) {
      return sendError(res, 'Access denied: You cannot approve or reject your own leave request.', [], 403);
    }

    const applicant = await Employee.findById(leaveRequest.employeeId)
      .select('managerId branchId')
      .lean();

    // Managers can only approve requests for their direct reports
    if (req.user.role === ROLES.MANAGER) {
      if (
        !applicant ||
        !applicant.managerId ||
        !req.verifiedEmployeeId ||
        applicant.managerId.toString() !== req.verifiedEmployeeId.toString()
      ) {
        return sendError(res, 'Access denied: You can only review leave requests for your direct reporting team.', [], 403);
      }
    }

    if (leaveRequest.status !== LEAVE_STATUS.PENDING) {
      return sendError(res, `This leave request has already been ${leaveRequest.status.toLowerCase()}.`, [], 400);
    }

    leaveRequest.status = status;
    leaveRequest.reviewedBy = req.user._id;
    leaveRequest.reviewRemarks = remarks || '';
    leaveRequest.reviewedAt = new Date();
    await leaveRequest.save();

    // Adjust Leave Balance
    const year = new Date(leaveRequest.startDate).getFullYear();
    const balanceDoc = await LeaveBalance.findOne({
      employeeId: leaveRequest.employeeId,
      year,
    });

    if (balanceDoc) {
      const leaveTypeRef = leaveRequest.leaveTypeId?._id || leaveRequest.leaveTypeId;
      const item = balanceDoc.balances.find(
        (b) => b.leaveTypeId.toString() === leaveTypeRef.toString()
      );
      if (item) {
        item.pending = Math.max(0, (item.pending || 0) - leaveRequest.totalDays);
        if (status === LEAVE_STATUS.APPROVED) {
          item.used = (item.used || 0) + leaveRequest.totalDays;
        }
        recalculateBalanceItem(item);
        await balanceDoc.save();
      }
    }

    if (status === LEAVE_STATUS.APPROVED) {
      await syncApprovedLeaveToAttendance({
        employeeId: leaveRequest.employeeId,
        branchId: applicant?.branchId || null,
        startDate: leaveRequest.startDate,
        endDate: leaveRequest.endDate,
      });
    }

    await logAudit({
      req,
      action: `LEAVE_${status.toUpperCase()}`,
      entity: 'LeaveRequest',
      entityId: leaveRequest._id,
      details: { status, reviewedBy: req.user.email, totalDays: leaveRequest.totalDays },
    });

    return sendSuccess(res, `Leave request has been ${status.toLowerCase()}.`, { leaveRequest });
  } catch (error) {
    next(error);
  }
};
