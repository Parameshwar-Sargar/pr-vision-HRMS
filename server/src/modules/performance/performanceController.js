import PerformanceReview from '../../models/PerformanceReview.js';
import Employee from '../../models/Employee.js';
import { ROLES } from '../../config/constants.js';
import { sendSuccess, sendError, parsePagination, buildPaginationMeta } from '../../utils/responseUtils.js';
import { isAdminRole, isAdminOrHR, isValidObjectId } from '../../utils/securityUtils.js';

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
    const { employeeId, reviewCycle, goals } = req.body;
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
    const { selfRating, goals, comments } = req.body;

    const review = await PerformanceReview.findById(id);
    if (!review) return sendError(res, 'Review not found.', [], 404);

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

    if (selfRating !== undefined) review.selfRating = selfRating;
    if (goals !== undefined) review.goals = goals;
    if (comments !== undefined) review.comments = comments;
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
    const { managerRating, finalScore, strengths, areasForImprovement, comments, pipDetails } = req.body;

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

    if (managerRating !== undefined) review.managerRating = managerRating;
    if (finalScore !== undefined) review.finalScore = finalScore;
    if (strengths !== undefined) review.strengths = strengths;
    if (areasForImprovement !== undefined) review.areasForImprovement = areasForImprovement;
    if (comments !== undefined) review.comments = comments;
    if (pipDetails !== undefined) review.pipDetails = pipDetails;
    review.status = 'Completed';
    review.completedDate = new Date();

    await review.save();
    return sendSuccess(res, 'Performance evaluation completed.', { review });
  } catch (error) {
    next(error);
  }
};
