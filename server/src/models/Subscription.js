import mongoose from 'mongoose';

const subscriptionSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true,
    },
    planId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Plan',
      required: true,
    },
    status: {
      type: String,
      enum: ['active', 'past_due', 'cancelled', 'trialing'],
      default: 'active',
    },
    billingCycle: {
      type: String,
      enum: ['monthly', 'yearly'],
      default: 'monthly',
    },
    amount: {
      type: Number,
      required: true,
      default: 0,
    },
    currency: {
      type: String,
      default: 'INR',
    },
    currentPeriodStart: {
      type: Date,
      default: Date.now,
    },
    currentPeriodEnd: {
      type: Date,
      required: true,
    },
    invoices: [
      {
        invoiceId: String,
        amount: Number,
        paidAt: Date,
        status: { type: String, default: 'Paid' },
        pdfUrl: String,
      },
    ],
  },
  {
    timestamps: true,
  }
);

subscriptionSchema.index({ tenantId: 1, status: 1 });

export default mongoose.model('Subscription', subscriptionSchema);

