import crypto from 'crypto';
import { z } from 'zod';
import Grievance from '../../models/Grievance.js';
import { ROLES } from '../../config/constants.js';
import { isAdminOrHR, isValidObjectId } from '../../utils/securityUtils.js';
import { sendSuccess, sendError, parsePagination, buildPaginationMeta } from '../../utils/responseUtils.js';
import { logAudit } from '../../middleware/auditMiddleware.js';

const submitGrievanceSchema = z.object({
  category: z.enum([
    'Workplace Harassment / POSH',
    'Payroll & Compensation',
    'Managerial Conflict',
    'Facility & Work Environment',
    'Discrimination',
    'Policy Clarification',
    'Other',
  ]),
  priority: z.enum(['Low', 'Medium', 'High', 'Urgent']).optional().default('Medium'),
  subject: z.string().trim().min(3).max(200),
  description: z.string().trim().min(5).max(5000),
  isConfidential: z.boolean().optional().default(false),
});

const updateGrievanceSchema = z.object({
  status: z.enum(['Open', 'Under Review', 'In Investigation', 'Resolved', 'Closed']).optional(),
  assignedTo: z.string().nullable().optional(),
  resolutionNotes: z.string().trim().max(4000).optional(),
});

export const getGrievances = async (req, res, next) => {
  try {
    const { status, category, priority, employeeId } = req.query;
    const query = {};

    if (isAdminOrHR(req.user.role)) {
      if (employeeId) {
        if (!isValidObjectId(employeeId)) {
          return sendError(res, 'Invalid employee ID format.', [], 400);
        }
        query.employeeId = employeeId;
      }
    } else if (req.user.role === ROLES.MANAGER) {
      if (employeeId && (!req.verifiedEmployeeId || String(employeeId) !== String(req.verifiedEmployeeId))) {
        return sendError(res, 'Access denied. You can only view your own or assigned grievance tickets.', [], 403);
      }
      if (req.verifiedEmployeeId) {
        query.$or = [
          { employeeId: req.verifiedEmployeeId },
          { assignedTo: req.user._id, isConfidential: { $ne: true } },
        ];
      } else {
        query.assignedTo = req.user._id;
        query.isConfidential = { $ne: true };
      }
    } else {
      if (employeeId && (!req.verifiedEmployeeId || String(employeeId) !== String(req.verifiedEmployeeId))) {
        return sendError(res, 'Access denied. You can only access your own grievance tickets.', [], 403);
      }
      if (!req.verifiedEmployeeId) return sendSuccess(res, 'No tickets found.', { grievances: [] });
      query.employeeId = req.verifiedEmployeeId;
    }

    if (status) query.status = status;
    if (category) query.category = category;
    if (priority) query.priority = priority;

    const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 50, maxLimit: 200 });

    const [grievances, total] = await Promise.all([
      Grievance.find(query)
        .populate('employeeId', 'firstName lastName employeeId departmentId')
        .populate('assignedTo', 'name email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Grievance.countDocuments(query),
    ]);

    return sendSuccess(res, 'Grievance tickets retrieved.', {
      grievances,
      pagination: buildPaginationMeta(total, page, limit),
    });
  } catch (error) {
    next(error);
  }
};

export const submitGrievance = async (req, res, next) => {
  try {
    if (!req.verifiedEmployeeId) {
      return sendError(res, 'Employee record required to raise a grievance.', [], 403);
    }

    const parsed = submitGrievanceSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(res, 'Validation failed.', parsed.error.flatten().fieldErrors, 400);
    }

    const { category, priority, subject, description, isConfidential } = parsed.data;
    const year = new Date().getFullYear();
    const count = await Grievance.countDocuments();
    let ticketNumber = `GRV-${year}-${String(count + 1).padStart(4, '0')}`;
    const existing = await Grievance.findOne({ ticketNumber }).select('_id').lean();
    if (existing) {
      ticketNumber = `GRV-${year}-${String(count + 1).padStart(4, '0')}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
    }

    const grievance = await Grievance.create({
      ticketNumber,
      employeeId: req.verifiedEmployeeId,
      category,
      priority,
      subject,
      description,
      isConfidential,
      status: 'Open',
    });

    await logAudit({
      req,
      action: 'GRIEVANCE_SUBMITTED',
      entity: 'Grievance',
      entityId: grievance._id,
      details: { ticketNumber, category, priority },
    });

    return sendSuccess(res, 'Grievance ticket created successfully.', { grievance }, 201);
  } catch (error) {
    next(error);
  }
};

export const updateGrievanceStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return sendError(res, 'Invalid grievance ID.', [], 400);
    }

    const parsed = updateGrievanceSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(res, 'Validation failed.', parsed.error.flatten().fieldErrors, 400);
    }

    const { status, assignedTo, resolutionNotes } = parsed.data;
    if (assignedTo && !isValidObjectId(assignedTo)) {
      return sendError(res, 'Invalid assignee user ID.', [], 400);
    }

    const grievance = await Grievance.findById(id);
    if (!grievance) return sendError(res, 'Grievance not found.', [], 404);

    if (!isAdminOrHR(req.user.role)) {
      const isAssignedManager =
        req.user.role === ROLES.MANAGER &&
        grievance.assignedTo &&
        String(grievance.assignedTo) === String(req.user._id) &&
        !grievance.isConfidential;
      if (!isAssignedManager) {
        return sendError(res, 'Access denied. Only HR/Admin or the assigned non-confidential handler can update this grievance.', [], 403);
      }
    }

    if (status !== undefined) grievance.status = status;
    if (assignedTo !== undefined) grievance.assignedTo = assignedTo || null;
    if (resolutionNotes !== undefined) grievance.resolutionNotes = resolutionNotes;
    if (status === 'Resolved' || status === 'Closed') {
      grievance.resolvedAt = new Date();
    }

    await grievance.save();

    await logAudit({
      req,
      action: status ? `GRIEVANCE_${status.toUpperCase().replace(/\s+/g, '_')}` : 'GRIEVANCE_UPDATED',
      entity: 'Grievance',
      entityId: grievance._id,
      details: { status: grievance.status, ticketNumber: grievance.ticketNumber },
    });

    return sendSuccess(res, 'Grievance updated.', { grievance });
  } catch (error) {
    next(error);
  }
};

