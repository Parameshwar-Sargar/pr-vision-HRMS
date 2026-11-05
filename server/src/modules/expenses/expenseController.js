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
      const myEmp = await Employee.findOne({ userId: req.user._id, isDeleted: false });
      if (!myEmp) return sendSuccess(res, 'No records found.', { claims: [] });
      query.employeeId = myEmp._id;
    } else if (req.user.role === ROLES.MANAGER) {
      const myEmp = await Employee.findOne({ userId: req.user._id, isDeleted: false });
      if (myEmp) {
        const team = await Employee.find({ managerId: myEmp._id, isDeleted: false }).select('_id');
        query.$or = [{ employeeId: myEmp._id }, { employeeId: { $in: team.map((t) => t._id) } }];
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

