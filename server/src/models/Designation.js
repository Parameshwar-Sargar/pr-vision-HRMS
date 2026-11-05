import mongoose from 'mongoose';

const designationSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: [true, 'Designation title is required'],
      trim: true,
    },
    code: {
      type: String,
      trim: true,
      uppercase: true,
    },
    departmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Department',
      required: true,
    },
    level: {
      type: Number,
      default: 1,
    },
    description: {
      type: String,
      default: '',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

designationSchema.index({ tenantId: 1, title: 1, departmentId: 1 }, { unique: true });
designationSchema.index({ tenantId: 1, departmentId: 1 });

export default mongoose.model('Designation', designationSchema);

