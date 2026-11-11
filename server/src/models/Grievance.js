import mongoose from 'mongoose';

const grievanceSchema = new mongoose.Schema(
  {
    ticketNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
    },
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee',
      required: true,
    },
    isConfidential: {
      type: Boolean,
      default: false,
    },
    category: {
      type: String,
      enum: [
        'Workplace Harassment / POSH',
        'Payroll & Compensation',
        'Managerial Conflict',
        'Facility & Work Environment',
        'Discrimination',
        'Policy Clarification',
        'Other',
      ],
      required: true,
    },
    priority: {
      type: String,
      enum: ['Low', 'Medium', 'High', 'Urgent'],
      default: 'Medium',
    },
    subject: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ['Open', 'Under Review', 'In Investigation', 'Resolved', 'Closed'],
      default: 'Open',
    },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    resolutionNotes: {
      type: String,
      default: '',
    },
    resolvedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

grievanceSchema.index({ employeeId: 1, status: 1 });
grievanceSchema.index({ status: 1, createdAt: -1 });

export default mongoose.model('Grievance', grievanceSchema);
