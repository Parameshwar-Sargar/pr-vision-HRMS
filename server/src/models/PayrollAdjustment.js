import mongoose from 'mongoose';

const payrollAdjustmentSchema = new mongoose.Schema(
  {
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee',
      required: true,
      index: true,
    },
    leaveRequestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'LeaveRequest',
      required: true,
      index: true,
    },
    sourcePayrollRunId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PayrollRun',
      default: null,
    },
    sourcePayslipId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Payslip',
      default: null,
    },
    sourceMonth: {
      type: Number,
      required: true,
      min: 1,
      max: 12,
    },
    sourceYear: {
      type: Number,
      required: true,
    },
    targetMonth: {
      type: Number,
      min: 1,
      max: 12,
      default: null,
    },
    targetYear: {
      type: Number,
      default: null,
    },
    adjustmentCategory: {
      type: String,
      enum: ['APPROVED_LEAVE_CANCELLATION'],
      default: 'APPROVED_LEAVE_CANCELLATION',
    },
    adjustmentType: {
      type: String,
      enum: ['CREDIT', 'DEDUCTION'],
      required: true,
    },
    days: {
      type: Number,
      required: true,
      min: 0.5,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    reason: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ['Pending', 'Approved', 'Applied', 'Waived'],
      default: 'Pending',
      index: true,
    },
    appliedPayrollRunId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PayrollRun',
      default: null,
    },
    appliedPayslipId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Payslip',
      default: null,
    },
    appliedAt: {
      type: Date,
      default: null,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    reviewedAt: {
      type: Date,
      default: null,
    },
    reviewNotes: {
      type: String,
      trim: true,
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

// Prevent duplicate adjustments for the same leave cancellation and source payroll period
payrollAdjustmentSchema.index({ leaveRequestId: 1, sourceMonth: 1, sourceYear: 1 }, { unique: true });
payrollAdjustmentSchema.index({ employeeId: 1, status: 1 });
payrollAdjustmentSchema.index({ createdAt: -1 });
payrollAdjustmentSchema.index({ employeeId: 1, createdAt: -1 });
payrollAdjustmentSchema.index({ status: 1, createdAt: -1 });

export default mongoose.model('PayrollAdjustment', payrollAdjustmentSchema);
