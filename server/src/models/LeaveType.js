import mongoose from 'mongoose';

const leaveTypeSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    code: {
      type: String,
      required: true,
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
    requiresApproval: {
      type: Boolean,
      default: true,
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

leaveTypeSchema.index({ tenantId: 1, code: 1 }, { unique: true });

export default mongoose.model('LeaveType', leaveTypeSchema);

