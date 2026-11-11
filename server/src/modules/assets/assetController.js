import Asset from '../../models/Asset.js';
import AssetAssignment from '../../models/AssetAssignment.js';
import Employee from '../../models/Employee.js';
import { ROLES } from '../../config/constants.js';
import { sendSuccess, sendError } from '../../utils/responseUtils.js';

export const getAssets = async (req, res, next) => {
  try {
    const { category, status } = req.query;
    const query = {};

    // Strict Role-Based Isolation: Employees only view their assigned assets
    if (req.user.role === ROLES.EMPLOYEE) {
      if (!req.verifiedEmployeeId) {
        return sendSuccess(res, 'No assigned assets found.', { assets: [] });
      }
      query.currentAssignedTo = req.verifiedEmployeeId;
    } else if (req.user.role === ROLES.MANAGER) {
      if (req.query.teamOnly === 'true' && req.verifiedEmployeeId) {
        const teamEmployees = await Employee.find({ managerId: req.verifiedEmployeeId, isDeleted: false }).select('_id');
        const allowedIds = [...teamEmployees.map((t) => t._id), req.verifiedEmployeeId];
        query.currentAssignedTo = { $in: allowedIds };
      }
    }

    if (category) query.category = category;
    if (status) query.status = status;

    const assets = await Asset.find(query)
      .populate('currentAssignedTo', 'firstName lastName employeeId departmentId')
      .sort({ createdAt: -1 });

    return sendSuccess(res, 'Assets retrieved.', { assets });
  } catch (error) {
    next(error);
  }
};

export const createAsset = async (req, res, next) => {
  try {
    const { assetTag, name, category, serialNumber, purchaseDate, purchaseCost, condition } = req.body;

    const exists = await Asset.findOne({ assetTag: assetTag.toUpperCase() });
    if (exists) {
      return sendError(res, 'Asset tag already registered.', [], 409);
    }

    const asset = await Asset.create({
      assetTag: assetTag.toUpperCase(),
      name,
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
    const asset = await Asset.findById(id);
    if (!asset) return sendError(res, 'Asset not found.', [], 404);

    Object.assign(asset, req.body);
    if (req.body.assetTag) asset.assetTag = req.body.assetTag.toUpperCase();
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

    const asset = await Asset.findById(id);
    if (!asset) return sendError(res, 'Asset not found.', [], 404);

    if (asset.status === 'Assigned') {
      return sendError(res, 'Asset is already assigned to an employee.', [], 400);
    }

    const employee = await Employee.findById(employeeId);
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

