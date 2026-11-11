import PerformanceReview from '../../models/PerformanceReview.js';
import Employee from '../../models/Employee.js';
import { ROLES } from '../../config/constants.js';
import { sendSuccess, sendError } from '../../utils/responseUtils.js';

export const getPerformanceReviews = async (req, res, next) => {
  try {
    const { employeeId, reviewCycle } = req.query;
    const query = {};

    if (req.user.role === ROLES.EMPLOYEE) {
      if (!req.verifiedEmployeeId) return sendSuccess(res, 'No records', { reviews: [] });
      query.employeeId = req.verifiedEmployeeId;
    } else if (req.user.role === ROLES.MANAGER) {
      if (!req.verifiedEmployeeId) return sendSuccess(res, 'No records', { reviews: [] });
      const team = await Employee.find({ managerId: req.verifiedEmployeeId, isDeleted: false }).select('_id');
      const allowedIds = [...team.map((t) => t._id), req.verifiedEmployeeId];
      if (employeeId) {
        if (!allowedIds.some((id) => id.toString() === employeeId.toString())) {
          return sendError(res, 'Access denied: You can only view performance reviews for your direct reporting team.', [], 403);
        }
        query.employeeId = employeeId;
      } else {
        query.employeeId = { $in: allowedIds };
      }
    } else if (employeeId) {
      query.employeeId = employeeId;
    }

    if (reviewCycle) query.reviewCycle = reviewCycle;

    const reviews = await PerformanceReview.find(query)
      .populate('employeeId', 'firstName lastName employeeId departmentId designationId')
      .populate('reviewerId', 'name email')
      .sort({ createdAt: -1 });

    return sendSuccess(res, 'Performance reviews retrieved.', { reviews });
  } catch (error) {
    next(error);
  }
};

export const createPerformanceReview = async (req, res, next) => {
  try {
    const { employeeId, reviewCycle, goals } = req.body;

    const exists = await PerformanceReview.findOne({
      employeeId,
      reviewCycle,
    });
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
    const { selfRating, goals, comments } = req.body;

    const review = await PerformanceReview.findById(id);
    if (!review) return sendError(res, 'Review not found.', [], 404);

    if (req.user.role === ROLES.EMPLOYEE) {
      if (!req.verifiedEmployeeId || review.employeeId.toString() !== req.verifiedEmployeeId.toString()) {
        return sendError(res, 'Access denied: You can only submit self-evaluations for your own performance review.', [], 403);
      }
    }

    if (selfRating) review.selfRating = selfRating;
    if (goals) review.goals = goals;
    if (comments) review.comments = comments;
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
    const { managerRating, finalScore, strengths, areasForImprovement, comments, pipDetails } = req.body;

    const review = await PerformanceReview.findById(id);
    if (!review) return sendError(res, 'Review not found.', [], 404);

    if (req.user.role === ROLES.EMPLOYEE) {
      return sendError(res, 'Access denied: Employees cannot submit manager evaluations.', [], 403);
    }

    if (req.user.role === ROLES.MANAGER) {
      const applicant = await Employee.findById(review.employeeId);
      if (
        !applicant ||
        !applicant.managerId ||
        !req.verifiedEmployeeId ||
        applicant.managerId.toString() !== req.verifiedEmployeeId.toString()
      ) {
        return sendError(res, 'Access denied: You can only evaluate performance reviews for your direct reporting team.', [], 403);
      }
    }

    if (managerRating) review.managerRating = managerRating;
    if (finalScore) review.finalScore = finalScore;
    if (strengths) review.strengths = strengths;
    if (areasForImprovement) review.areasForImprovement = areasForImprovement;
    if (comments) review.comments = comments;
    if (pipDetails) review.pipDetails = pipDetails;
    review.status = 'Completed';
    review.completedDate = new Date();

    await review.save();
    return sendSuccess(res, 'Performance evaluation completed.', { review });
  } catch (error) {
    next(error);
  }
};
