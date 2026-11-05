import mongoose from 'mongoose';

const trainingAssignmentSchema = new mongoose.Schema(
  {
    programId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TrainingProgram',
      required: true,
    },
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee',
      required: true,
    },
    status: {
      type: String,
      enum: ['Enrolled', 'In Progress', 'Completed', 'Failed'],
      default: 'Enrolled',
    },
    score: {
      type: Number,
      default: null,
    },
    feedback: {
      type: String,
      default: '',
    },
    certificateUrl: {
      type: String,
      default: '',
    },
    completedDate: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

trainingAssignmentSchema.index({ programId: 1, employeeId: 1 }, { unique: true });

export default mongoose.model('TrainingAssignment', trainingAssignmentSchema);

