import mongoose from 'mongoose';

const candidateSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true,
    },
    jobOpeningId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'JobOpening',
      required: true,
    },
    fullName: {
      type: String,
      required: [true, 'Candidate name is required'],
      trim: true,
    },
    email: {
      type: String,
      required: [true, 'Candidate email is required'],
      lowercase: true,
      trim: true,
    },
    phone: {
      type: String,
      default: '',
    },
    resumeUrl: {
      type: String,
      default: '',
    },
    currentCompany: {
      type: String,
      default: '',
    },
    currentCtc: {
      type: Number,
      default: 0,
    },
    expectedCtc: {
      type: Number,
      default: 0,
    },
    noticePeriodDays: {
      type: Number,
      default: 30,
    },
    status: {
      type: String,
      enum: ['Applied', 'Screening', 'Interviewing', 'Offered', 'Hired', 'Rejected'],
      default: 'Applied',
    },
    interviewSchedule: {
      scheduledDate: Date,
      interviewer: String,
      round: String,
      feedback: String,
    },
    rating: {
      type: Number,
      min: 1,
      max: 5,
      default: 3,
    },
    notes: {
      type: String,
      default: '',
    },
    appliedDate: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

candidateSchema.index({ tenantId: 1, jobOpeningId: 1, status: 1 });
candidateSchema.index({ tenantId: 1, email: 1 });

export default mongoose.model('Candidate', candidateSchema);

