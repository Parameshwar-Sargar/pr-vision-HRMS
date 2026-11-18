import fs from 'fs';
import path from 'path';
import { z } from 'zod';
import ExpenseClaim from '../../models/ExpenseClaim.js';
import Employee from '../../models/Employee.js';
import { ROLES } from '../../config/constants.js';
import { sendSuccess, sendError, parsePagination, buildPaginationMeta } from '../../utils/responseUtils.js';
import {
  isAdminOrHR,
  isPayrollPrivileged,
  isValidObjectId,
  resolveSafeUploadPath,
  safeDeleteFile,
  sanitizeDownloadFilename,
  validateUploadedFileMagicBytes,
} from '../../utils/securityUtils.js';
import { logAudit } from '../../middleware/auditMiddleware.js';

const expenseClaimSchema = z.object({
  title: z.string().trim().min(2, 'Expense claim title is required'),
  category: z
    .enum([
      'Travel',
      'Food & Dining',
      'Lodging / Accommodation',
      'Transport & Fuel',
      'Office Supplies',
      'Client Entertainment',
      'Other',
    ])
    .default('Travel'),
  amount: z.coerce.number().positive('Expense amount must be greater than 0'),
  date: z.string().optional(),
  description: z.string().max(1000).optional().default(''),
});

export const getExpenseClaims = async (req, res, next) => {
  try {
    const { status, employeeId } = req.query;
    const query = {};

    if (req.user.role === ROLES.MANAGER) {
      if (!req.verifiedEmployeeId) {
        return sendError(res, 'Access denied: No manager employee profile found.', [], 403);
      }
      const team = await Employee.find({ managerId: req.verifiedEmployeeId, isDeleted: false }).select('_id').lean();
      const allowedIds = [...team.map((t) => t._id), req.verifiedEmployeeId];
      if (employeeId) {
        if (!allowedIds.some((id) => id.toString() === String(employeeId))) {
          return sendError(res, 'Access denied: You can only view claims for yourself and your team.', [], 403);
        }
        query.employeeId = employeeId;
      } else {
        query.employeeId = { $in: allowedIds };
      }
    } else if (isPayrollPrivileged(req.user.role)) {
      if (employeeId) {
        if (!isValidObjectId(employeeId)) {
          return sendError(res, 'Invalid employee ID format.', [], 400);
        }
        query.employeeId = employeeId;
      }
    } else {
      // EMPLOYEE, RECRUITER, etc. strictly scoped to self only
      if (!req.verifiedEmployeeId) {
        return sendError(res, 'Access denied: No active employee profile linked to your account.', [], 403);
      }
      if (employeeId && String(employeeId) !== req.verifiedEmployeeId.toString()) {
        return sendError(res, "Access denied: You cannot view another employee's expense claims.", [], 403);
      }
      query.employeeId = req.verifiedEmployeeId;
    }

    if (status) query.status = status;

    const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 50, maxLimit: 200 });

    const [claims, total] = await Promise.all([
      ExpenseClaim.find(query)
        .populate('employeeId', 'firstName lastName employeeId departmentId')
        .populate('approvedBy', 'name email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      ExpenseClaim.countDocuments(query),
    ]);

    return sendSuccess(res, 'Expense claims retrieved.', {
      claims,
      pagination: buildPaginationMeta(total, page, limit),
    });
  } catch (error) {
    next(error);
  }
};

export const submitExpenseClaim = async (req, res, next) => {
  const uploadedPath = req.file?.path;
  try {
    if (!req.verifiedEmployeeId) {
      safeDeleteFile(uploadedPath);
      return sendError(res, 'Employee profile required to file expense claim.', [], 403);
    }

    if (req.file) {
      const magicCheck = validateUploadedFileMagicBytes(
        req.file.path,
        req.file.mimetype,
        req.file.originalname
      );
      if (!magicCheck.valid) {
        safeDeleteFile(uploadedPath);
        return sendError(res, magicCheck.reason || 'Invalid uploaded receipt file.', [], 400);
      }
    }

    const validated = expenseClaimSchema.parse(req.body);

    const claimDate = validated.date ? new Date(validated.date) : new Date();
    if (Number.isNaN(claimDate.getTime())) {
      if (req.file) safeDeleteFile(req.file.path);
      return sendError(res, 'Invalid expense date.', [], 400);
    }

    const claim = await ExpenseClaim.create({
      employeeId: req.verifiedEmployeeId,
      title: validated.title,
      category: validated.category,
      amount: validated.amount,
      date: claimDate,
      description: validated.description || '',
      receiptUrl: req.file ? `receipt:${req.file.filename}` : '',
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
    safeDeleteFile(uploadedPath);
    next(error);
  }
};

export const downloadExpenseReceipt = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return sendError(res, 'Invalid expense claim ID.', [], 400);
    }

    const claim = await ExpenseClaim.findById(id).lean();
    if (!claim || !claim.receiptUrl) {
      return sendError(res, 'Receipt not found.', [], 404);
    }

    const isOwner = req.verifiedEmployeeId && claim.employeeId.toString() === req.verifiedEmployeeId.toString();
    const privileged = isPayrollPrivileged(req.user.role);

    if (!privileged && !isOwner) {
      if (req.user.role === ROLES.MANAGER && req.verifiedEmployeeId) {
        const teamMember = await Employee.findOne({
          _id: claim.employeeId,
          managerId: req.verifiedEmployeeId,
          isDeleted: false,
        })
          .select('_id')
          .lean();
        if (!teamMember) {
          return sendError(res, 'Access denied: Receipt belongs outside your reporting team.', [], 403);
        }
      } else {
        return sendError(res, "Access denied: You cannot download another employee's receipt.", [], 403);
      }
    }

    const rawRef = claim.receiptUrl.startsWith('receipt:')
      ? claim.receiptUrl.slice('receipt:'.length)
      : path.basename(claim.receiptUrl);
    const filePath = resolveSafeUploadPath(rawRef);
    if (!filePath || !fs.existsSync(filePath)) {
      return sendError(res, 'Receipt file not found on server.', [], 404);
    }

    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-store');
    return res.download(filePath, sanitizeDownloadFilename(rawRef, 'receipt'));
  } catch (error) {
    next(error);
  }
};

export const reviewExpenseClaim = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, remarks } = req.body; // 'Approved', 'Rejected', 'Reimbursed'

    if (!isValidObjectId(id)) {
      return sendError(res, 'Invalid expense claim ID.', [], 400);
    }

    if (!['Approved', 'Rejected', 'Reimbursed'].includes(status)) {
      return sendError(res, "Status must be 'Approved', 'Rejected', or 'Reimbursed'.", [], 400);
    }

    if (status === 'Reimbursed' && !isPayrollPrivileged(req.user.role)) {
      return sendError(res, 'Access denied: Only Payroll Admin, HR Manager, or Admin can mark expenses as reimbursed.', [], 403);
    }

    const claim = await ExpenseClaim.findById(id);
    if (!claim) return sendError(res, 'Expense claim not found.', [], 404);

    if (req.user.role === ROLES.EMPLOYEE || req.user.role === ROLES.RECRUITER) {
      return sendError(res, 'Access denied: Insufficient permissions to review expense claims.', [], 403);
    }

    if (req.user.role === ROLES.MANAGER) {
      const applicant = await Employee.findById(claim.employeeId).select('managerId').lean();
      if (
        !applicant ||
        !applicant.managerId ||
        !req.verifiedEmployeeId ||
        applicant.managerId.toString() !== req.verifiedEmployeeId.toString()
      ) {
        return sendError(res, 'Access denied: You can only review expense claims for your direct reporting team.', [], 403);
      }
    } else if (!isAdminOrHR(req.user.role) && req.verifiedEmployeeId && claim.employeeId.toString() === req.verifiedEmployeeId.toString()) {
      return sendError(res, 'Access denied: You cannot approve or reimburse your own expense claim.', [], 403);
    }

    if (['Rejected', 'Reimbursed'].includes(claim.status)) {
      return sendError(res, `Expense claim is already ${claim.status.toLowerCase()} and cannot be modified.`, [], 400);
    }
    if (status === 'Reimbursed' && claim.status !== 'Approved') {
      return sendError(res, 'Only Approved expense claims can be marked as Reimbursed.', [], 400);
    }
    if (status !== 'Reimbursed' && claim.status !== 'Pending') {
      return sendError(res, 'Only Pending expense claims can be Approved or Rejected.', [], 400);
    }

    claim.status = status;
    claim.approvedBy = req.user._id;
    claim.notes = remarks || '';
    if (status === 'Reimbursed') {
      claim.reimbursedDate = new Date();
    }
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

