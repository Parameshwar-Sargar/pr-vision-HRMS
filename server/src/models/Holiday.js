import mongoose from 'mongoose';

const holidaySchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: [true, 'Holiday name is required'],
      trim: true,
    },
    date: {
      type: Date,
      required: true,
    },
    year: {
      type: Number,
      required: true,
      default: () => new Date().getFullYear(),
    },
    description: {
      type: String,
      default: '',
    },
    isOptional: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

holidaySchema.index({ tenantId: 1, date: 1 }, { unique: true });
holidaySchema.index({ tenantId: 1, year: 1 });

export default mongoose.model('Holiday', holidaySchema);

