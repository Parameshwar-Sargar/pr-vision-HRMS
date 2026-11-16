import { z } from 'zod';
import Asset from '../../models/Asset.js';
import AssetAssignment from '../../models/AssetAssignment.js';
import Employee from '../../models/Employee.js';
import { ROLES } from '../../config/constants.js';
import { isAdminOrHR, isValidObjectId } from '../../utils/securityUtils.js';
import { sendSuccess, sendError, parsePagination, buildPaginationMeta } from '../../utils/responseUtils.js';

const updateAssetSchema = z.object({
  assetTag: z.string().trim().min(1).max(60).optional(),
  name: z.string().trim().min(1).max(160).optional(),
  category: z.enum(['Laptop', 'Desktop', 'Mobile Device', 'Access Card', 'Monitor', 'Furniture', 'Other']).optional(),
  serialNumber: z.string().trim().max(120).optional(),
  purchaseDate: z.union([z.string(), z.date()]).optional(),
  purchaseCost: z.coerce.number().min(0).optional(),
  condition: z.enum(['New', 'Good', 'Fair', 'Needs Maintenance', 'Retired']).optional(),
  status: z.enum(['Available', 'Assigned', 'Under Repair', 'Decommissioned']).optional(),
});

export const getAssets = async (req, res, next) => {
  try {
    const { category, status, employeeId } = req.query;
    const query = {};
    const privileged = isAdminOrHR(req.user.role);

    if (privileged) {
      if (employeeId) {
        if (!isValidObjectId(employeeId)) {
          return sendError(res, 'Invalid employee ID format.', [], 400);
        }
        query.currentAssignedTo = employeeId;
      }
    } else if (req.user.role === ROLES.MANAGER) {
      if (!req.verifiedEmployeeId) {
        return sendSuccess(res, 'No assigned assets found.', { assets: [] });
      }
      const teamEmployees = await Employee.find({ managerId: req.verifiedEmployeeId, isDeleted: false }).select('_id').lean();
      const allowedIds = [...teamEmployees.map((t) => String(t._id)), String(req.verifiedEmployeeId)];
      if (employeeId) {
        if (!isValidObjectId(employeeId) || !allowedIds.includes(String(employeeId))) {
          return sendError(res, 'Access denied. You can only view assets assigned to yourself or your direct team.', [], 403);
        }
        query.currentAssignedTo = employeeId;
      } else {
        query.currentAssignedTo = { $in: allowedIds };
      }
    } else {
      if (employeeId && (!req.verifiedEmployeeId || String(employeeId) !== String(req.verifiedEmployeeId))) {
        return sendError(res, 'Access denied. You can only view your own assigned assets.', [], 403);
      }
      if (!req.verifiedEmployeeId) {
        return sendSuccess(res, 'No assigned assets found.', { assets: [] });
      }
      query.currentAssignedTo = req.verifiedEmployeeId;
    }

    if (category) query.category = category;
    if (status) query.status = status;

    const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 50, maxLimit: 200 });

    const assetQuery = Asset.find(query)
      .populate('currentAssignedTo', 'firstName lastName employeeId departmentId')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    if (!privileged) {
      assetQuery.select('-purchaseCost');
    }

    const [assets, total] = await Promise.all([
      assetQuery.lean(),
      Asset.countDocuments(query),
    ]);

    return sendSuccess(res, 'Assets retrieved.', {
      assets,
      pagination: buildPaginationMeta(total, page, limit),
    });
  } catch (error) {
    next(error);
  }
};

export const createAsset = async (req, res, next) => {
  try {
    const { assetTag, name, category, serialNumber, purchaseDate, purchaseCost, condition } = req.body;
    if (!assetTag || !name) {
      return sendError(res, 'assetTag and name are required.', [], 400);
    }

    const normalizedTag = String(assetTag).trim().toUpperCase();
    const exists = await Asset.findOne({ assetTag: normalizedTag }).select('_id').lean();
    if (exists) {
      return sendError(res, 'Asset tag already registered.', [], 409);
    }

    const asset = await Asset.create({
      assetTag: normalizedTag,
      name: String(name).trim(),
      category,
      serialNumber,
      purchaseDate: purchaseDate ? new Date(purchaseDate) : new Date(),
      purchaseCost: Number(purchaseCost) || 0,
      condition: condition || 'Good',
      status: 'Available',
    });

    return sendSuccess(res, 'Asset added to inventory.', { asset }, 201);
  } catch (error) {
    next(error);
  }
};

export const updateAsset = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return sendError(res, 'Invalid asset ID.', [], 400);
    }

    const parsed = updateAssetSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(res, 'Validation failed.', parsed.error.flatten().fieldErrors, 400);
    }

    const asset = await Asset.findById(id);
    if (!asset) return sendError(res, 'Asset not found.', [], 404);

    const data = parsed.data;
    if (data.assetTag !== undefined) asset.assetTag = data.assetTag.toUpperCase();
    if (data.name !== undefined) asset.name = data.name;
    if (data.category !== undefined) asset.category = data.category;
    if (data.serialNumber !== undefined) asset.serialNumber = data.serialNumber;
    if (data.purchaseDate !== undefined) asset.purchaseDate = new Date(data.purchaseDate);
    if (data.purchaseCost !== undefined) asset.purchaseCost = data.purchaseCost;
    if (data.condition !== undefined) asset.condition = data.condition;
    if (data.status !== undefined) asset.status = data.status;

    await asset.save();

    return sendSuccess(res, 'Asset updated.', { asset });
  } catch (error) {
    next(error);
  }
};

export const assignAsset = async (req, res, next) => {
  try {
    const { id } = req.params; // assetId
    const { employeeId, conditionAtAssignment = 'Good', notes } = req.body;
    if (!isValidObjectId(id) || !isValidObjectId(employeeId)) {
      return sendError(res, 'Invalid asset or employee ID.', [], 400);
    }

    const asset = await Asset.findById(id);
    if (!asset) return sendError(res, 'Asset not found.', [], 404);

    if (asset.status === 'Assigned') {
      return sendError(res, 'Asset is already assigned to an employee.', [], 400);
    }

    const employee = await Employee.findOne({ _id: employeeId, isDeleted: false }).select('_id').lean();
    if (!employee) return sendError(res, 'Employee not found.', [], 404);

    const assignment = await AssetAssignment.create({
      assetId: id,
      employeeId,
      assignedBy: req.user._id,
      conditionAtAssignment,
      notes: notes || '',
      status: 'Active',
    });

    asset.status = 'Assigned';
    asset.currentAssignedTo = employeeId;
    await asset.save();

    return sendSuccess(res, 'Asset assigned successfully.', { assignment, asset });
  } catch (error) {
    next(error);
  }
};

export const returnAsset = async (req, res, next) => {
  try {
    const { id } = req.params; // assetId
    if (!isValidObjectId(id)) {
      return sendError(res, 'Invalid asset ID.', [], 400);
    }
    const { conditionAtReturn = 'Good', remarks } = req.body;

    const asset = await Asset.findById(id);
    if (!asset) return sendError(res, 'Asset not found.', [], 404);

    const activeAssignment = await AssetAssignment.findOne({ assetId: id, status: 'Active' });
    if (activeAssignment) {
      activeAssignment.status = 'Returned';
      activeAssignment.returnedDate = new Date();
      activeAssignment.conditionAtReturn = conditionAtReturn;
      activeAssignment.remarks = remarks || '';
      await activeAssignment.save();
    }

    asset.status = 'Available';
    asset.currentAssignedTo = null;
    asset.condition = conditionAtReturn;
    await asset.save();

    return sendSuccess(res, 'Asset returned and marked as Available.', { asset });
  } catch (error) {
    next(error);
  }
};

