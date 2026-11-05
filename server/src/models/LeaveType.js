import mongoose from 'mongoose';

const leaveTypeSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    code: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
    },
    description: {
      type: String,
      default: '',
    },
    defaultDaysPerYear: {
      type: Number,
      required: true,
      default: 12,
    },
    isPaid: {
      type: Boolean,
      default: true,
    },
    isEncashable: {
      type: Boolean,
      default: false,
    },
    requiresApproval: {
      type: Boolean,
      default: true,
    },
    accrualFrequency: {
      type: String,
      enum: ['Yearly', 'Monthly', 'Quarterly'],
      default: 'Yearly',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model('LeaveType', leaveTypeSchema);
