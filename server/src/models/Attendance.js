import mongoose from 'mongoose';
import { ATTENDANCE_STATUS } from '../config/constants.js';

const attendanceSchema = new mongoose.Schema(
  {
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
    shiftId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Shift',
      default: null,
    },
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
      default: null,
    },
    clockMethod: {
      type: String,
      enum: ['Web', 'Biometric', 'Mobile', 'Manual'],
      default: 'Web',
    },
    biometricLogId: {
      type: String,
      default: null,
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

// One record per employee per day
attendanceSchema.index({ employeeId: 1, date: 1 }, { unique: true });
attendanceSchema.index({ date: 1 });
attendanceSchema.index({ date: -1, status: 1 });
attendanceSchema.index({ status: 1 });
attendanceSchema.index({ branchId: 1 });
attendanceSchema.index({ createdAt: -1 });

export default mongoose.model('Attendance', attendanceSchema);
