import mongoose from 'mongoose';

const assetSchema = new mongoose.Schema(
  {
    assetTag: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    category: {
      type: String,
      enum: ['Laptop', 'Desktop', 'Mobile Device', 'Access Card', 'Monitor', 'Furniture', 'Other'],
      default: 'Laptop',
    },
    serialNumber: {
      type: String,
      default: '',
    },
    purchaseDate: {
      type: Date,
      default: Date.now,
    },
    purchaseCost: {
      type: Number,
      default: 0,
    },
    condition: {
      type: String,
      enum: ['New', 'Good', 'Fair', 'Needs Maintenance', 'Retired'],
      default: 'Good',
    },
    status: {
      type: String,
      enum: ['Available', 'Assigned', 'Under Repair', 'Decommissioned'],
      default: 'Available',
    },
    currentAssignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee',
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

assetSchema.index({ status: 1 });
assetSchema.index({ currentAssignedTo: 1 });
assetSchema.index({ createdAt: -1 });

export default mongoose.model('Asset', assetSchema);
