import mongoose from 'mongoose';

const documentSchema = new mongoose.Schema(
  {
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee',
      default: null, // Null = Company policy / general document
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    category: {
      type: String,
      enum: [
        'Offer Letter',
        'Appointment Letter',
        'ID Proof',
        'Certificate',
        'Tax Document',
        'Company Policy',
        'Experience Letter',
        'Relieving Letter',
        'Payslip Archive',
        'Other',
      ],
      default: 'Other',
    },
    fileName: {
      type: String,
      required: true,
    },
    fileUrl: {
      type: String,
      required: true,
    },
    fileSize: {
      type: Number,
      default: 0,
    },
    mimeType: {
      type: String,
      default: 'application/pdf',
    },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

documentSchema.index({ employeeId: 1 });
documentSchema.index({ category: 1 });

export default mongoose.model('Document', documentSchema);
