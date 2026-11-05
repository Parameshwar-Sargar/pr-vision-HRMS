import mongoose from 'mongoose';

const componentSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      enum: ['earning', 'deduction'],
      required: true,
    },
    calculationType: {
      type: String,
      enum: ['flat', 'percentage_of_basic', 'percentage_of_gross'],
      default: 'flat',
    },
    value: {
      type: Number,
      required: true,
      default: 0,
    },
    isStatutory: {
      type: Boolean,
      default: false,
    },
  },
  { _id: false }
);

const salaryStructureSchema = new mongoose.Schema(
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
    basicSalary: {
      type: Number,
      required: true,
      default: 0,
    },
    hra: {
      type: Number,
      default: 0,
    },
    specialAllowance: {
      type: Number,
      default: 0,
    },
    customComponents: [componentSchema],
    statutoryConfig: {
      pfEnabled: { type: Boolean, default: true },
      pfEmployeeRate: { type: Number, default: 12 }, // 12% of basic
      esiEnabled: { type: Boolean, default: false },
      esiEmployeeRate: { type: Number, default: 0.75 }, // 0.75% of gross
      professionalTax: { type: Number, default: 200 }, // Flat monthly PT
      tdsDeduction: { type: Number, default: 0 },
      isVerifiedByProfessional: { type: Boolean, default: false },
    },
    effectiveFrom: {
      type: Date,
      default: Date.now,
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

salaryStructureSchema.index({ tenantId: 1, employeeId: 1, isActive: 1 });

export default mongoose.model('SalaryStructure', salaryStructureSchema);

