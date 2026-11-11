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

    if (req.user.role === ROLES.EMPLOYEE) {
      if (!req.verifiedEmployeeId) {
        return sendError(res, 'Access denied: No employee profile found.', [], 403);
      }
      if (targetEmployeeId && targetEmployeeId.toString() !== req.verifiedEmployeeId.toString()) {
        return sendError(res, "Access denied: You cannot view another employee's leave balances.", [], 403);
      }
      targetEmployeeId = req.verifiedEmployeeId;
    } else if (req.user.role === ROLES.MANAGER) {
      if (!targetEmployeeId || targetEmployeeId.toString() === req.verifiedEmployeeId?.toString()) {
        targetEmployeeId = req.verifiedEmployeeId;
      } else {
        const targetEmp = await Employee.findOne({
          _id: targetEmployeeId,
          managerId: req.verifiedEmployeeId,
          isDeleted: false,
        });
        if (!targetEmp) {
          return sendError(res, 'Access denied: You can only view leave balances for your direct reporting team.', [], 403);
        }
      }
    } else if (req.user.role === ROLES.HR_MANAGER || req.user.role === ROLES.ADMIN) {
      if (!targetEmployeeId) {
        targetEmployeeId = req.verifiedEmployeeId;
      }
    } else {
      targetEmployeeId = req.verifiedEmployeeId;
    }

    if (!targetEmployeeId) {
      return sendSuccess(res, 'No employee record linked.', { balances: [] });
    }

    const currentYear = new Date().getFullYear();
    let balanceDoc = await LeaveBalance.findOne({
      employeeId: targetEmployeeId,
      year: currentYear,
    }).populate('balances.leaveTypeId');

    if (!balanceDoc) {
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

    const employeeId = req.verifiedEmployeeId;
    if (!employeeId) {
      return sendError(res, 'Access denied: No employee profile is linked to this authenticated user account.', [], 403);
    }

    const [employee, overlap, balanceDoc] = await Promise.all([
      Employee.findOne({ _id: employeeId, isDeleted: false }).lean(),
      LeaveRequest.findOne({
        employeeId,
        status: { $in: [LEAVE_STATUS.PENDING, LEAVE_STATUS.APPROVED] },
        $or: [{ startDate: { $lte: new Date(validated.endDate) }, endDate: { $gte: new Date(validated.startDate) } }],
      }).lean(),
      LeaveBalance.findOne({
        employeeId,
        year: new Date(validated.startDate).getFullYear(),
      }),
    ]);

    if (!employee) {
      return sendError(res, 'Active employee profile not found.', [], 404);
    }

    const start = new Date(validated.startDate);
    const end = new Date(validated.endDate);

    if (end < start) {
      return sendError(res, 'End date cannot be earlier than start date.', [], 400);
    }

    if (overlap) {
      return sendError(
        res,
        'You already have an active or pending leave request that overlaps with these dates.',
        [],
        400
      );
    }

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
    const { status, employeeId, page = 1, limit = 20 } = req.query;

    const query = {};

    if (status) {
      query.status = status;
    }

    // Strict Role-Based Data Isolation
    if (req.user.role === ROLES.EMPLOYEE) {
      if (!req.verifiedEmployeeId) {
        return sendError(res, 'Access denied: No employee profile is linked to this account.', [], 403);
      }
      if (employeeId && employeeId.toString() !== req.verifiedEmployeeId.toString()) {
        return sendError(res, 'Access denied: Employees can only view their own leave records.', [], 403);
      }
      query.employeeId = req.verifiedEmployeeId;
    } else if (req.user.role === ROLES.MANAGER) {
      if (!req.verifiedEmployeeId) {
        return sendError(res, 'Access denied: No manager employee profile found.', [], 403);
      }
      const teamEmployees = await Employee.find({ managerId: req.verifiedEmployeeId, isDeleted: false }).select('_id');
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
    } else if (req.user.role === ROLES.HR_MANAGER || req.user.role === ROLES.ADMIN) {
      if (employeeId) {
        query.employeeId = employeeId;
      }
    } else {
      // Any other role defaults strictly to self-only
      if (req.verifiedEmployeeId) {
        query.employeeId = req.verifiedEmployeeId;
      } else {
        return sendError(res, 'Access denied: Insufficient permissions to view leave records.', [], 403);
      }
    }

    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const [total, requests] = await Promise.all([
      LeaveRequest.countDocuments(query),
      LeaveRequest.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit, 10))
        .populate('employeeId', 'firstName lastName employeeId departmentId')
        .populate('leaveTypeId', 'name code isPaid')
        .populate('reviewedBy', 'email')
        .lean(),
    ]);

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
 * Get Single Leave Request by ID (Strict Role Guard)
 */
export const getLeaveRequestById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const leaveRequest = await LeaveRequest.findById(id)
      .populate('employeeId', 'firstName lastName employeeId departmentId managerId')
      .populate('leaveTypeId', 'name code isPaid')
      .populate('reviewedBy', 'email');

    if (!leaveRequest) {
      return sendError(res, 'Leave request not found.', [], 404);
    }

    // Role-based authorization check
    if (req.user.role === ROLES.EMPLOYEE) {
      if (!req.verifiedEmployeeId || leaveRequest.employeeId._id.toString() !== req.verifiedEmployeeId.toString()) {
        return sendError(res, "Access denied: You cannot view another employee's leave request.", [], 403);
      }
    } else if (req.user.role === ROLES.MANAGER) {
      const isOwn = req.verifiedEmployeeId && leaveRequest.employeeId._id.toString() === req.verifiedEmployeeId.toString();
      const isReport = req.verifiedEmployeeId && leaveRequest.employeeId.managerId?.toString() === req.verifiedEmployeeId.toString();
      if (!isOwn && !isReport) {
        return sendError(res, 'Access denied: You can only view leave requests for yourself and your direct reports.', [], 403);
      }
    }

    return sendSuccess(res, 'Leave request retrieved.', { leaveRequest });
  } catch (error) {
    next(error);
  }
};

/**
 * Cancel Own Pending Leave Request (Employee Self-Service)
 */
export const cancelLeaveRequest = async (req, res, next) => {
  try {
    const { id } = req.params;

    const leaveRequest = await LeaveRequest.findById(id);
    if (!leaveRequest) {
      return sendError(res, 'Leave request not found.', [], 404);
    }

    // Only applicant or admin can cancel
    if (req.user.role === ROLES.EMPLOYEE) {
      if (!req.verifiedEmployeeId || leaveRequest.employeeId.toString() !== req.verifiedEmployeeId.toString()) {
        return sendError(res, 'Access denied: You can only cancel your own leave requests.', [], 403);
      }
    }

    if (leaveRequest.status !== LEAVE_STATUS.PENDING) {
      return sendError(res, `Cannot cancel a leave request that is already ${leaveRequest.status.toLowerCase()}.`, [], 400);
    }

    leaveRequest.status = 'Cancelled';
    await leaveRequest.save();

    // Reconcile Leave Balance pending days
    const year = new Date(leaveRequest.startDate).getFullYear();
    const balanceDoc = await LeaveBalance.findOne({
      employeeId: leaveRequest.employeeId,
      year,
    });

    if (balanceDoc) {
      const item = balanceDoc.balances.find(
        (b) => b.leaveTypeId.toString() === leaveRequest.leaveTypeId.toString()
      );
      if (item) {
        item.pending = Math.max(0, item.pending - leaveRequest.totalDays);
        await balanceDoc.save();
      }
    }

    await logAudit({
      req,
      action: 'LEAVE_CANCELLED',
      entity: 'LeaveRequest',
      entityId: leaveRequest._id,
      details: { totalDays: leaveRequest.totalDays },
    });

    return sendSuccess(res, 'Leave request cancelled successfully.', { leaveRequest });
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

    // Managers can only approve requests for their direct reports
    if (req.user.role === ROLES.MANAGER) {
      const applicant = await Employee.findById(leaveRequest.employeeId);
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
