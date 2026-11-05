import mongoose from 'mongoose';

const itemSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    amount: { type: Number, required: true, default: 0 },
  },
  { _id: false }
);

const payslipSchema = new mongoose.Schema(
  {
    payrollRunId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PayrollRun',
      required: true,
    },
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee',
      required: true,
    },
    month: {
      type: Number,
      required: true,
    },
    year: {
      type: Number,
      required: true,
    },
    payslipNumber: {
      type: String,
      required: true,
    },
    basicSalary: {
      type: Number,
      required: true,
      default: 0,
    },
    earnings: [itemSchema],
    deductions: [itemSchema],
    grossSalary: {
      type: Number,
      required: true,
      default: 0,
    },
    totalDeductions: {
      type: Number,
      required: true,
      default: 0,
    },
    netSalary: {
      type: Number,
      required: true,
      default: 0,
    },
    workingDays: {
      type: Number,
      default: 30,
    },
    presentDays: {
      type: Number,
      default: 30,
    },
    lopDays: {
      type: Number,
      default: 0,
    },
    paymentStatus: {
      type: String,
      enum: ['Pending', 'Paid'],
      default: 'Pending',
    },
    paymentDate: {
      type: Date,
    },
    calculationSnapshot: {
      type: mongoose.Schema.Types.Mixed,
    },
  },
  {
    timestamps: true,
  }
);

payslipSchema.index({ employeeId: 1, month: 1, year: 1 }, { unique: true });
payslipSchema.index({ payrollRunId: 1 });

export default mongoose.model('Payslip', payslipSchema);
