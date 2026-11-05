import mongoose from 'mongoose';
import { TENANT_STATUS } from '../config/constants.js';

const tenantSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Company name is required'],
      trim: true,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    domain: {
      type: String,
      trim: true,
      lowercase: true,
    },
    logo: {
      type: String,
      default: '',
    },
    address: {
      street: { type: String, default: '' },
      city: { type: String, default: '' },
      state: { type: String, default: '' },
      country: { type: String, default: 'India' },
      postalCode: { type: String, default: '' },
    },
    contactEmail: {
      type: String,
      required: [true, 'Contact email is required'],
      lowercase: true,
      trim: true,
    },
    contactPhone: {
      type: String,
      default: '',
    },
    businessInfo: {
      taxId: { type: String, default: '' },
      registrationNumber: { type: String, default: '' },
      industry: { type: String, default: 'Technology' },
      website: { type: String, default: '' },
    },
    settings: {
      timezone: { type: String, default: 'Asia/Kolkata' },
      currency: { type: String, default: 'INR' },
      dateFormat: { type: String, default: 'DD/MM/YYYY' },
      workingDays: {
        type: [String],
        default: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
      },
      standardWorkHoursPerDay: { type: Number, default: 8 },
    },
    status: {
      type: String,
      enum: Object.values(TENANT_STATUS),
      default: TENANT_STATUS.ACTIVE,
    },
    planId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Plan',
    },
    planName: {
      type: String,
      default: 'Growth',
    },
    employeeLimit: {
      type: Number,
      default: 50,
    },
    trialEndsAt: {
      type: Date,
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

tenantSchema.index({ status: 1 });
tenantSchema.index({ contactEmail: 1 });

export default mongoose.model('Tenant', tenantSchema);
