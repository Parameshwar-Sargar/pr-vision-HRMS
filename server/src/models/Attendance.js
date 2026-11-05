import mongoose from 'mongoose';
import { ATTENDANCE_STATUS } from '../config/constants.js';

const attendanceSchema = new mongoose.Schema(
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
    date: {
      type: Date,
      required: true,
    },
    checkInTime: {
      type: Date,
    },
    checkOutTime: {
      type: Date,
    },
    status: {
      type: String,
      enum: Object.values(ATTENDANCE_STATUS),
      default: ATTENDANCE_STATUS.PRESENT,
    },
    totalHours: {
      type: Number,
      default: 0,
    },
    overtimeHours: {
      type: Number,
      default: 0,
    },
    ipAddress: {
      type: String,
    },
    location: {
      type: String,
    },
    notes: {
      type: String,
      default: '',
    },
    correctionRequest: {
      isRequested: { type: Boolean, default: false },
      requestedCheckIn: Date,
      requestedCheckOut: Date,
      reason: String,
      status: {
        type: String,
        enum: ['None', 'Pending', 'Approved', 'Rejected'],
        default: 'None',
      },
      reviewedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
      reviewNotes: String,
    },
  },
  {
    timestamps: true,
  }
);

// Crucial: Compound index preventing duplicate daily records per employee per tenant
attendanceSchema.index({ tenantId: 1, employeeId: 1, date: 1 }, { unique: true });
attendanceSchema.index({ tenantId: 1, date: 1 });
attendanceSchema.index({ tenantId: 1, status: 1 });

export default mongoose.model('Attendance', attendanceSchema);

