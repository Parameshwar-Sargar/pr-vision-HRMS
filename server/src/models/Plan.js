import mongoose from 'mongoose';

const planSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
    },
    code: {
      type: String,
      required: true,
      unique: true,
      enum: ['free_trial', 'starter', 'growth', 'business', 'enterprise'],
    },
    description: {
      type: String,
      default: '',
    },
    priceMonthly: {
      type: Number,
      required: true,
      default: 0,
    },
    priceYearly: {
      type: Number,
      required: true,
      default: 0,
    },
    maxEmployees: {
      type: Number,
      required: true,
      default: 10,
    },
    features: [
      {
        type: String,
      },
    ],
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model('Plan', planSchema);

