import mongoose from 'mongoose';

const expenseClaimSchema = new mongoose.Schema(
  {
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee',
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    category: {
      type: String,
      enum: [
        'Travel',
        'Food & Dining',
        'Lodging / Accommodation',
        'Transport & Fuel',
        'Office Supplies',
        'Client Entertainment',
        'Other',
      ],
      default: 'Travel',
    },
    amount: {
      type: Number,
      required: true,
      min: 1,
    },
    date: {
      type: Date,
      required: true,
    },
    receiptUrl: {
      type: String,
      default: '',
    },
    description: {
      type: String,
      default: '',
    },
    status: {
      type: String,
      enum: ['Pending', 'Approved', 'Rejected', 'Reimbursed'],
      default: 'Pending',
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    reimbursedDate: {
      type: Date,
    },
    notes: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

expenseClaimSchema.index({ employeeId: 1, status: 1 });

export default mongoose.model('ExpenseClaim', expenseClaimSchema);

