import { z } from 'zod';
import JobOpening from '../../models/JobOpening.js';
import Candidate from '../../models/Candidate.js';
import { sendSuccess, sendError } from '../../utils/responseUtils.js';

const jobOpeningSchema = z.object({
  title: z.string().min(2, 'Job title is required'),
  departmentId: z.string().min(1, 'Department is required'),
  designationId: z.string().optional(),
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
    const jobs = await JobOpening.find({ tenantId: req.tenantId })
      .populate('departmentId', 'name')
      .populate('designationId', 'title')
      .sort({ createdAt: -1 });

    const jobsWithCandidateCounts = await Promise.all(
      jobs.map(async (job) => {
        const count = await Candidate.countDocuments({ tenantId: req.tenantId, jobOpeningId: job._id });
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
      tenantId: req.tenantId,
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

    const job = await JobOpening.findOne({ _id: id, tenantId: req.tenantId });
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
    const query = { tenantId: req.tenantId };

    if (jobOpeningId) query.jobOpeningId = jobOpeningId;
    if (status) query.status = status;

    const candidates = await Candidate.find(query)
      .populate('jobOpeningId', 'title departmentId')
      .sort({ appliedDate: -1 });

    return sendSuccess(res, 'Candidates retrieved.', { candidates });
  } catch (error) {
    next(error);
  }
};

export const addCandidate = async (req, res, next) => {
  try {
    const validated = candidateSchema.parse(req.body);
    const candidate = await Candidate.create({
      tenantId: req.tenantId,
      ...validated,
    });
    return sendSuccess(res, 'Candidate registered successfully.', { candidate }, 201);
  } catch (error) {
    next(error);
  }
};

export const updateCandidateStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, rating, notes, interviewSchedule } = req.body;

    const candidate = await Candidate.findOne({ _id: id, tenantId: req.tenantId });
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

