import CompanySettings from '../../models/CompanySettings.js';
import Branch from '../../models/Branch.js';
import Employee from '../../models/Employee.js';
import { isValidObjectId, sanitizeCompanyForRole, sanitizeAuditDetails } from '../../utils/securityUtils.js';
import { sendSuccess, sendError, parsePagination, buildPaginationMeta } from '../../utils/responseUtils.js';
import { logAudit } from '../../middleware/auditMiddleware.js';
import { invalidateCompanySettingsCache } from '../auth/authController.js';

// Company Profile & Settings
export const getCompanySettings = async (req, res, next) => {
  try {
    let settings = await CompanySettings.findOne().lean();
    if (!settings) {
      const created = await CompanySettings.create({
        companyName: 'PR VISION INNOVATIONS',
        tagline: 'People. Process. Performance.',
        contactEmail: 'contact@prvision.com',
      });
      settings = created.toObject();
    }
    return sendSuccess(res, 'Company settings retrieved.', {
      company: sanitizeCompanyForRole(settings, req.user?.role),
    });
  } catch (error) {
    next(error);
  }
};

export const updateCompanySettings = async (req, res, next) => {
  try {
    let settings = await CompanySettings.findOne();
    if (!settings) {
      settings = new CompanySettings();
    }

    const {
      companyName,
      tagline,
      logo,
      favicon,
      primaryColor,
      contactEmail,
      contactPhone,
      website,
      address,
      businessInfo,
      settings: subSettings,
      modules,
      biometricConfig,
    } = req.body;

    if (companyName) settings.companyName = companyName;
    if (tagline !== undefined) settings.tagline = tagline;
    if (logo !== undefined) settings.logo = logo;
    if (favicon !== undefined) settings.favicon = favicon;
    if (primaryColor) settings.primaryColor = primaryColor;
    if (contactEmail) settings.contactEmail = contactEmail;
    if (contactPhone !== undefined) settings.contactPhone = contactPhone;
    if (website !== undefined) settings.website = website;

    if (address) settings.address = { ...settings.address, ...address };
    if (businessInfo) settings.businessInfo = { ...settings.businessInfo, ...businessInfo };
    if (subSettings) settings.settings = { ...settings.settings, ...subSettings };
    if (modules) settings.modules = { ...settings.modules, ...modules };
    if (biometricConfig) settings.biometricConfig = { ...settings.biometricConfig, ...biometricConfig };

    await settings.save();
    invalidateCompanySettingsCache();

    await logAudit({
      req,
      action: 'COMPANY_SETTINGS_UPDATED',
      entity: 'CompanySettings',
      entityId: settings._id,
      details: sanitizeAuditDetails(req.body),
    });

    return sendSuccess(res, 'Company settings updated successfully.', {
      company: sanitizeCompanyForRole(settings.toObject(), req.user?.role),
    });
  } catch (error) {
    next(error);
  }
};

// Branches CRUD
export const getBranches = async (req, res, next) => {
  try {
    const query = { isDeleted: false };
    const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 100, maxLimit: 200 });

    const [branches, total, counts] = await Promise.all([
      Branch.find(query)
        .sort({ isHeadquarters: -1, name: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Branch.countDocuments(query),
      Employee.aggregate([
        { $match: { isDeleted: false, branchId: { $ne: null } } },
        { $group: { _id: '$branchId', count: { $sum: 1 } } },
      ]),
    ]);

    const countMap = new Map(counts.map((c) => [c._id.toString(), c.count]));
    const branchesWithCount = branches.map((b) => ({
      ...b,
      employeeCount: countMap.get(b._id.toString()) || 0,
    }));

    return sendSuccess(res, 'Branches retrieved.', {
      branches: branchesWithCount,
      pagination: buildPaginationMeta(total, page, limit),
    });
  } catch (error) {
    next(error);
  }
};

export const createBranch = async (req, res, next) => {
  try {
    const { name, code, isHeadquarters, address, contactPhone, contactEmail, timezone } = req.body;
    if (!name || !code) {
      return sendError(res, 'Branch name and code are required.', [], 400);
    }

    const exists = await Branch.findOne({ code: String(code).trim().toUpperCase(), isDeleted: false }).select('_id').lean();
    if (exists) {
      return sendError(res, 'A branch with this code already exists.', [], 409);
    }

    if (isHeadquarters) {
      await Branch.updateMany({}, { isHeadquarters: false });
    }

    const branch = await Branch.create({
      name: String(name).trim(),
      code: String(code).trim().toUpperCase(),
      isHeadquarters: !!isHeadquarters,
      address,
      contactPhone,
      contactEmail,
      timezone: timezone || 'Asia/Kolkata',
    });

    await logAudit({
      req,
      action: 'BRANCH_CREATED',
      entity: 'Branch',
      entityId: branch._id,
      details: { name: branch.name, code: branch.code },
    });

    return sendSuccess(res, 'Branch created successfully.', { branch }, 201);
  } catch (error) {
    next(error);
  }
};

export const updateBranch = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return sendError(res, 'Invalid branch ID.', [], 400);
    }

    const branch = await Branch.findOne({ _id: id, isDeleted: false });
    if (!branch) {
      return sendError(res, 'Branch not found.', [], 404);
    }

    const { name, code, isHeadquarters, address, contactPhone, contactEmail, timezone } = req.body;

    if (isHeadquarters) {
      await Branch.updateMany({ _id: { $ne: id } }, { isHeadquarters: false });
    }

    if (name !== undefined) branch.name = String(name).trim();
    if (code !== undefined) branch.code = String(code).trim().toUpperCase();
    if (isHeadquarters !== undefined) branch.isHeadquarters = !!isHeadquarters;
    if (address !== undefined) branch.address = address;
    if (contactPhone !== undefined) branch.contactPhone = contactPhone;
    if (contactEmail !== undefined) branch.contactEmail = contactEmail;
    if (timezone !== undefined) branch.timezone = timezone;

    await branch.save();

    return sendSuccess(res, 'Branch updated successfully.', { branch });
  } catch (error) {
    next(error);
  }
};

export const deleteBranch = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return sendError(res, 'Invalid branch ID.', [], 400);
    }

    const activeStaff = await Employee.countDocuments({ branchId: id, isDeleted: false });
    if (activeStaff > 0) {
      return sendError(res, `Cannot delete branch with ${activeStaff} active staff assigned.`, [], 400);
    }

    const branch = await Branch.findOne({ _id: id, isDeleted: false });
    if (!branch) return sendError(res, 'Branch not found.', [], 404);

    branch.isDeleted = true;
    await branch.save();

    return sendSuccess(res, 'Branch deleted successfully.');
  } catch (error) {
    next(error);
  }
};
