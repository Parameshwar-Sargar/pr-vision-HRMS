import mongoose from 'mongoose';

const kpiSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    description: String,
    weight: { type: Number, default: 20 },
    target: { type: String, default: '100%' },
    achieved: { type: String, default: '' },
    progress: { type: Number, default: 0, min: 0, max: 100 },
    status: {
      type: String,
      enum: ['Not Started', 'In Progress', 'Achieved', 'Exceeded'],
      default: 'In Progress',
    },
  },
  { _id: false }
);

const performanceReviewSchema = new mongoose.Schema(
  {
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee',
      required: true,
    },
    reviewerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    reviewCycle: {
      type: String,
      required: true, // e.g. "Q1 2026", "Annual 2026"
    },
    goals: [kpiSchema],
    selfRating: {
      type: Number,
      min: 1,
      max: 5,
      default: 3,
    },
    managerRating: {
      type: Number,
      min: 1,
      max: 5,
      default: 3,
    },
    finalScore: {
      type: Number,
      min: 1,
      max: 5,
      default: 3,
    },
    strengths: {
      type: String,
      default: '',
    },
    areasForImprovement: {
      type: String,
      default: '',
    },
    comments: {
      type: String,
      default: '',
    },
    pipRequired: {
      type: Boolean,
      default: false,
    },
    pipDetails: {
      objectives: String,
      timelineDays: Number,
      outcome: String,
    },
    status: {
      type: String,
      enum: ['Self Review Pending', 'Manager Review Pending', 'Completed'],
      default: 'Self Review Pending',
    },
    completedDate: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

performanceReviewSchema.index({ employeeId: 1, reviewCycle: 1 }, { unique: true });
performanceReviewSchema.index({ status: 1 });

export default mongoose.model('PerformanceReview', performanceReviewSchema);
