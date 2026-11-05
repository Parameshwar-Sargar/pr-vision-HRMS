import Tenant from '../../models/Tenant.js';
import User from '../../models/User.js';
import Employee from '../../models/Employee.js';
import Plan from '../../models/Plan.js';
import PlatformAuditLog from '../../models/PlatformAuditLog.js';
import { TENANT_STATUS, ROLES } from '../../config/constants.js';
import { sendSuccess, sendError } from '../../utils/responseUtils.js';
import { logAudit } from '../../middleware/auditMiddleware.js';

/**
 * Super Admin Global Platform Analytics
 */
export const getPlatformStats = async (req, res, next) => {
  try {
    const totalCompanies = await Tenant.countDocuments({ isDeleted: false });
    const activeCompanies = await Tenant.countDocuments({ status: TENANT_STATUS.ACTIVE, isDeleted: false });
    const suspendedCompanies = await Tenant.countDocuments({ status: TENANT_STATUS.SUSPENDED, isDeleted: false });
    const trialCompanies = await Tenant.countDocuments({ status: TENANT_STATUS.TRIAL, isDeleted: false });

    const totalEmployees = await Employee.countDocuments({ isDeleted: false });
    const totalPlatformUsers = await User.countDocuments({ isActive: true });

    // Plan distribution
    const planDistribution = await Tenant.aggregate([
      { $match: { isDeleted: false } },
      { $group: { _id: '$planName', count: { $sum: 1 } } },
      { $project: { plan: '$_id', count: 1, _id: 0 } },
    ]);

    // Recent 5 registered companies
    const recentTenants = await Tenant.find({ isDeleted: false })
      .sort({ createdAt: -1 })
      .limit(5)
      .select('name slug contactEmail status planName createdAt');

    // Recent platform audit logs
    const recentLogs = await PlatformAuditLog.find()
      .sort({ createdAt: -1 })
      .limit(6)
      .populate('targetTenantId', 'name slug');

    return sendSuccess(res, 'Platform statistics retrieved.', {
      counts: {
        totalCompanies,
        activeCompanies,
        suspendedCompanies,
        trialCompanies,
        totalEmployees,
        totalPlatformUsers,
      },
      planDistribution,
      recentTenants,
      recentLogs,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * List all companies (Tenants)
 */
export const listCompanies = async (req, res, next) => {
  try {
    const { page = 1, limit = 10, search = '', status } = req.query;
    const query = { isDeleted: false };

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { contactEmail: { $regex: search, $options: 'i' } },
        { slug: { $regex: search, $options: 'i' } },
      ];
    }

    if (status) {
      query.status = status;
    }

    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const total = await Tenant.countDocuments(query);
    const companies = await Tenant.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit, 10))
      .populate('planId', 'name code maxEmployees');

    // Attach active employee count for each tenant
    const companiesWithCount = await Promise.all(
      companies.map(async (c) => {
        const empCount = await Employee.countDocuments({ tenantId: c._id, isDeleted: false });
        const obj = c.toObject();
        obj.employeeCount = empCount;
        return obj;
      })
    );

    return sendSuccess(res, 'Companies retrieved successfully.', {
      companies: companiesWithCount,
      pagination: {
        total,
        page: parseInt(page, 10),
        pages: Math.ceil(total / parseInt(limit, 10)),
        limit: parseInt(limit, 10),
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update Company Status (Activate, Suspend)
 */
export const updateCompanyStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, employeeLimit, planName } = req.body;

    const tenant = await Tenant.findById(id);
    if (!tenant) {
      return sendError(res, 'Tenant not found.', [], 404);
    }

    const previousStatus = tenant.status;
    if (status) tenant.status = status;
    if (employeeLimit) tenant.employeeLimit = parseInt(employeeLimit, 10);
    if (planName) tenant.planName = planName;

    await tenant.save();

    await logAudit({
      req,
      action: 'TENANT_STATUS_UPDATED',
      entity: 'Tenant',
      entityId: tenant._id,
      details: { previousStatus, newStatus: tenant.status, employeeLimit: tenant.employeeLimit },
    });

    return sendSuccess(res, `Company ${tenant.name} updated successfully.`, { tenant });
  } catch (error) {
    next(error);
  }
};

/**
 * Manage Platform Subscription Plans
 */
export const getPlans = async (req, res, next) => {
  try {
    const plans = await Plan.find().sort({ priceMonthly: 1 });
    return sendSuccess(res, 'Plans retrieved.', { plans });
  } catch (error) {
    next(error);
  }
};

/**
 * Platform Audit Logs
 */
export const getPlatformAuditLogs = async (req, res, next) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const total = await PlatformAuditLog.countDocuments();
    const logs = await PlatformAuditLog.find()
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit, 10))
      .populate('targetTenantId', 'name slug');

    return sendSuccess(res, 'Platform audit logs retrieved.', {
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

