import mongoose from 'mongoose';

const documentSchema = new mongoose.Schema(
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
      default: null, // Null indicates company-wide policy document
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

documentSchema.index({ tenantId: 1, employeeId: 1 });
documentSchema.index({ tenantId: 1, category: 1 });

export default mongoose.model('Document', documentSchema);

