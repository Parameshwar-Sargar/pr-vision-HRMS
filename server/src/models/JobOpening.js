import mongoose from 'mongoose';

const jobOpeningSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: [true, 'Job title is required'],
      trim: true,
    },
    departmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Department',
      required: true,
    },
    designationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Designation',
    },
    openingsCount: {
      type: Number,
      default: 1,
      min: 1,
    },
    location: {
      type: String,
      default: 'Headquarters / Hybrid',
    },
    type: {
      type: String,
      enum: ['Full-Time', 'Part-Time', 'Contract', 'Internship', 'Remote'],
      default: 'Full-Time',
    },
    experienceRequired: {
      type: String,
      default: '2-4 years',
    },
    description: {
      type: String,
      required: true,
    },
    requirements: [String],
    status: {
      type: String,
      enum: ['Draft', 'Open', 'Closed', 'On Hold'],
      default: 'Open',
    },
    postedDate: {
      type: Date,
      default: Date.now,
    },
    deadline: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

jobOpeningSchema.index({ tenantId: 1, status: 1 });
jobOpeningSchema.index({ tenantId: 1, departmentId: 1 });

export default mongoose.model('JobOpening', jobOpeningSchema);

