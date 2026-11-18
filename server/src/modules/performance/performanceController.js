import { z } from 'zod';
import PerformanceReview from '../../models/PerformanceReview.js';
import Employee from '../../models/Employee.js';
import { ROLES } from '../../config/constants.js';
import { sendSuccess, sendError, parsePagination, buildPaginationMeta } from '../../utils/responseUtils.js';
import { isAdminRole, isAdminOrHR, isValidObjectId } from '../../utils/securityUtils.js';

const goalItemSchema = z.object({
  title: z.string().trim().min(1, 'Goal title is required'),
  description: z.string().trim().optional().default(''),
  weightage: z.coerce.number().min(0).max(100).optional().default(0),
  status: z.enum(['Not Started', 'In Progress', 'Achieved', 'Partially Achieved', 'Missed']).optional().default('Not Started'),
  progress: z.coerce.number().min(0).max(100).optional().default(0),
});

const createReviewSchema = z.object({
  employeeId: z.string().min(1, 'Employee is required'),
  reviewCycle: z.string().trim().min(2, 'Review cycle is required'),
  goals: z.array(goalItemSchema).optional().default([]),
});

const selfReviewSchema = z.object({
  selfRating: z.coerce.number().min(1).max(5).optional(),
  goals: z.array(goalItemSchema).optional(),
  comments: z.string().optional(),
});

const managerReviewSchema = z.object({
  managerRating: z.coerce.number().min(1).max(5).optional(),
  finalScore: z.coerce.number().min(1).max(5).optional(),
  strengths: z.string().optional(),
  areasForImprovement: z.string().optional(),
  comments: z.string().optional(),
  pipDetails: z
    .object({
      isPipRecommended: z.boolean().optional(),
      durationDays: z.coerce.number().min(0).optional(),
      improvementTargets: z.string().optional(),
    })
    .optional(),
});

export const getPerformanceReviews = async (req, res, next) => {
  try {
    const { employeeId, reviewCycle, status } = req.query;
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
      const team = await Employee.find({
        managerId: req.verifiedEmployeeId,
        isDeleted: false,
      })
        .select('_id')
        .lean();
      const allowedIds = [...team.map((t) => t._id), req.verifiedEmployeeId];
      if (employeeId) {
        if (!allowedIds.some((id) => id.toString() === employeeId.toString())) {
          return sendError(
            res,
            'Access denied: You can only view performance reviews for your direct reporting team.',
            [],
            403
          );
        }
        query.employeeId = employeeId;
      } else {
        query.employeeId = { $in: allowedIds };
      }
    } else {
      // EMPLOYEE, RECRUITER, PAYROLL_ADMIN strictly scoped to self
      if (!req.verifiedEmployeeId) {
        return sendError(res, 'Access denied: No active employee profile linked to your account.', [], 403);
      }
      if (employeeId && String(employeeId) !== req.verifiedEmployeeId.toString()) {
        return sendError(
          res,
          'Access denied: You can only view your own performance reviews.',
          [],
          403
        );
      }
      query.employeeId = req.verifiedEmployeeId;
    }

    if (reviewCycle) query.reviewCycle = reviewCycle;
    if (status) query.status = status;

    const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 50, maxLimit: 200 });

    const [reviews, total] = await Promise.all([
      PerformanceReview.find(query)
        .populate('employeeId', 'firstName lastName employeeId departmentId designationId')
        .populate('reviewerId', 'name email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      PerformanceReview.countDocuments(query),
    ]);

    return sendSuccess(res, 'Performance reviews retrieved.', {
      reviews,
      pagination: buildPaginationMeta(total, page, limit),
    });
  } catch (error) {
    next(error);
  }
};

export const createPerformanceReview = async (req, res, next) => {
  try {
    const validated = createReviewSchema.parse(req.body);
    const { employeeId, reviewCycle, goals } = validated;
    if (!isValidObjectId(employeeId)) {
      return sendError(res, 'Invalid employee ID format.', [], 400);
    }

    const targetEmployee = await Employee.findOne({ _id: employeeId, isDeleted: false })
      .select('_id managerId')
      .lean();
    if (!targetEmployee) {
      return sendError(res, 'Target employee not found.', [], 404);
    }

    // Manager may initiate reviews ONLY for their direct reporting team
    if (req.user.role === ROLES.MANAGER) {
      if (
        !req.verifiedEmployeeId ||
        !targetEmployee.managerId ||
        targetEmployee.managerId.toString() !== req.verifiedEmployeeId.toString()
      ) {
        return sendError(
          res,
          'Access denied: You can only initiate performance reviews for your direct reporting team.',
          [],
          403
        );
      }
    }

    const exists = await PerformanceReview.findOne({
      employeeId,
      reviewCycle,
    })
      .select('_id')
      .lean();
    if (exists) {
      return sendError(res, `A review for cycle '${reviewCycle}' already exists for this employee.`, [], 409);
    }

    const review = await PerformanceReview.create({
      employeeId,
      reviewerId: req.user._id,
      reviewCycle,
      goals: goals || [],
      status: 'Self Review Pending',
    });

    return sendSuccess(res, 'Performance review cycle initiated.', { review }, 201);
  } catch (error) {
    next(error);
  }
};

export const submitEmployeeSelfReview = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return sendError(res, 'Invalid performance review ID.', [], 400);
    }
    const validated = selfReviewSchema.parse(req.body);

    const review = await PerformanceReview.findById(id);
    if (!review) return sendError(res, 'Review not found.', [], 404);

    if (review.status === 'Completed') {
      return sendError(res, 'Completed performance reviews cannot be modified.', [], 400);
    }

    const isOwner =
      req.verifiedEmployeeId && review.employeeId.toString() === req.verifiedEmployeeId.toString();
    if (!isOwner && !isAdminRole(req.user.role)) {
      return sendError(
        res,
        'Access denied: You can only submit self-evaluations for your own performance review.',
        [],
        403
      );
    }

    if (validated.selfRating !== undefined) review.selfRating = validated.selfRating;
    if (validated.goals !== undefined) review.goals = validated.goals;
    if (validated.comments !== undefined) review.comments = validated.comments;
    review.status = 'Manager Review Pending';

    await review.save();
    return sendSuccess(res, 'Self-review submitted successfully.', { review });
  } catch (error) {
    next(error);
  }
};

export const submitManagerReview = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return sendError(res, 'Invalid performance review ID.', [], 400);
    }
    const validated = managerReviewSchema.parse(req.body);

    const review = await PerformanceReview.findById(id);
    if (!review) return sendError(res, 'Review not found.', [], 404);

    if (!isAdminOrHR(req.user.role) && req.user.role !== ROLES.MANAGER) {
      return sendError(res, 'Access denied: Insufficient permissions to submit manager evaluation.', [], 403);
    }

    if (req.user.role === ROLES.MANAGER) {
      const applicant = await Employee.findById(review.employeeId)
        .select('managerId')
        .lean();
      if (
        !applicant ||
        !applicant.managerId ||
        !req.verifiedEmployeeId ||
        applicant.managerId.toString() !== req.verifiedEmployeeId.toString()
      ) {
        return sendError(res, 'Access denied: You can only evaluate performance reviews for your direct reporting team.', [], 403);
      }
    }

    if (validated.managerRating !== undefined) review.managerRating = validated.managerRating;
    if (validated.finalScore !== undefined) {
      review.finalScore = validated.finalScore;
    } else if (validated.managerRating !== undefined) {
      review.finalScore = validated.managerRating;
    }
    if (validated.strengths !== undefined) review.strengths = validated.strengths;
    if (validated.areasForImprovement !== undefined) review.areasForImprovement = validated.areasForImprovement;
    if (validated.comments !== undefined) review.comments = validated.comments;
    if (validated.pipDetails !== undefined) review.pipDetails = validated.pipDetails;
    review.status = 'Completed';
    review.completedDate = new Date();

    await review.save();
    return sendSuccess(res, 'Performance evaluation completed.', { review });
  } catch (error) {
    next(error);
  }
};
