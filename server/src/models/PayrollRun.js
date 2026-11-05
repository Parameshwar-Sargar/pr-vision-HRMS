import mongoose from 'mongoose';
import { PAYROLL_STATUS } from '../config/constants.js';

const payrollRunSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true,
    },
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
    notes: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

payrollRunSchema.index({ tenantId: 1, month: 1, year: 1 }, { unique: true });
payrollRunSchema.index({ tenantId: 1, status: 1 });

export default mongoose.model('PayrollRun', payrollRunSchema);

