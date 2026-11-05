import mongoose from 'mongoose';

const shiftSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Shift name is required'],
      trim: true,
      unique: true,
    },
    code: {
      type: String,
      trim: true,
      uppercase: true,
    },
    startTime: {
      type: String,
      required: true,
      default: '09:00',
    },
    endTime: {
      type: String,
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
      type: [Number],
      default: [0, 6], // Sun, Sat
    },
    isNightShift: {
      type: Boolean,
      default: false,
    },
    isRotational: {
      type: Boolean,
      default: false,
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

export default mongoose.model('Shift', shiftSchema);
