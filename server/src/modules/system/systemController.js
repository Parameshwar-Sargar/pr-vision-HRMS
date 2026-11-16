import os from 'os';
import AuditLog from '../../models/AuditLog.js';
import User from '../../models/User.js';
import Employee from '../../models/Employee.js';
import { ROLES, PERMISSIONS, ROLE_DEFAULT_PERMISSIONS } from '../../config/constants.js';
import { sanitizeAuditDetails } from '../../utils/securityUtils.js';
import { sendSuccess, parsePagination, buildPaginationMeta } from '../../utils/responseUtils.js';

export const getRolesAndPermissions = async (req, res, next) => {
  try {
    const rolesList = Object.values(ROLES).map((role) => ({
      role,
      permissions: ROLE_DEFAULT_PERMISSIONS[role] || [],
    }));

    const allPermissions = Object.entries(PERMISSIONS).map(([key, value]) => ({
      key,
      code: value,
      label: key.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()),
    }));

    return sendSuccess(res, 'Roles and permissions matrix retrieved.', {
      roles: rolesList,
      permissions: allPermissions,
    });
  } catch (error) {
    next(error);
  }
};

export const getAuditLogs = async (req, res, next) => {
  try {
    const { action, entity } = req.query;
    const query = {};

    if (action) query.action = action;
    if (entity) query.entity = entity;

    const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 50, maxLimit: 200 });
    const [total, logs] = await Promise.all([
      AuditLog.countDocuments(query),
      AuditLog.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('actorId', 'name email role')
        .lean(),
    ]);

    const sanitizedLogs = logs.map((log) => ({
      ...log,
      details: sanitizeAuditDetails(log.details),
    }));

    return sendSuccess(res, 'Audit logs retrieved.', {
      logs: sanitizedLogs,
      pagination: buildPaginationMeta(total, page, limit),
    });
  } catch (error) {
    next(error);
  }
};

export const getSystemDiagnostics = async (req, res, next) => {
  try {
    const [totalUsers, activeUsers, totalEmployees] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ isActive: true }),
      Employee.countDocuments({ isDeleted: false }),
    ]);

    const uptimeSeconds = Math.floor(process.uptime());
    const memoryUsage = process.memoryUsage();

    return sendSuccess(res, 'System diagnostics and environment info.', {
      status: 'Operational',
      platform: {
        product: 'PR VISION HRMS',
        version: '1.0.0',
        environment: process.env.NODE_ENV || 'development',
        nodeVersion: process.version,
        os: `${os.type()} ${os.release()} (${os.arch()})`,
        uptime: `${Math.floor(uptimeSeconds / 3600)}h ${Math.floor((uptimeSeconds % 3600) / 60)}m ${uptimeSeconds % 60}s`,
        memoryRssMB: Math.round(memoryUsage.rss / (1024 * 1024)),
        memoryHeapUsedMB: Math.round(memoryUsage.heapUsed / (1024 * 1024)),
      },
      counts: {
        totalUsers,
        activeUsers,
        totalEmployees,
      },
    });
  } catch (error) {
    next(error);
  }
};
