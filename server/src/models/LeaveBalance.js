import mongoose from 'mongoose';

const balanceItemSchema = new mongoose.Schema(
  {
    leaveTypeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'LeaveType',
      required: true,
    },
    allocated: {
      type: Number,
      required: true,
      default: 0,
    },
    used: {
      type: Number,
      required: true,
      default: 0,
    },
    pending: {
      type: Number,
      required: true,
      default: 0,
    },
    remaining: {
      type: Number,
      required: true,
      default: 0,
    },
  },
  { _id: false }
);

const leaveBalanceSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true,
    },
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee',
      required: true,
    },
    year: {
      type: Number,
      required: true,
      default: () => new Date().getFullYear(),
    },
    balances: [balanceItemSchema],
  },
  {
    timestamps: true,
  }
);

leaveBalanceSchema.index({ tenantId: 1, employeeId: 1, year: 1 }, { unique: true });

export default mongoose.model('LeaveBalance', leaveBalanceSchema);

