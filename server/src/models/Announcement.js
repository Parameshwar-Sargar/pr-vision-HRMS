import mongoose from 'mongoose';

const announcementSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    message: {
      type: String,
      required: true,
    },
    category: {
      type: String,
      enum: ['Company News', 'HR Policy Update', 'Holiday Notice', 'Team Event', 'Urgent Alert', 'Company Update', 'Events'],
      default: 'Company News',
    },
    priority: {
      type: String,
      enum: ['Normal', 'Important', 'Critical', 'High', 'Low'],
      default: 'Normal',
    },
    publishedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    targetBranchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
      default: null,
    },
    targetDepartmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Department',
      default: null,
    },
    isPinned: {
      type: Boolean,
      default: false,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    expiresAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

announcementSchema.virtual('content').get(function () {
  return this.message;
});

announcementSchema.index({ createdAt: -1 });

export default mongoose.model('Announcement', announcementSchema);
