import mongoose from 'mongoose';

const shiftSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: [true, 'Shift name is required'],
      trim: true,
    },
    startTime: {
      type: String, // HH:mm format e.g. "09:00"
      required: true,
      default: '09:00',
    },
    endTime: {
      type: String, // HH:mm format e.g. "18:00"
      required: true,
      default: '18:00',
    },
    breakDurationMinutes: {
      type: Number,
      default: 60,
    },
    gracePeriodMinutes: {
      type: Number,
      default: 15,
    },
    weeklyOffDays: {
      type: [Number], // 0 for Sunday, 6 for Saturday
      default: [0, 6],
    },
    isDefault: {
      type: Boolean,
      default: false,
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

shiftSchema.index({ tenantId: 1, name: 1 });

export default mongoose.model('Shift', shiftSchema);

