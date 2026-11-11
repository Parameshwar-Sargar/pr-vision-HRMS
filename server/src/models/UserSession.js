import mongoose from 'mongoose';

const userSessionSchema = new mongoose.Schema(
  {
    sessionId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    tabId: {
      type: String,
      default: '',
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    tenantId: {
      type: String,
      default: 'pr_vision_hrms',
      index: true,
    },
    role: {
      type: String,
      required: true,
    },
    refreshTokenHash: {
      type: String,
      required: true,
    },
    deviceLabel: {
      type: String,
      default: 'Web Browser Tab',
    },
    ipAddress: {
      type: String,
      default: '',
    },
    userAgent: {
      type: String,
      default: '',
    },
    loginAt: {
      type: Date,
      default: Date.now,
    },
    lastActiveAt: {
      type: Date,
      default: Date.now,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },
    isRevoked: {
      type: Boolean,
      default: false,
      index: true,
    },
    revokedAt: {
      type: Date,
      default: null,
    },
    revokedReason: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

userSessionSchema.index({ userId: 1, isRevoked: 1, expiresAt: -1 });
userSessionSchema.index({ sessionId: 1, userId: 1, isRevoked: 1 });

userSessionSchema.methods.toSafeObject = function (currentSessionId = null) {
  return {
    _id: this._id,
    sessionId: this.sessionId,
    tabId: this.tabId,
    userId: this.userId,
    tenantId: this.tenantId,
    role: this.role,
    deviceLabel: this.deviceLabel,
    ipAddress: this.ipAddress,
    userAgent: this.userAgent,
    loginAt: this.loginAt,
    lastActiveAt: this.lastActiveAt,
    expiresAt: this.expiresAt,
    isRevoked: this.isRevoked,
    revokedAt: this.revokedAt,
    isCurrentSession: currentSessionId ? this.sessionId === currentSessionId : false,
  };
};

export default mongoose.model('UserSession', userSessionSchema);

