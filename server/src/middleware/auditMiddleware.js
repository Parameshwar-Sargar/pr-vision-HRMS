import AuditLog from '../models/AuditLog.js';
import PlatformAuditLog from '../models/PlatformAuditLog.js';
import { ROLES } from '../config/constants.js';

export const logAudit = async ({
  req,
  action,
  entity,
  entityId = null,
  details = {},
  tenantId = null,
}) => {
  try {
    if (!req || !req.user) return;

    const actorId = req.user._id;
    const actorEmail = req.user.email;
    const actorRole = req.user.role;
    const ipAddress = req.ip || req.connection?.remoteAddress || '';
    const userAgent = req.headers['user-agent'] || '';

    // If Super Admin platform action
    if (actorRole === ROLES.SUPER_ADMIN && !tenantId && !req.tenantId) {
      await PlatformAuditLog.create({
        action,
        actorId,
        actorEmail,
        targetTenantId: entityId || null,
        details,
        ipAddress,
        userAgent,
      });
      return;
    }

    // Tenant-level audit log
    const resolvedTenantId = tenantId || req.tenantId || req.user.tenantId?._id || req.user.tenantId;

    if (resolvedTenantId) {
      await AuditLog.create({
        tenantId: resolvedTenantId,
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
    }
  } catch (err) {
    // Non-blocking failure for audit logs to not crash business operations
    console.warn('Audit Logging Warning:', err.message);
  }
};

