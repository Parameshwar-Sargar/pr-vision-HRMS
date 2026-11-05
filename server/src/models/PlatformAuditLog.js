import mongoose from 'mongoose';

const platformAuditLogSchema = new mongoose.Schema(
  {
    action: {
      type: String,
      required: true,
    },
    actorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    actorEmail: {
      type: String,
      required: true,
    },
    targetTenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
    },
    details: {
      type: mongoose.Schema.Types.Mixed,
    },
    ipAddress: {
      type: String,
    },
    userAgent: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

platformAuditLogSchema.index({ targetTenantId: 1, createdAt: -1 });
platformAuditLogSchema.index({ actorId: 1, createdAt: -1 });

export default mongoose.model('PlatformAuditLog', platformAuditLogSchema);

