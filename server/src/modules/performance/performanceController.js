import PerformanceReview from '../../models/PerformanceReview.js';
import Employee from '../../models/Employee.js';
import { ROLES } from '../../config/constants.js';
import { sendSuccess, sendError } from '../../utils/responseUtils.js';

export const getPerformanceReviews = async (req, res, next) => {
  try {
    const tenantId = req.tenantId;
    const { employeeId, reviewCycle } = req.query;

    const query = { tenantId };

    if (req.user.role === ROLES.EMPLOYEE) {
      const myEmp = await Employee.findOne({ tenantId, userId: req.user._id });
      if (!myEmp) return sendSuccess(res, 'No records', { reviews: [] });
      query.employeeId = myEmp._id;
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
      tenantId: req.tenantId,
      employeeId,
      reviewCycle,
    });
    if (exists) {
      return sendError(res, `A review for cycle '${reviewCycle}' already exists for this employee.`, [], 409);
    }

    const review = await PerformanceReview.create({
      tenantId: req.tenantId,
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

    const review = await PerformanceReview.findOne({ _id: id, tenantId: req.tenantId });
    if (!review) return sendError(res, 'Review not found.', [], 404);

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
    const { managerRating, finalScore, strengths, areasForImprovement, comments } = req.body;

    const review = await PerformanceReview.findOne({ _id: id, tenantId: req.tenantId });
    if (!review) return sendError(res, 'Review not found.', [], 404);

    if (managerRating) review.managerRating = managerRating;
    if (finalScore) review.finalScore = finalScore;
    if (strengths) review.strengths = strengths;
    if (areasForImprovement) review.areasForImprovement = areasForImprovement;
    if (comments) review.comments = comments;
    review.status = 'Completed';
    review.completedDate = new Date();

    await review.save();
    return sendSuccess(res, 'Performance evaluation completed.', { review });
  } catch (error) {
    next(error);
  }
};

