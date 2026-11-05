import mongoose from 'mongoose';
import { PAYROLL_STATUS } from '../config/constants.js';

const payrollRunSchema = new mongoose.Schema(
  {
    month: {
      type: Number,
      required: true,
      min: 1,
      max: 12,
    },
    year: {
      type: Number,
      required: true,
    },
    status: {
      type: String,
      enum: Object.values(PAYROLL_STATUS),
      default: PAYROLL_STATUS.DRAFT,
    },
    totalEmployees: {
      type: Number,
      default: 0,
    },
    totalGrossSalary: {
      type: Number,
      default: 0,
    },
    totalDeductions: {
      type: Number,
      default: 0,
    },
    totalNetSalary: {
      type: Number,
      default: 0,
    },
    processedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    paymentDate: {
      type: Date,
    },
    isLocked: {
      type: Boolean,
      default: false,
    },
    notes: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

payrollRunSchema.index({ month: 1, year: 1 }, { unique: true });
payrollRunSchema.index({ status: 1 });

export default mongoose.model('PayrollRun', payrollRunSchema);
