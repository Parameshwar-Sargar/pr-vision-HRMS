import mongoose from 'mongoose';
import { LIFECYCLE_STAGES } from '../config/constants.js';

const employeeSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    employeeId: {
      type: String,
      required: [true, 'Employee code/ID is required'],
      unique: true,
      trim: true,
      uppercase: true,
    },
    firstName: {
      type: String,
      required: [true, 'First name is required'],
      trim: true,
    },
    lastName: {
      type: String,
      required: [true, 'Last name is required'],
      trim: true,
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
    },
    phone: {
      type: String,
      default: '',
    },
    avatar: {
      type: String,
      default: '',
    },
    dateOfBirth: {
      type: Date,
    },
    gender: {
      type: String,
      enum: ['Male', 'Female', 'Non-Binary', 'Other'],
      default: 'Male',
    },
    joiningDate: {
      type: Date,
      default: Date.now,
    },
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
      default: null,
    },
    departmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Department',
      required: true,
    },
    designationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Designation',
      default: null,
    },
    managerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee',
      default: null,
    },
    shiftId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Shift',
      default: null,
    },
    employmentType: {
      type: String,
      enum: ['Full-Time', 'Part-Time', 'Contract', 'Intern'],
      default: 'Full-Time',
    },
    employmentStatus: {
      type: String,
      enum: ['Active', ...Object.values(LIFECYCLE_STAGES)],
      default: LIFECYCLE_STAGES.PROBATION,
    },
    // Lifecycle Tracking
    probationPeriodMonths: {
      type: Number,
      default: 3,
    },
    probationEndDate: {
      type: Date,
    },
    confirmationDate: {
      type: Date,
    },
    resignationDate: {
      type: Date,
    },
    noticePeriodDays: {
      type: Number,
      default: 30,
    },
    lastWorkingDate: {
      type: Date,
    },
    exitInterviewNotes: {
      type: String,
      default: '',
    },
    fullAndFinalSettlementStatus: {
      type: String,
      enum: ['Not Applicable', 'Pending', 'Processed', 'Settled'],
      default: 'Not Applicable',
    },
    relievingLetterIssued: {
      type: Boolean,
      default: false,
    },
    experienceLetterIssued: {
      type: Boolean,
      default: false,
    },
    address: {
      street: { type: String, default: '' },
      city: { type: String, default: '' },
      state: { type: String, default: '' },
      postalCode: { type: String, default: '' },
      country: { type: String, default: 'India' },
    },
    emergencyContact: {
      name: { type: String, default: '' },
      relationship: { type: String, default: '' },
      phone: { type: String, default: '' },
    },
    bankDetails: {
      accountHolderName: { type: String, default: '' },
      accountNumber: { type: String, default: '' },
      bankName: { type: String, default: '' },
      ifscCode: { type: String, default: '' },
      branch: { type: String, default: '' },
    },
    education: [
      {
        degree: String,
        institution: String,
        passingYear: Number,
        gradeOrPercentage: String,
      },
    ],
    previousEmployment: [
      {
        companyName: String,
        designation: String,
        fromDate: Date,
        toDate: Date,
        lastDrawnCtc: Number,
      },
    ],
    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

employeeSchema.virtual('fullName').get(function () {
  return `${this.firstName} ${this.lastName}`.trim();
});

employeeSchema.index({ departmentId: 1 });
employeeSchema.index({ branchId: 1 });
employeeSchema.index({ managerId: 1 });
employeeSchema.index({ employmentStatus: 1 });
employeeSchema.index({ isDeleted: 1 });

export default mongoose.model('Employee', employeeSchema);
