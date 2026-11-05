import mongoose from 'mongoose';

const trainingProgramSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    category: {
      type: String,
      enum: ['Technical', 'Compliance & POSH', 'Leadership', 'Sales', 'Soft Skills', 'Product Training'],
      default: 'Technical',
    },
    trainerName: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    startDate: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
      required: true,
    },
    durationHours: {
      type: Number,
      default: 8,
    },
    mode: {
      type: String,
      enum: ['Classroom', 'Online', 'Hybrid', 'Self-Paced'],
      default: 'Online',
    },
    status: {
      type: String,
      enum: ['Scheduled', 'In Progress', 'Completed', 'Cancelled'],
      default: 'Scheduled',
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model('TrainingProgram', trainingProgramSchema);
