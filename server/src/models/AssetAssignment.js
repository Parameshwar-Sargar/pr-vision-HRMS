import mongoose from 'mongoose';

const assetAssignmentSchema = new mongoose.Schema(
  {
    assetId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Asset',
      required: true,
    },
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee',
      required: true,
    },
    assignedDate: {
      type: Date,
      default: Date.now,
    },
    returnedDate: {
      type: Date,
    },
    assignedCondition: {
      type: String,
      default: 'Good',
    },
    returnCondition: {
      type: String,
      default: '',
    },
    notes: {
      type: String,
      default: '',
    },
    status: {
      type: String,
      enum: ['Active', 'Returned'],
      default: 'Active',
    },
  },
  {
    timestamps: true,
  }
);

assetAssignmentSchema.index({ assetId: 1, employeeId: 1 });
assetAssignmentSchema.index({ employeeId: 1, status: 1 });

export default mongoose.model('AssetAssignment', assetAssignmentSchema);

