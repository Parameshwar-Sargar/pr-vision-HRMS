import { sendError } from '../utils/responseUtils.js';
import { ROLES } from '../config/constants.js';

export const requireRoles = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return sendError(res, 'Authentication required.', [], 401);
    }

    if (req.user.role === ROLES.SUPER_ADMIN) {
      return next();
    }

    if (!roles.includes(req.user.role)) {
      return sendError(
        res,
        `Access denied. Requires one of roles: [${roles.join(', ')}]. Your role is ${req.user.role}.`,
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

    // Super Admin and Company Admin inherently hold master privileges
    if (req.user.role === ROLES.SUPER_ADMIN || req.user.role === ROLES.COMPANY_ADMIN) {
      return next();
    }

    const userPermissions = req.user.permissions || [];
    const hasAll = permissions.every((p) => userPermissions.includes(p));

    if (!hasAll) {
      return sendError(
        res,
        `Access denied. You lack required permissions: [${permissions.join(', ')}].`,
        [],
        403
      );
    }

    next();
  };
};

