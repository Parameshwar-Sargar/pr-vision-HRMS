import { sendError } from '../utils/responseUtils.js';
import { ROLES } from '../config/constants.js';

export const requireRoles = (...roles) => {
  const normalizedAllowedRoles = roles.map((r) => String(r || '').toUpperCase().trim());

  return (req, res, next) => {
    if (!req.user) {
      return sendError(res, 'Authentication required.', [], 401);
    }

    const userRole = String(req.user.role || '').toUpperCase().trim();

    if (userRole === ROLES.ADMIN) {
      return next();
    }

    if (!normalizedAllowedRoles.includes(userRole)) {
      return sendError(
        res,
        `Access denied. Requires one of roles: [${normalizedAllowedRoles.join(', ')}]. Your role is ${userRole}.`,
        [],
        403
      );
    }

    next();
  };
};

export const requirePermissions = (...permissions) => {
  return (req, res, next) => {
    if (!req.user) {
      return sendError(res, 'Authentication required.', [], 401);
    }

    const userRole = String(req.user.role || '').toUpperCase().trim();
    if (userRole === ROLES.ADMIN) {
      return next();
    }

    const userPermissions = req.user.permissions || [];
    const hasAll = permissions.every((p) => userPermissions.includes(p));

    if (!hasAll) {
      return sendError(
        res,
        `Access denied. Missing required permission: [${permissions.join(', ')}].`,
        [],
        403
      );
    }

    next();
  };
};
