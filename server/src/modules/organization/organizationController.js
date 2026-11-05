import CompanySettings from '../../models/CompanySettings.js';
import Branch from '../../models/Branch.js';
import Employee from '../../models/Employee.js';
import { sendSuccess, sendError } from '../../utils/responseUtils.js';
import { logAudit } from '../../middleware/auditMiddleware.js';

// Company Profile & Settings
export const getCompanySettings = async (req, res, next) => {
  try {
    let settings = await CompanySettings.findOne();
    if (!settings) {
      settings = await CompanySettings.create({
        companyName: 'PR VISION INNOVATIONS',
        tagline: 'People. Process. Performance.',
        contactEmail: 'contact@prvision.com',
      });
    }
    return sendSuccess(res, 'Company settings retrieved.', { company: settings });
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

    await logAudit({
      req,
      action: 'COMPANY_SETTINGS_UPDATED',
      entity: 'CompanySettings',
      entityId: settings._id,
      details: req.body,
    });

    return sendSuccess(res, 'Company settings updated successfully.', { company: settings });
  } catch (error) {
    next(error);
  }
};

// Branches CRUD
export const getBranches = async (req, res, next) => {
  try {
    const branches = await Branch.find({ isDeleted: false }).sort({ isHeadquarters: -1, name: 1 });

    const branchesWithCount = await Promise.all(
      branches.map(async (b) => {
        const count = await Employee.countDocuments({ branchId: b._id, isDeleted: false });
        const obj = b.toObject();
        obj.employeeCount = count;
        return obj;
      })
    );

    return sendSuccess(res, 'Branches retrieved.', { branches: branchesWithCount });
  } catch (error) {
    next(error);
  }
};

export const createBranch = async (req, res, next) => {
  try {
    const { name, code, isHeadquarters, address, contactPhone, contactEmail, timezone } = req.body;

    const exists = await Branch.findOne({ code: code.toUpperCase(), isDeleted: false });
    if (exists) {
      return sendError(res, 'A branch with this code already exists.', [], 409);
    }

    if (isHeadquarters) {
      await Branch.updateMany({}, { isHeadquarters: false });
    }

    const branch = await Branch.create({
      name,
      code: code.toUpperCase(),
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
      details: { name, code },
    });

    return sendSuccess(res, 'Branch created successfully.', { branch }, 201);
  } catch (error) {
    next(error);
  }
};

export const updateBranch = async (req, res, next) => {
  try {
    const { id } = req.params;
    const branch = await Branch.findOne({ _id: id, isDeleted: false });
    if (!branch) {
      return sendError(res, 'Branch not found.', [], 404);
    }

    if (req.body.isHeadquarters) {
      await Branch.updateMany({ _id: { $ne: id } }, { isHeadquarters: false });
    }

    Object.assign(branch, req.body);
    await branch.save();

    return sendSuccess(res, 'Branch updated successfully.', { branch });
  } catch (error) {
    next(error);
  }
};

export const deleteBranch = async (req, res, next) => {
  try {
    const { id } = req.params;
    const activeStaff = await Employee.countDocuments({ branchId: id, isDeleted: false });
    if (activeStaff > 0) {
      return sendError(res, `Cannot delete branch with ${activeStaff} active staff assigned.`, [], 400);
    }

    const branch = await Branch.findById(id);
    if (!branch) return sendError(res, 'Branch not found.', [], 404);

    branch.isDeleted = true;
    await branch.save();

    return sendSuccess(res, 'Branch deleted successfully.');
  } catch (error) {
    next(error);
  }
};

