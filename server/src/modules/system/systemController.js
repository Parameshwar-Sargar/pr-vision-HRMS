import os from 'os';
import AuditLog from '../../models/AuditLog.js';
import User from '../../models/User.js';
import Employee from '../../models/Employee.js';
import { ROLES, PERMISSIONS, ROLE_DEFAULT_PERMISSIONS } from '../../config/constants.js';
import { sendSuccess } from '../../utils/responseUtils.js';

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
    const { action, entity, page = 1, limit = 50 } = req.query;
    const query = {};

    if (action) query.action = action;
    if (entity) query.entity = entity;

    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const total = await AuditLog.countDocuments(query);
    const logs = await AuditLog.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit, 10))
      .populate('actorId', 'name email role');

    return sendSuccess(res, 'Audit logs retrieved.', {
      logs,
      pagination: {
        total,
        page: parseInt(page, 10),
        pages: Math.ceil(total / parseInt(limit, 10)),
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getSystemDiagnostics = async (req, res, next) => {
  try {
    const totalUsers = await User.countDocuments();
    const activeUsers = await User.countDocuments({ isActive: true });
    const totalEmployees = await Employee.countDocuments({ isDeleted: false });

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
