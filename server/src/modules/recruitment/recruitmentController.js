import { z } from 'zod';
import JobOpening from '../../models/JobOpening.js';
import Candidate from '../../models/Candidate.js';
import Employee from '../../models/Employee.js';
import User from '../../models/User.js';
import Department from '../../models/Department.js';
import { ROLES, LIFECYCLE_STAGES, ROLE_DEFAULT_PERMISSIONS } from '../../config/constants.js';
import { sendSuccess, sendError } from '../../utils/responseUtils.js';
import { logAudit } from '../../middleware/auditMiddleware.js';

const jobOpeningSchema = z.object({
  title: z.string().min(2, 'Job title is required'),
  departmentId: z.string().min(1, 'Department is required'),
  designationId: z.string().optional().nullable(),
  branchId: z.string().optional().nullable(),
  openingsCount: z.number().default(1),
  location: z.string().default('Hybrid / On-site'),
  type: z.enum(['Full-Time', 'Part-Time', 'Contract', 'Internship', 'Remote']).default('Full-Time'),
  experienceRequired: z.string().default('1-3 years'),
  description: z.string().min(5, 'Description is required'),
  requirements: z.array(z.string()).default([]),
  status: z.enum(['Draft', 'Open', 'Closed', 'On Hold']).default('Open'),
  deadline: z.string().optional(),
});

const candidateSchema = z.object({
  jobOpeningId: z.string().min(1, 'Job Opening is required'),
  fullName: z.string().min(2, 'Candidate name is required'),
  email: z.string().email('Invalid email address'),
  phone: z.string().optional().default(''),
  currentCompany: z.string().optional().default(''),
  currentCtc: z.number().optional().default(0),
  expectedCtc: z.number().optional().default(0),
  noticePeriodDays: z.number().optional().default(30),
  resumeUrl: z.string().optional().default(''),
  notes: z.string().optional().default(''),
});

// Job Openings
export const getJobOpenings = async (req, res, next) => {
  try {
    const jobs = await JobOpening.find()
      .populate('departmentId', 'name')
      .populate('designationId', 'title')
      .populate('branchId', 'name code')
      .sort({ createdAt: -1 });

    const jobsWithCandidateCounts = await Promise.all(
      jobs.map(async (job) => {
        const count = await Candidate.countDocuments({ jobOpeningId: job._id });
        const obj = job.toObject();
        obj.candidateCount = count;
        return obj;
      })
    );

    return sendSuccess(res, 'Job openings retrieved.', { jobs: jobsWithCandidateCounts });
  } catch (error) {
    next(error);
  }
};

export const createJobOpening = async (req, res, next) => {
  try {
    const validated = jobOpeningSchema.parse(req.body);
    const job = await JobOpening.create({
      ...validated,
      deadline: validated.deadline ? new Date(validated.deadline) : undefined,
    });
    return sendSuccess(res, 'Job opening created.', { job }, 201);
  } catch (error) {
    next(error);
  }
};

export const updateJobOpening = async (req, res, next) => {
  try {
    const { id } = req.params;
    const validated = jobOpeningSchema.parse(req.body);

    const job = await JobOpening.findById(id);
    if (!job) return sendError(res, 'Job opening not found.', [], 404);

    Object.assign(job, validated);
    if (validated.deadline) job.deadline = new Date(validated.deadline);
    await job.save();

    return sendSuccess(res, 'Job opening updated.', { job });
  } catch (error) {
    next(error);
  }
};

// Candidates
export const getCandidates = async (req, res, next) => {
  try {
    const { jobOpeningId, status } = req.query;
    const query = {};

    if (jobOpeningId) query.jobOpeningId = jobOpeningId;
    if (status) query.status = status;

    const candidates = await Candidate.find(query)
      .populate({
        path: 'jobOpeningId',
        select: 'title departmentId',
        populate: { path: 'departmentId', select: 'name' },
      })
      .populate('convertedToEmployeeId', 'employeeId firstName lastName email')
      .sort({ appliedDate: -1 });

    return sendSuccess(res, 'Candidates retrieved.', { candidates });
  } catch (error) {
    next(error);
  }
};

export const addCandidate = async (req, res, next) => {
  try {
    const validated = candidateSchema.parse(req.body);
    const candidate = await Candidate.create(validated);
    return sendSuccess(res, 'Candidate registered successfully.', { candidate }, 201);
  } catch (error) {
    next(error);
  }
};

export const updateCandidateStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, rating, notes, interviewSchedule } = req.body;

    const candidate = await Candidate.findById(id);
    if (!candidate) return sendError(res, 'Candidate not found.', [], 404);

    if (status) candidate.status = status;
    if (rating !== undefined) candidate.rating = rating;
    if (notes !== undefined) candidate.notes = notes;
    if (interviewSchedule) candidate.interviewSchedule = interviewSchedule;

    await candidate.save();
    return sendSuccess(res, 'Candidate status updated.', { candidate });
  } catch (error) {
    next(error);
  }
};

/**
 * Convert Hired Candidate to Employee
 */
export const convertCandidateToEmployee = async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      branchId,
      departmentId: customDeptId,
      designationId: customDesigId,
      joiningDate = new Date(),
      probationPeriodMonths = 3,
      password = 'Welcome@123',
    } = req.body;

    const candidate = await Candidate.findById(id).populate('jobOpeningId');
    if (!candidate) {
      return sendError(res, 'Candidate not found.', [], 404);
    }

    if (candidate.convertedToEmployeeId) {
      return sendError(res, 'This candidate has already been converted to an employee.', [], 400);
    }

    // Split name
    const nameParts = candidate.fullName.trim().split(' ');
    const firstName = nameParts[0] || 'Employee';
    const lastName = nameParts.slice(1).join(' ') || 'Team';

    const departmentId = customDeptId || candidate.jobOpeningId?.departmentId;
    const designationId = customDesigId || candidate.jobOpeningId?.designationId;

    if (!departmentId) {
      return sendError(res, 'Department is required to onboard this candidate.', [], 400);
    }

    // Generate unique employee ID
    const count = await Employee.countDocuments();
    const employeeId = `PRV-${String(count + 1).padStart(4, '0')}`;

    // Provision user account
    let user = await User.findOne({ email: candidate.email.toLowerCase() });
    if (!user) {
      user = await User.create({
        name: candidate.fullName,
        email: candidate.email.toLowerCase(),
        password,
        role: ROLES.EMPLOYEE,
        branchId: branchId || null,
        permissions: ROLE_DEFAULT_PERMISSIONS.EMPLOYEE,
      });
    }

    const employee = await Employee.create({
      employeeId,
      firstName,
      lastName,
      email: candidate.email.toLowerCase(),
      phone: candidate.phone || '',
      departmentId,
      designationId: designationId || null,
      branchId: branchId || candidate.jobOpeningId?.branchId || null,
      userId: user._id,
      joiningDate: new Date(joiningDate),
      lifecycleStage: LIFECYCLE_STAGES.PROBATION,
      probationPeriodMonths,
      employmentStatus: 'Active',
    });

    candidate.status = 'Hired';
    candidate.convertedToEmployeeId = employee._id;
    await candidate.save();

    await logAudit({
      req,
      action: 'CANDIDATE_CONVERTED_TO_EMPLOYEE',
      entity: 'Candidate',
      entityId: candidate._id,
      details: { employeeId: employee.employeeId, employeeName: candidate.fullName },
    });

    return sendSuccess(res, 'Candidate successfully converted and onboarded as an Employee.', {
      candidate,
      employee,
    }, 201);
  } catch (error) {
    next(error);
  }
};
