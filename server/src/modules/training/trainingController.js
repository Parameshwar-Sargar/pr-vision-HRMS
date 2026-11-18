import { z } from 'zod';
import TrainingProgram from '../../models/TrainingProgram.js';
import TrainingAssignment from '../../models/TrainingAssignment.js';
import Employee from '../../models/Employee.js';
import { ROLES } from '../../config/constants.js';
import { sendSuccess, sendError, parsePagination, buildPaginationMeta } from '../../utils/responseUtils.js';
import { isAdminOrHR, isValidObjectId } from '../../utils/securityUtils.js';

const TRAINING_CATEGORIES = ['Technical', 'Leadership', 'Soft Skills', 'Compliance & POSH', 'Sales', 'Product Training'];
const TRAINING_MODES = ['Online', 'Classroom', 'Hybrid', 'Self-Paced'];
const PROGRAM_STATUSES = ['Scheduled', 'In Progress', 'Completed', 'Cancelled'];
const ASSIGNMENT_STATUSES = ['Enrolled', 'In Progress', 'Completed', 'Dropped'];

const createProgramSchema = z.object({
  title: z.string().trim().min(2, 'Program title is required'),
  category: z.enum(TRAINING_CATEGORIES).default('Technical'),
  trainerName: z.string().trim().min(1, 'Trainer name is required'),
  description: z.string().trim().optional().default(''),
  startDate: z.string().min(1, 'Start date is required'),
  endDate: z.string().min(1, 'End date is required'),
  durationHours: z.coerce.number().min(1).default(8),
  mode: z.enum(TRAINING_MODES).default('Online'),
  status: z.enum(PROGRAM_STATUSES).optional().default('Scheduled'),
});

export const getTrainingPrograms = async (req, res, next) => {
  try {
    const { category, status } = req.query;
    const query = {};
    if (category) query.category = category;
    if (status) query.status = status;

    const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 50, maxLimit: 200 });

    const [programs, total, counts] = await Promise.all([
      TrainingProgram.find(query).sort({ startDate: 1 }).skip(skip).limit(limit).lean(),
      TrainingProgram.countDocuments(query),
      TrainingAssignment.aggregate([
        {
          $group: {
            _id: '$programId',
            enrolled: { $sum: 1 },
            completed: {
              $sum: { $cond: [{ $eq: ['$status', 'Completed'] }, 1, 0] },
            },
          },
        },
      ]),
    ]);

    const countMap = new Map(counts.map((c) => [c._id?.toString(), c]));
    const programsWithCount = programs.map((p) => {
      const c = countMap.get(p._id.toString());
      return {
        ...p,
        enrolledCount: c?.enrolled || 0,
        completedCount: c?.completed || 0,
      };
    });

    return sendSuccess(res, 'Training programs retrieved.', {
      programs: programsWithCount,
      pagination: buildPaginationMeta(total, page, limit),
    });
  } catch (error) {
    next(error);
  }
};

export const createTrainingProgram = async (req, res, next) => {
  try {
    const validated = createProgramSchema.parse(req.body);
    const start = new Date(validated.startDate);
    const end = new Date(validated.endDate);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return sendError(res, 'Invalid start date or end date.', [], 400);
    }
    if (end < start) {
      return sendError(res, 'End date cannot be earlier than start date.', [], 400);
    }

    const program = await TrainingProgram.create({
      ...validated,
      startDate: start,
      endDate: end,
    });
    return sendSuccess(res, 'Training program created successfully.', { program }, 201);
  } catch (error) {
    next(error);
  }
};

export const updateTrainingProgram = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return sendError(res, 'Invalid training program ID.', [], 400);
    }
    const program = await TrainingProgram.findById(id);
    if (!program) return sendError(res, 'Training program not found.', [], 404);

    const validated = createProgramSchema.partial().parse(req.body);
    const start = validated.startDate ? new Date(validated.startDate) : program.startDate;
    const end = validated.endDate ? new Date(validated.endDate) : program.endDate;
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return sendError(res, 'Invalid start date or end date.', [], 400);
    }
    if (end < start) {
      return sendError(res, 'End date cannot be earlier than start date.', [], 400);
    }

    Object.assign(program, {
      ...validated,
      startDate: start,
      endDate: end,
    });
    await program.save();

    return sendSuccess(res, 'Training program updated.', { program });
  } catch (error) {
    next(error);
  }
};

export const assignTraining = async (req, res, next) => {
  try {
    const { id } = req.params; // programId
    const { employeeIds } = req.body; // array of employee IDs

    if (!isValidObjectId(id)) {
      return sendError(res, 'Invalid training program ID.', [], 400);
    }

    const program = await TrainingProgram.findById(id).select('_id').lean();
    if (!program) {
      return sendError(res, 'Training program not found.', [], 404);
    }

    if (!Array.isArray(employeeIds) || employeeIds.length === 0) {
      return sendError(res, 'Please provide an array of employee IDs to enroll.', [], 400);
    }

    const uniqueEmpIds = [...new Set(employeeIds.map((empId) => String(empId)).filter(Boolean))];
    if (uniqueEmpIds.some((empId) => !isValidObjectId(empId))) {
      return sendError(res, 'One or more employee IDs are invalid.', [], 400);
    }

    // Manager may enroll ONLY active direct reporting team members (or active self)
    if (req.user.role === ROLES.MANAGER) {
      if (!req.verifiedEmployeeId) {
        return sendError(res, 'Access denied: No manager employee profile found.', [], 403);
      }
      const allowedEmployees = await Employee.find({
        $or: [{ managerId: req.verifiedEmployeeId }, { _id: req.verifiedEmployeeId }],
        isDeleted: false,
      })
        .select('_id')
        .lean();
      const allowedSet = new Set(allowedEmployees.map((emp) => emp._id.toString()));
      const unauthorized = uniqueEmpIds.filter((empId) => !allowedSet.has(empId));
      if (unauthorized.length > 0) {
        return sendError(
          res,
          'Access denied: Managers can only assign training to employees in their direct reporting line.',
          [],
          403
        );
      }
    } else {
      const activeEmployees = await Employee.find({
        _id: { $in: uniqueEmpIds },
        isDeleted: false,
      })
        .select('_id')
        .lean();
      if (activeEmployees.length !== uniqueEmpIds.length) {
        return sendError(res, 'One or more selected employees were not found.', [], 404);
      }
    }

    const existing = await TrainingAssignment.find({
      programId: id,
      employeeId: { $in: uniqueEmpIds },
    })
      .select('employeeId')
      .lean();

    const existingSet = new Set(existing.map((e) => e.employeeId.toString()));
    const toInsert = uniqueEmpIds
      .filter((empId) => !existingSet.has(empId))
      .map((empId) => ({
        programId: id,
        employeeId: empId,
        status: 'Enrolled',
      }));

    const assignments =
      toInsert.length > 0 ? await TrainingAssignment.insertMany(toInsert) : [];

    return sendSuccess(res, `Successfully enrolled ${assignments.length} employees into training.`, { assignments }, 201);
  } catch (error) {
    next(error);
  }
};

export const getTrainingAssignments = async (req, res, next) => {
  try {
    const { programId, employeeId } = req.query;
    const query = {};

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
      const team = await Employee.find({ managerId: req.verifiedEmployeeId, isDeleted: false }).select('_id').lean();
      const allowedIds = [...team.map((t) => t._id), req.verifiedEmployeeId];
      if (employeeId) {
        if (!allowedIds.some((id) => id.toString() === employeeId.toString())) {
          return sendError(res, 'Access denied: You can only view training assignments for your reporting team.', [], 403);
        }
        query.employeeId = employeeId;
      } else {
        query.employeeId = { $in: allowedIds };
      }
    } else {
      // EMPLOYEE, RECRUITER, PAYROLL_ADMIN strictly scoped to self
      if (!req.verifiedEmployeeId) {
        return sendSuccess(res, 'No assignments found.', { assignments: [] });
      }
      if (employeeId && String(employeeId) !== req.verifiedEmployeeId.toString()) {
        return sendError(res, 'Access denied: You can only view your own training assignments.', [], 403);
      }
      query.employeeId = req.verifiedEmployeeId;
    }

    if (programId) query.programId = programId;

    const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 50, maxLimit: 200 });

    const [assignments, total] = await Promise.all([
      TrainingAssignment.find(query)
        .populate('programId')
        .populate('employeeId', 'firstName lastName employeeId departmentId')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      TrainingAssignment.countDocuments(query),
    ]);

    return sendSuccess(res, 'Training assignments retrieved.', {
      assignments,
      pagination: buildPaginationMeta(total, page, limit),
    });
  } catch (error) {
    next(error);
  }
};

export const updateAssignmentProgress = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return sendError(res, 'Invalid training assignment ID.', [], 400);
    }
    const { status, score, feedback } = req.body;

    const assignment = await TrainingAssignment.findById(id);
    if (!assignment) return sendError(res, 'Assignment not found.', [], 404);

    // Ownership verification: owner employee, direct manager, HR Manager, or Admin
    const isOwner =
      req.verifiedEmployeeId && assignment.employeeId.toString() === req.verifiedEmployeeId.toString();

    if (!isOwner && !isAdminOrHR(req.user.role)) {
      if (req.user.role === ROLES.MANAGER && req.verifiedEmployeeId) {
        const directReport = await Employee.findOne({
          _id: assignment.employeeId,
          managerId: req.verifiedEmployeeId,
          isDeleted: false,
        })
          .select('_id')
          .lean();
        if (!directReport) {
          return sendError(
            res,
            'Access denied: You can only update training progress for yourself or direct reports.',
            [],
            403
          );
        }
      } else {
        return sendError(
          res,
          'Access denied: You cannot modify another employee’s training progress.',
          [],
          403
        );
      }
    }

    if (status !== undefined) {
      if (!ASSIGNMENT_STATUSES.includes(status)) {
        return sendError(res, 'Invalid training assignment status.', [], 400);
      }
      assignment.status = status;
    }
    if (score !== undefined && score !== null && score !== '') {
      const numericScore = Number(score);
      if (Number.isNaN(numericScore) || numericScore < 0 || numericScore > 100) {
        return sendError(res, 'Training score must be between 0 and 100.', [], 400);
      }
      assignment.score = numericScore;
    }
    if (feedback !== undefined) assignment.feedback = feedback;
    if (status === 'Completed') assignment.completedDate = new Date();

    await assignment.save();
    return sendSuccess(res, 'Training progress updated.', { assignment });
  } catch (error) {
    next(error);
  }
};

