import ExpenseClaim from '../../models/ExpenseClaim.js';
import Employee from '../../models/Employee.js';
import { ROLES } from '../../config/constants.js';
import { sendSuccess, sendError } from '../../utils/responseUtils.js';
import { logAudit } from '../../middleware/auditMiddleware.js';

export const getExpenseClaims = async (req, res, next) => {
  try {
    const { status, employeeId } = req.query;
    const query = {};

    if (req.user.role === ROLES.EMPLOYEE) {
      if (!req.verifiedEmployeeId) return sendSuccess(res, 'No records found.', { claims: [] });
      query.employeeId = req.verifiedEmployeeId;
    } else if (req.user.role === ROLES.MANAGER) {
      if (!req.verifiedEmployeeId) return sendSuccess(res, 'No records found.', { claims: [] });
      const team = await Employee.find({ managerId: req.verifiedEmployeeId, isDeleted: false }).select('_id');
      const allowedIds = [...team.map((t) => t._id), req.verifiedEmployeeId];
      if (employeeId) {
        if (!allowedIds.some((id) => id.toString() === employeeId.toString())) {
          return sendError(res, 'Access denied: You can only view claims for yourself and your team.', [], 403);
        }
        query.employeeId = employeeId;
      } else {
        query.employeeId = { $in: allowedIds };
      }
    } else if (employeeId) {
      query.employeeId = employeeId;
    }

    if (status) query.status = status;

    const claims = await ExpenseClaim.find(query)
      .populate('employeeId', 'firstName lastName employeeId departmentId')
      .populate('approvedBy', 'name email')
      .sort({ createdAt: -1 });

    return sendSuccess(res, 'Expense claims retrieved.', { claims });
  } catch (error) {
    next(error);
  }
};

export const submitExpenseClaim = async (req, res, next) => {
  try {
    const { title, category, amount, date, description, receiptUrl } = req.body;

    const employee = await Employee.findOne({ userId: req.user._id, isDeleted: false });
    if (!employee) {
      return sendError(res, 'Employee profile required to file expense claim.', [], 400);
    }

    const claim = await ExpenseClaim.create({
      employeeId: employee._id,
      title,
      category,
      amount: Number(amount),
      date: new Date(date || Date.now()),
      description: description || '',
      receiptUrl: receiptUrl || (req.file ? `/uploads/${req.file.filename}` : ''),
      status: 'Pending',
    });

    await logAudit({
      req,
      action: 'EXPENSE_CLAIM_SUBMITTED',
      entity: 'ExpenseClaim',
      entityId: claim._id,
      details: { amount: claim.amount, title: claim.title },
    });

    return sendSuccess(res, 'Expense claim submitted successfully.', { claim }, 201);
  } catch (error) {
    next(error);
  }
};

export const reviewExpenseClaim = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, remarks } = req.body; // 'Approved', 'Rejected', 'Reimbursed'

    if (!['Approved', 'Rejected', 'Reimbursed'].includes(status)) {
      return sendError(res, "Status must be 'Approved', 'Rejected', or 'Reimbursed'.", [], 400);
    }

    const claim = await ExpenseClaim.findById(id);
    if (!claim) return sendError(res, 'Expense claim not found.', [], 404);

    if (req.user.role === ROLES.EMPLOYEE) {
      return sendError(res, 'Access denied: Employees cannot approve or reject expense claims.', [], 403);
    }

    if (req.user.role === ROLES.MANAGER) {
      const applicant = await Employee.findById(claim.employeeId);
      if (
        !applicant ||
        !applicant.managerId ||
        !req.verifiedEmployeeId ||
        applicant.managerId.toString() !== req.verifiedEmployeeId.toString()
      ) {
        return sendError(res, 'Access denied: You can only review expense claims for your direct reporting team.', [], 403);
      }
    }

    claim.status = status;
    claim.approvedBy = req.user._id;
    claim.reviewRemarks = remarks || '';
    claim.reviewedAt = new Date();
    await claim.save();

    await logAudit({
      req,
      action: `EXPENSE_${status.toUpperCase()}`,
      entity: 'ExpenseClaim',
      entityId: claim._id,
      details: { status, reviewer: req.user.email, amount: claim.amount },
    });

    return sendSuccess(res, `Expense claim ${status.toLowerCase()}.`, { claim });
  } catch (error) {
    next(error);
  }
};

