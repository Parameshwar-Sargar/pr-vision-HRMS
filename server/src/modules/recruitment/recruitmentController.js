import { z } from 'zod';
import JobOpening from '../../models/JobOpening.js';
import Candidate from '../../models/Candidate.js';
import Employee from '../../models/Employee.js';
import User from '../../models/User.js';
import LeaveType from '../../models/LeaveType.js';
import LeaveBalance from '../../models/LeaveBalance.js';
import { ROLES, LIFECYCLE_STAGES, ROLE_DEFAULT_PERMISSIONS } from '../../config/constants.js';
import { isValidObjectId } from '../../utils/securityUtils.js';
import { sendSuccess, sendError, parsePagination, buildPaginationMeta } from '../../utils/responseUtils.js';
import { logAudit } from '../../middleware/auditMiddleware.js';

const CANDIDATE_STATUSES = ['Applied', 'Screening', 'Interviewing', 'Offered', 'Hired', 'Rejected'];
const INTERVIEW_MODES = ['Video', 'In-Person', 'Phone', 'Technical Round', 'HR Round'];

const jobOpeningSchema = z.object({
  title: z.string().trim().min(2, 'Job title is required'),
  departmentId: z.string().min(1, 'Department is required'),
  designationId: z.string().optional().nullable(),
  branchId: z.string().optional().nullable(),
  openingsCount: z.coerce.number().int().min(1, 'Openings count must be at least 1').default(1),
  location: z.string().trim().default('Hybrid / On-site'),
  type: z.enum(['Full-Time', 'Part-Time', 'Contract', 'Internship', 'Remote']).default('Full-Time'),
  experienceRequired: z.string().trim().default('1-3 years'),
  description: z.string().trim().min(5, 'Description is required'),
  requirements: z.array(z.string()).default([]),
  status: z.enum(['Draft', 'Open', 'Closed', 'On Hold']).default('Open'),
  deadline: z.string().optional().nullable(),
});

const interviewScheduleSchema = z
  .object({
    scheduledAt: z.string().optional().nullable(),
    interviewerName: z.string().trim().optional().default(''),
    mode: z.enum(INTERVIEW_MODES).optional().default('Video'),
    meetingLink: z.string().trim().optional().default(''),
  })
  .optional()
  .nullable();

const candidateSchema = z.object({
  jobOpeningId: z.string().min(1, 'Job Opening is required'),
  fullName: z.string().trim().min(2, 'Candidate name is required'),
  email: z.string().trim().email('Invalid email address'),
  phone: z.string().trim().optional().default(''),
  currentCompany: z.string().trim().optional().default(''),
  currentCtc: z.coerce.number().min(0).optional().default(0),
  expectedCtc: z.coerce.number().min(0).optional().default(0),
  noticePeriodDays: z.coerce.number().int().min(0).optional().default(30),
  resumeUrl: z.string().trim().optional().default(''),
  notes: z.string().trim().optional().default(''),
  interviewSchedule: interviewScheduleSchema,
});

const normalizeOptionalId = (val) => (val && String(val).trim() ? String(val).trim() : null);

// Job Openings
export const getJobOpenings = async (req, res, next) => {
  try {
    const { status, departmentId } = req.query;
    const query = {};
    if (status) query.status = status;
    if (departmentId) {
      if (!isValidObjectId(departmentId)) {
        return sendError(res, 'Invalid department ID format.', [], 400);
      }
      query.departmentId = departmentId;
    }

    const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 50, maxLimit: 200 });

    const [jobs, total, candidateCounts] = await Promise.all([
      JobOpening.find(query)
        .populate('departmentId', 'name')
        .populate('designationId', 'title')
        .populate('branchId', 'name code')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      JobOpening.countDocuments(query),
      Candidate.aggregate([
        { $group: { _id: '$jobOpeningId', count: { $sum: 1 } } },
      ]),
    ]);

    const countMap = new Map(
      candidateCounts
        .filter((c) => c._id != null)
        .map((c) => [c._id.toString(), c.count])
    );

    const jobsWithCandidateCounts = jobs.map((job) => ({
      ...job,
      candidateCount: countMap.get(job._id.toString()) || 0,
    }));

    return sendSuccess(res, 'Job openings retrieved.', {
      jobs: jobsWithCandidateCounts,
      pagination: buildPaginationMeta(total, page, limit),
    });
  } catch (error) {
    next(error);
  }
};

export const createJobOpening = async (req, res, next) => {
  try {
    const validated = jobOpeningSchema.parse(req.body);
    if (!isValidObjectId(validated.departmentId)) {
      return sendError(res, 'Invalid department ID.', [], 400);
    }
    const designationId = normalizeOptionalId(validated.designationId);
    const branchId = normalizeOptionalId(validated.branchId);
    if (designationId && !isValidObjectId(designationId)) {
      return sendError(res, 'Invalid designation ID.', [], 400);
    }
    if (branchId && !isValidObjectId(branchId)) {
      return sendError(res, 'Invalid branch ID.', [], 400);
    }

    let parsedDeadline;
    if (validated.deadline) {
      parsedDeadline = new Date(validated.deadline);
      if (Number.isNaN(parsedDeadline.getTime())) {
        return sendError(res, 'Invalid job deadline date.', [], 400);
      }
    }

    const job = await JobOpening.create({
      ...validated,
      designationId,
      branchId,
      deadline: parsedDeadline,
    });
    return sendSuccess(res, 'Job opening created.', { job }, 201);
  } catch (error) {
    next(error);
  }
};

export const updateJobOpening = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) return sendError(res, 'Invalid job opening ID.', [], 400);
    const validated = jobOpeningSchema.parse(req.body);
    if (!isValidObjectId(validated.departmentId)) {
      return sendError(res, 'Invalid department ID.', [], 400);
    }
    const designationId = normalizeOptionalId(validated.designationId);
    const branchId = normalizeOptionalId(validated.branchId);
    if (designationId && !isValidObjectId(designationId)) {
      return sendError(res, 'Invalid designation ID.', [], 400);
    }
    if (branchId && !isValidObjectId(branchId)) {
      return sendError(res, 'Invalid branch ID.', [], 400);
    }

    const job = await JobOpening.findById(id);
    if (!job) return sendError(res, 'Job opening not found.', [], 404);

    let parsedDeadline = job.deadline;
    if (validated.deadline === null || validated.deadline === '') {
      parsedDeadline = undefined;
    } else if (validated.deadline) {
      parsedDeadline = new Date(validated.deadline);
      if (Number.isNaN(parsedDeadline.getTime())) {
        return sendError(res, 'Invalid job deadline date.', [], 400);
      }
    }

    Object.assign(job, {
      ...validated,
      designationId,
      branchId,
      deadline: parsedDeadline,
    });
    await job.save();

    return sendSuccess(res, 'Job opening updated.', { job });
  } catch (error) {
    next(error);
  }
};

// Candidates
export const getCandidates = async (req, res, next) => {
  try {
    const { jobOpeningId, status, stage } = req.query;
    const query = {};

    if (jobOpeningId) {
      if (!isValidObjectId(jobOpeningId)) return sendError(res, 'Invalid job opening ID.', [], 400);
      query.jobOpeningId = jobOpeningId;
    }
    if (status) {
      query.status = status;
    } else if (stage) {
      query.status = stage;
    }

    const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 50, maxLimit: 200 });

    const candidateQuery = Candidate.find(query)
      .populate({
        path: 'jobOpeningId',
        select: 'title departmentId',
        populate: { path: 'departmentId', select: 'name' },
      })
      .populate('convertedToEmployeeId', 'employeeId firstName lastName email')
      .sort({ appliedDate: -1 })
      .skip(skip)
      .limit(limit);

    if (req.user?.role === ROLES.MANAGER) {
      candidateQuery.select('-currentCtc -expectedCtc');
    }

    const [candidates, total] = await Promise.all([
      candidateQuery.lean(),
      Candidate.countDocuments(query),
    ]);

    return sendSuccess(res, 'Candidates retrieved.', {
      candidates,
      pagination: buildPaginationMeta(total, page, limit),
    });
  } catch (error) {
    next(error);
  }
};

export const addCandidate = async (req, res, next) => {
  try {
    const validated = candidateSchema.parse(req.body);
    if (!isValidObjectId(validated.jobOpeningId)) {
      return sendError(res, 'Invalid job opening ID.', [], 400);
    }

    const job = await JobOpening.findById(validated.jobOpeningId).select('_id status title').lean();
    if (!job) {
      return sendError(res, 'Target job opening not found.', [], 404);
    }
    if (job.status === 'Closed') {
      return sendError(res, 'Cannot register candidates for a closed job opening.', [], 400);
    }

    const normalizedEmail = validated.email.trim().toLowerCase();
    const existingCandidate = await Candidate.findOne({
      jobOpeningId: validated.jobOpeningId,
      email: normalizedEmail,
    })
      .select('_id')
      .lean();
    if (existingCandidate) {
      return sendError(res, 'A candidate with this email is already registered for this job opening.', [], 409);
    }

    const candidate = await Candidate.create({
      ...validated,
      email: normalizedEmail,
      interviewSchedule: validated.interviewSchedule
        ? {
            ...validated.interviewSchedule,
            scheduledAt: validated.interviewSchedule.scheduledAt
              ? new Date(validated.interviewSchedule.scheduledAt)
              : null,
          }
        : undefined,
    });
    return sendSuccess(res, 'Candidate registered successfully.', { candidate }, 201);
  } catch (error) {
    next(error);
  }
};

export const updateCandidate = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) return sendError(res, 'Invalid candidate ID.', [], 400);

    const candidate = await Candidate.findById(id);
    if (!candidate) return sendError(res, 'Candidate not found.', [], 404);

    const updateSchema = candidateSchema.partial().extend({
      status: z.enum(CANDIDATE_STATUSES).optional(),
      rating: z.coerce.number().min(1).max(5).optional(),
    });
    const validated = updateSchema.parse(req.body);

    if (candidate.convertedToEmployeeId && validated.status && validated.status !== 'Hired') {
      return sendError(res, 'Converted candidates must remain in Hired status.', [], 400);
    }

    if (validated.email) {
      const normalizedEmail = validated.email.trim().toLowerCase();
      const targetJobId = validated.jobOpeningId || candidate.jobOpeningId;
      const duplicate = await Candidate.findOne({
        _id: { $ne: candidate._id },
        jobOpeningId: targetJobId,
        email: normalizedEmail,
      })
        .select('_id')
        .lean();
      if (duplicate) {
        return sendError(res, 'Another candidate with this email is already registered for this job opening.', [], 409);
      }
      validated.email = normalizedEmail;
    }

    if (validated.interviewSchedule !== undefined) {
      if (validated.interviewSchedule === null) {
        candidate.interviewSchedule = { scheduledAt: null, interviewerName: '', mode: 'Video', meetingLink: '' };
      } else {
        const sched = validated.interviewSchedule;
        let parsedAt = candidate.interviewSchedule?.scheduledAt || null;
        if (sched.scheduledAt === null || sched.scheduledAt === '') {
          parsedAt = null;
        } else if (sched.scheduledAt) {
          parsedAt = new Date(sched.scheduledAt);
          if (Number.isNaN(parsedAt.getTime())) {
            return sendError(res, 'Invalid interview schedule date/time.', [], 400);
          }
        }
        candidate.interviewSchedule = {
          scheduledAt: parsedAt,
          interviewerName: sched.interviewerName ?? candidate.interviewSchedule?.interviewerName ?? '',
          mode: sched.mode ?? candidate.interviewSchedule?.mode ?? 'Video',
          meetingLink: sched.meetingLink ?? candidate.interviewSchedule?.meetingLink ?? '',
        };
      }
      delete validated.interviewSchedule;
    }

    Object.assign(candidate, validated);
    await candidate.save();
    return sendSuccess(res, 'Candidate updated successfully.', { candidate });
  } catch (error) {
    next(error);
  }
};

export const updateCandidateStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) return sendError(res, 'Invalid candidate ID.', [], 400);
    const { status, rating, notes, interviewSchedule } = req.body;

    if (status && !CANDIDATE_STATUSES.includes(status)) {
      return sendError(res, 'Invalid candidate status value.', [], 400);
    }
    if (rating !== undefined && (Number.isNaN(Number(rating)) || Number(rating) < 1 || Number(rating) > 5)) {
      return sendError(res, 'Candidate rating must be between 1 and 5.', [], 400);
    }

    const candidate = await Candidate.findById(id);
    if (!candidate) return sendError(res, 'Candidate not found.', [], 404);

    if (candidate.convertedToEmployeeId && status && status !== 'Hired') {
      return sendError(res, 'Converted candidates must remain in Hired status.', [], 400);
    }

    if (status) candidate.status = status;
    if (rating !== undefined) candidate.rating = Number(rating);
    if (notes !== undefined) candidate.notes = notes;
    if (interviewSchedule) {
      let parsedAt = interviewSchedule.scheduledAt ? new Date(interviewSchedule.scheduledAt) : null;
      if (interviewSchedule.scheduledAt && Number.isNaN(parsedAt.getTime())) {
        return sendError(res, 'Invalid interview schedule date/time.', [], 400);
      }
      candidate.interviewSchedule = {
        scheduledAt: parsedAt,
        interviewerName: interviewSchedule.interviewerName || '',
        mode: INTERVIEW_MODES.includes(interviewSchedule.mode) ? interviewSchedule.mode : 'Video',
        meetingLink: interviewSchedule.meetingLink || '',
      };
    }

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
    if (!isValidObjectId(id)) return sendError(res, 'Invalid candidate ID.', [], 400);

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
    if (candidate.status === 'Rejected') {
      return sendError(res, 'Cannot convert a rejected candidate to an employee.', [], 400);
    }

    const parsedJoiningDate = new Date(joiningDate);
    if (Number.isNaN(parsedJoiningDate.getTime())) {
      return sendError(res, 'Invalid joining date.', [], 400);
    }

    const normalizedEmail = candidate.email.trim().toLowerCase();
    const [existingEmployee, existingUser] = await Promise.all([
      Employee.findOne({ email: normalizedEmail, isDeleted: false }).select('_id').lean(),
      User.findOne({ email: normalizedEmail }).select('_id').lean(),
    ]);
    if (existingEmployee || existingUser) {
      return sendError(res, 'An employee or user account with this email already exists.', [], 409);
    }

    // Split name
    const nameParts = candidate.fullName.trim().split(' ');
    const firstName = nameParts[0] || 'Employee';
    const lastName = nameParts.slice(1).join(' ') || 'Team';

    const departmentId = normalizeOptionalId(customDeptId) || candidate.jobOpeningId?.departmentId;
    const designationId = normalizeOptionalId(customDesigId) || candidate.jobOpeningId?.designationId || null;
    const resolvedBranchId = normalizeOptionalId(branchId) || candidate.jobOpeningId?.branchId || null;

    if (!departmentId || !isValidObjectId(departmentId)) {
      return sendError(res, 'A valid department is required to onboard this candidate.', [], 400);
    }
    if (designationId && !isValidObjectId(designationId)) {
      return sendError(res, 'Invalid designation ID.', [], 400);
    }
    if (resolvedBranchId && !isValidObjectId(resolvedBranchId)) {
      return sendError(res, 'Invalid branch ID.', [], 400);
    }

    // Generate collision-safe PRV-XXXX employee ID
    const [existingPrv, totalCount] = await Promise.all([
      Employee.find({ employeeId: /^PRV-\d{4,}$/ }).select('employeeId').lean(),
      Employee.countDocuments(),
    ]);
    let maxNum = 0;
    for (const e of existingPrv) {
      const parsedNum = parseInt(String(e.employeeId).replace(/^PRV-/, ''), 10);
      if (!Number.isNaN(parsedNum) && parsedNum > maxNum) maxNum = parsedNum;
    }
    let nextNum = Math.max(maxNum + 1, totalCount + 1);
    let employeeId = `PRV-${String(nextNum).padStart(4, '0')}`;
    while (await Employee.findOne({ employeeId }).select('_id').lean()) {
      nextNum += 1;
      employeeId = `PRV-${String(nextNum).padStart(4, '0')}`;
    }

    // Provision new user account
    const user = await User.create({
      name: candidate.fullName,
      email: normalizedEmail,
      password,
      role: ROLES.EMPLOYEE,
      branchId: resolvedBranchId,
      permissions: ROLE_DEFAULT_PERMISSIONS.EMPLOYEE,
    });

    const employee = await Employee.create({
      employeeId,
      firstName,
      lastName,
      email: normalizedEmail,
      phone: candidate.phone || '',
      departmentId,
      designationId,
      branchId: resolvedBranchId,
      userId: user._id,
      joiningDate: parsedJoiningDate,
      lifecycleStage: LIFECYCLE_STAGES.PROBATION,
      probationPeriodMonths,
      employmentStatus: 'Probation',
    });

    // Provision annual LeaveBalance for the newly converted employee
    const activeLeaveTypes = await LeaveType.find({ isActive: true }).select('_id defaultDaysPerYear').lean();
    if (activeLeaveTypes.length > 0) {
      await LeaveBalance.create({
        employeeId: employee._id,
        year: parsedJoiningDate.getFullYear(),
        balances: activeLeaveTypes.map((lt) => {
          const quota = lt.defaultDaysPerYear ?? 12;
          return {
            leaveTypeId: lt._id,
            allocated: quota,
            used: 0,
            pending: 0,
            remaining: quota,
          };
        }),
      });
    }

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
