import TrainingProgram from '../../models/TrainingProgram.js';
import TrainingAssignment from '../../models/TrainingAssignment.js';
import Employee from '../../models/Employee.js';
import { ROLES } from '../../config/constants.js';
import { sendSuccess, sendError } from '../../utils/responseUtils.js';

export const getTrainingPrograms = async (req, res, next) => {
  try {
    const { category, status } = req.query;
    const query = {};
    if (category) query.category = category;
    if (status) query.status = status;

    const [programs, counts] = await Promise.all([
      TrainingProgram.find(query).sort({ startDate: 1 }).lean(),
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

    return sendSuccess(res, 'Training programs retrieved.', { programs: programsWithCount });
  } catch (error) {
    next(error);
  }
};

export const createTrainingProgram = async (req, res, next) => {
  try {
    const { title, category, trainerName, description, startDate, endDate, durationHours, mode } = req.body;
    const program = await TrainingProgram.create({
      title,
      category,
      trainerName,
      description,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      durationHours: Number(durationHours) || 8,
      mode: mode || 'Online',
    });
    return sendSuccess(res, 'Training program created successfully.', { program }, 201);
  } catch (error) {
    next(error);
  }
};

export const updateTrainingProgram = async (req, res, next) => {
  try {
    const { id } = req.params;
    const program = await TrainingProgram.findById(id);
    if (!program) return sendError(res, 'Training program not found.', [], 404);

    Object.assign(program, req.body);
    if (req.body.startDate) program.startDate = new Date(req.body.startDate);
    if (req.body.endDate) program.endDate = new Date(req.body.endDate);
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

    if (!Array.isArray(employeeIds) || employeeIds.length === 0) {
      return sendError(res, 'Please provide an array of employee IDs to enroll.', [], 400);
    }

    const assignments = [];
    for (const empId of employeeIds) {
      const existing = await TrainingAssignment.findOne({ programId: id, employeeId: empId });
      if (!existing) {
        const doc = await TrainingAssignment.create({
          programId: id,
          employeeId: empId,
          status: 'Enrolled',
        });
        assignments.push(doc);
      }
    }

    return sendSuccess(res, `Successfully enrolled ${assignments.length} employees into training.`, { assignments }, 201);
  } catch (error) {
    next(error);
  }
};

export const getTrainingAssignments = async (req, res, next) => {
  try {
    const { programId, employeeId } = req.query;
    const query = {};

    if (req.user.role === ROLES.EMPLOYEE) {
      if (!req.verifiedEmployeeId) return sendSuccess(res, 'No assignments found.', { assignments: [] });
      query.employeeId = req.verifiedEmployeeId;
    } else if (req.user.role === ROLES.MANAGER) {
      if (!req.verifiedEmployeeId) return sendSuccess(res, 'No assignments found.', { assignments: [] });
      const team = await Employee.find({ managerId: req.verifiedEmployeeId, isDeleted: false }).select('_id');
      const allowedIds = [...team.map((t) => t._id), req.verifiedEmployeeId];
      if (employeeId) {
        if (!allowedIds.some((id) => id.toString() === employeeId.toString())) {
          return sendError(res, 'Access denied: You can only view training assignments for your reporting team.', [], 403);
        }
        query.employeeId = employeeId;
      } else {
        query.employeeId = { $in: allowedIds };
      }
    } else if (employeeId) {
      query.employeeId = employeeId;
    }

    if (programId) query.programId = programId;

    const assignments = await TrainingAssignment.find(query)
      .populate('programId')
      .populate('employeeId', 'firstName lastName employeeId departmentId')
      .sort({ createdAt: -1 });

    return sendSuccess(res, 'Training assignments retrieved.', { assignments });
  } catch (error) {
    next(error);
  }
};

export const updateAssignmentProgress = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, score, feedback } = req.body;

    const assignment = await TrainingAssignment.findById(id);
    if (!assignment) return sendError(res, 'Assignment not found.', [], 404);

    if (status) assignment.status = status;
    if (score !== undefined) assignment.score = score;
    if (feedback !== undefined) assignment.feedback = feedback;
    if (status === 'Completed') assignment.completedDate = new Date();

    await assignment.save();
    return sendSuccess(res, 'Training progress updated.', { assignment });
  } catch (error) {
    next(error);
  }
};

