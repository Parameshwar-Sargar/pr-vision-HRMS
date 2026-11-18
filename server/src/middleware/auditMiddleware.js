import AuditLog from '../models/AuditLog.js';
import { sanitizeAuditDetails } from '../utils/securityUtils.js';

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
    const sanitizedDetails = sanitizeAuditDetails(details);

    // Non-blocking by default for un-awaited callers, awaitable when caller needs strict ordering
    return AuditLog.create({
      actorId,
      actorEmail,
      actorRole,
      action,
      entity,
      entityId,
      details: sanitizedDetails,
      ipAddress,
      userAgent,
    }).catch((err) => {
      console.warn('Audit Logging Warning:', err.message);
    });
  } catch (err) {
    console.warn('Audit Logging Warning:', err.message);
  }
};
