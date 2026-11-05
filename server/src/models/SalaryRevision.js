import mongoose from 'mongoose';

const salaryRevisionSchema = new mongoose.Schema(
  {
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee',
      required: true,
      index: true,
    },
    effectiveDate: {
      type: Date,
      required: true,
    },
    previousBasic: Number,
    newBasic: Number,
    previousGross: Number,
    newGross: Number,
    hikePercentage: Number,
    reason: {
      type: String,
      default: 'Annual Performance Appraisal',
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
  }
);

salaryRevisionSchema.index({ employeeId: 1, effectiveDate: -1 });

export default mongoose.model('SalaryRevision', salaryRevisionSchema);

