import AuditLog from '../models/AuditLog.js';

export const logAudit = async ({
  req,
  action,
  entity,
  entityId = null,
  details = {},
}) => {
  try {
    if (!req || !req.user) return;

    const actorId = req.user._id;
    const actorEmail = req.user.email;
    const actorRole = req.user.role;
    const ipAddress = req.ip || req.connection?.remoteAddress || '';
    const userAgent = req.headers['user-agent'] || '';

    await AuditLog.create({
      actorId,
      actorEmail,
      actorRole,
      action,
      entity,
      entityId,
      details,
      ipAddress,
      userAgent,
    });
  } catch (err) {
    console.warn('Audit Logging Warning:', err.message);
  }
};
