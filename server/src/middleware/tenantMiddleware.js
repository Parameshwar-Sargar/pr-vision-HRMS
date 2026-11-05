import { sendError } from '../utils/responseUtils.js';
import { ROLES, TENANT_STATUS } from '../config/constants.js';
import Tenant from '../models/Tenant.js';

/**
 * Centralized Multi-Tenant Middleware
 * Guarantees that:
 * 1. Authenticated user's tenantId is the SOLE authority for tenant identity.
 * 2. Never trusts any tenantId sent in request query, body, or headers by clients.
 * 3. Enforces tenant account status checks (e.g. suspended/expired companies blocked).
 * 4. Super Admin bypass is only permitted for platform management, not inadvertent cross-tenant writes.
 */
export const enforceTenant = async (req, res, next) => {
  try {
    if (!req.user) {
      return sendError(res, 'Authentication context required before tenant enforcement.', [], 401);
    }

    // Platform Super Admin
    if (req.user.role === ROLES.SUPER_ADMIN) {
      // If Super Admin specifies target tenant in header for platform review (e.g. x-target-tenant)
      const targetTenantHeader = req.headers['x-target-tenant'];
      if (targetTenantHeader) {
        req.tenantId = targetTenantHeader;
      }
      return next();
    }

    // For all standard tenant users:
    if (!req.user.tenantId) {
      return sendError(res, 'No tenant association found for this user account.', [], 403);
    }

    const tenant = req.user.tenantId; // Populated from User model

    // Check if tenant is deleted
    if (tenant.isDeleted) {
      return sendError(res, 'Company account has been deleted.', [], 403);
    }

    // Check if tenant is suspended
    if (tenant.status === TENANT_STATUS.SUSPENDED) {
      return sendError(res, 'Company subscription is suspended. Please contact platform support.', [], 403);
    }

    // Enforce authoritative server-side tenantId
    req.tenantId = tenant._id;
    req.tenant = tenant;

    // Sanitize any client attempts to spoof tenantId
    if (req.body && req.body.tenantId) {
      req.body.tenantId = req.tenantId;
    }
    if (req.query && req.query.tenantId) {
      req.query.tenantId = req.tenantId.toString();
    }

    next();
  } catch (error) {
    console.error('Tenant Middleware Error:', error);
    return sendError(res, 'Failed to resolve tenant context.', [error.message], 500);
  }
};

