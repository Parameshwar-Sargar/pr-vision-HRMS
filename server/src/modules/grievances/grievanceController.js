import Grievance from '../../models/Grievance.js';
import Employee from '../../models/Employee.js';
import { ROLES } from '../../config/constants.js';
import { sendSuccess, sendError } from '../../utils/responseUtils.js';
import { logAudit } from '../../middleware/auditMiddleware.js';

export const getGrievances = async (req, res, next) => {
  try {
    const { status, category, priority } = req.query;
    const query = {};

    if (req.user.role === ROLES.EMPLOYEE) {
      const myEmp = await Employee.findOne({ userId: req.user._id, isDeleted: false });
      if (!myEmp) return sendSuccess(res, 'No tickets found.', { grievances: [] });
      query.employeeId = myEmp._id;
    }

    if (status) query.status = status;
    if (category) query.category = category;
    if (priority) query.priority = priority;

    const grievances = await Grievance.find(query)
      .populate('employeeId', 'firstName lastName employeeId departmentId')
      .populate('assignedTo', 'name email')
      .sort({ createdAt: -1 });

    return sendSuccess(res, 'Grievance tickets retrieved.', { grievances });
  } catch (error) {
    next(error);
  }
};

export const submitGrievance = async (req, res, next) => {
  try {
    const { category, priority, subject, description, isConfidential } = req.body;

    const employee = await Employee.findOne({ userId: req.user._id, isDeleted: false });
    if (!employee) {
      return sendError(res, 'Employee record required to raise a grievance.', [], 400);
    }

    const count = await Grievance.countDocuments();
    const ticketNumber = `GRV-${new Date().getFullYear()}-${String(count + 1).padStart(4, '0')}`;

    const grievance = await Grievance.create({
      ticketNumber,
      employeeId: employee._id,
      category,
      priority: priority || 'Medium',
      subject,
      description,
      isConfidential: isConfidential || false,
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
    const { status, assignedTo, resolutionNotes } = req.body;

    const grievance = await Grievance.findById(id);
    if (!grievance) return sendError(res, 'Grievance not found.', [], 404);

    if (status) grievance.status = status;
    if (assignedTo) grievance.assignedTo = assignedTo;
    if (resolutionNotes) grievance.resolutionNotes = resolutionNotes;
    if (status === 'Resolved' || status === 'Closed') {
      grievance.resolvedDate = new Date();
    }

    await grievance.save();

    await logAudit({
      req,
      action: `GRIEVANCE_${status.toUpperCase()}`,
      entity: 'Grievance',
      entityId: grievance._id,
      details: { status, ticketNumber: grievance.ticketNumber },
    });

    return sendSuccess(res, 'Grievance updated.', { grievance });
  } catch (error) {
    next(error);
  }
};
