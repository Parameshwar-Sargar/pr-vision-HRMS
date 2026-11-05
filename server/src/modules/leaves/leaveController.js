import { z } from 'zod';
import LeaveRequest from '../../models/LeaveRequest.js';
import LeaveType from '../../models/LeaveType.js';
import LeaveBalance from '../../models/LeaveBalance.js';
import Employee from '../../models/Employee.js';
import { LEAVE_STATUS, ROLES } from '../../config/constants.js';
import { sendSuccess, sendError } from '../../utils/responseUtils.js';
import { logAudit } from '../../middleware/auditMiddleware.js';

const leaveApplySchema = z.object({
  leaveTypeId: z.string().min(1, 'Leave type is required'),
  startDate: z.string().min(1, 'Start date is required'),
  endDate: z.string().min(1, 'End date is required'),
  totalDays: z.number().min(0.5, 'Total days must be at least 0.5'),
  reason: z.string().min(3, 'Reason must be at least 3 characters'),
});

/**
 * List Leave Types
 */
export const getLeaveTypes = async (req, res, next) => {
  try {
    const leaveTypes = await LeaveType.find({ isActive: true });
    return sendSuccess(res, 'Leave types retrieved.', { leaveTypes });
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

    if (!targetEmployeeId || req.user.role === ROLES.EMPLOYEE) {
      const myEmp = await Employee.findOne({ userId: req.user._id, isDeleted: false });
      if (!myEmp) return sendSuccess(res, 'No employee record found.', { balances: [] });
      targetEmployeeId = myEmp._id;
    }

    const currentYear = new Date().getFullYear();
    let balanceDoc = await LeaveBalance.findOne({
      employeeId: targetEmployeeId,
      year: currentYear,
    }).populate('balances.leaveTypeId');

    if (!balanceDoc) {
      // Auto-initialize if not existing
      const leaveTypes = await LeaveType.find({ isActive: true });
      balanceDoc = await LeaveBalance.create({
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
      balanceDoc = await balanceDoc.populate('balances.leaveTypeId');
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

    const employee = await Employee.findOne({ userId: req.user._id, isDeleted: false });
    if (!employee) {
      return sendError(res, 'Employee profile not found.', [], 400);
    }

    const start = new Date(validated.startDate);
    const end = new Date(validated.endDate);

    if (end < start) {
      return sendError(res, 'End date cannot be earlier than start date.', [], 400);
    }

    // 1. Prevent overlapping leaves
    const overlap = await LeaveRequest.findOne({
      employeeId: employee._id,
      status: { $in: [LEAVE_STATUS.PENDING, LEAVE_STATUS.APPROVED] },
      $or: [{ startDate: { $lte: end }, endDate: { $gte: start } }],
    });

    if (overlap) {
      return sendError(
        res,
        'You already have an active or pending leave request that overlaps with these dates.',
        [],
        400
      );
    }

    // 2. Check balance
    const currentYear = start.getFullYear();
    let balanceDoc = await LeaveBalance.findOne({
      employeeId: employee._id,
      year: currentYear,
    });

    if (balanceDoc) {
      const item = balanceDoc.balances.find(
        (b) => b.leaveTypeId.toString() === validated.leaveTypeId
      );
      if (item && item.remaining < validated.totalDays) {
        return sendError(
          res,
          `Insufficient leave balance. You have ${item.remaining} days remaining, but requested ${validated.totalDays} days.`,
          [],
          400
        );
      }
      if (item) {
        item.pending += validated.totalDays;
        await balanceDoc.save();
      }
    }

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

    await logAudit({
      req,
      action: 'LEAVE_APPLIED',
      entity: 'LeaveRequest',
      entityId: leaveRequest._id,
      details: { totalDays: validated.totalDays, startDate: start, endDate: end },
    });

    return sendSuccess(res, 'Leave application submitted successfully.', { leaveRequest }, 201);
  } catch (error) {
    next(error);
  }
};

/**
 * List Leave Requests (Role filtered)
 */
export const getLeaveRequests = async (req, res, next) => {
  try {
    const { status, employeeId, page = 1, limit = 20 } = req.query;

    const query = {};

    if (status) {
      query.status = status;
    }

    // Filter by role
    if (req.user.role === ROLES.EMPLOYEE) {
      const myEmp = await Employee.findOne({ userId: req.user._id, isDeleted: false });
      if (!myEmp) return sendSuccess(res, 'No records', { requests: [] });
      query.employeeId = myEmp._id;
    } else if (req.user.role === ROLES.MANAGER) {
      const myEmp = await Employee.findOne({ userId: req.user._id, isDeleted: false });
      if (myEmp) {
        const teamEmployees = await Employee.find({ managerId: myEmp._id, isDeleted: false }).select('_id');
        query.employeeId = { $in: teamEmployees.map((e) => e._id) };
      }
    } else if (employeeId) {
      query.employeeId = employeeId;
    }

    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const total = await LeaveRequest.countDocuments(query);
    const requests = await LeaveRequest.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit, 10))
      .populate('employeeId', 'firstName lastName employeeId departmentId')
      .populate('leaveTypeId', 'name code isPaid')
      .populate('reviewedBy', 'email');

    return sendSuccess(res, 'Leave requests retrieved.', {
      requests,
      pagination: {
        total,
        page: parseInt(page, 10),
        pages: Math.ceil(total / parseInt(limit, 10)),
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Approve or Reject Leave Request (Manager, HR, Admin)
 */
export const reviewLeaveRequest = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, remarks } = req.body;

    if (![LEAVE_STATUS.APPROVED, LEAVE_STATUS.REJECTED].includes(status)) {
      return sendError(res, "Status must be either 'Approved' or 'Rejected'.", [], 400);
    }

    const leaveRequest = await LeaveRequest.findById(id).populate('leaveTypeId');
    if (!leaveRequest) {
      return sendError(res, 'Leave request not found.', [], 404);
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
      const item = balanceDoc.balances.find(
        (b) => b.leaveTypeId.toString() === leaveRequest.leaveTypeId._id.toString()
      );
      if (item) {
        item.pending = Math.max(0, item.pending - leaveRequest.totalDays);
        if (status === LEAVE_STATUS.APPROVED) {
          item.used += leaveRequest.totalDays;
          item.remaining = Math.max(0, item.remaining - leaveRequest.totalDays);
        }
        await balanceDoc.save();
      }
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
