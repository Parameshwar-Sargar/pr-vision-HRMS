import { z } from 'zod';
import Designation from '../../models/Designation.js';
import Department from '../../models/Department.js';
import Employee from '../../models/Employee.js';
import { escapeRegex, isValidObjectId } from '../../utils/securityUtils.js';
import { sendSuccess, sendError, parsePagination, buildPaginationMeta } from '../../utils/responseUtils.js';

const designationSchema = z.object({
  title: z.string().trim().min(2, 'Designation title must be at least 2 characters'),
  departmentId: z.string().min(1, 'Department is required'),
  code: z.string().trim().optional().default(''),
  level: z.coerce.number().int().min(1).default(1),
  description: z.string().trim().optional().default(''),
});

export const getDesignations = async (req, res, next) => {
  try {
    const { departmentId } = req.query;
    const query = { isDeleted: false };
    if (departmentId) {
      if (!isValidObjectId(departmentId)) {
        return sendError(res, 'Invalid department ID format.', [], 400);
      }
      query.departmentId = departmentId;
    }

    const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 100, maxLimit: 200 });

    const [designations, total] = await Promise.all([
      Designation.find(query)
        .populate('departmentId', 'name code')
        .sort({ level: 1, title: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Designation.countDocuments(query),
    ]);

    return sendSuccess(res, 'Designations retrieved.', {
      designations,
      pagination: buildPaginationMeta(total, page, limit),
    });
  } catch (error) {
    next(error);
  }
};

export const createDesignation = async (req, res, next) => {
  try {
    const validated = designationSchema.parse(req.body);
    if (!isValidObjectId(validated.departmentId)) {
      return sendError(res, 'Invalid department ID.', [], 400);
    }

    const exists = await Designation.findOne({
      title: { $regex: new RegExp(`^${escapeRegex(validated.title)}$`, 'i') },
      departmentId: validated.departmentId,
      isDeleted: false,
    })
      .select('_id')
      .lean();
    if (exists) {
      return sendError(res, 'This designation already exists in this department.', [], 409);
    }

    const created = await Designation.create({
      title: validated.title,
      departmentId: validated.departmentId,
      code: validated.code || validated.title.substring(0, 4).toUpperCase(),
      level: validated.level,
      description: validated.description,
      createdBy: req.user?._id || null,
    });

    const designation = await Designation.findById(created._id)
      .populate('departmentId', 'name code')
      .lean();

    return sendSuccess(res, 'Designation created successfully.', { designation }, 201);
  } catch (error) {
    next(error);
  }
};

export const updateDesignation = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return sendError(res, 'Invalid designation ID.', [], 400);
    }
    const validated = designationSchema.parse(req.body);
    if (!isValidObjectId(validated.departmentId)) {
      return sendError(res, 'Invalid department ID.', [], 400);
    }

    const designation = await Designation.findOne({ _id: id, isDeleted: false });
    if (!designation) {
      return sendError(res, 'Designation not found.', [], 404);
    }

    const duplicate = await Designation.findOne({
      _id: { $ne: id },
      title: { $regex: new RegExp(`^${escapeRegex(validated.title)}$`, 'i') },
      departmentId: validated.departmentId,
      isDeleted: false,
    })
      .select('_id')
      .lean();
    if (duplicate) {
      return sendError(res, 'Another designation with this title already exists in this department.', [], 409);
    }

    designation.title = validated.title;
    designation.departmentId = validated.departmentId;
    designation.code = validated.code || designation.code;
    designation.level = validated.level;
    designation.description = validated.description;

    await designation.save();
    const populated = await Designation.findById(designation._id)
      .populate('departmentId', 'name code')
      .lean();
    return sendSuccess(res, 'Designation updated successfully.', { designation: populated });
  } catch (error) {
    next(error);
  }
};

export const deleteDesignation = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return sendError(res, 'Invalid designation ID.', [], 400);
    }

    const activeEmployees = await Employee.countDocuments({
      designationId: id,
      isDeleted: false,
    });

    if (activeEmployees > 0) {
      return sendError(
        res,
        `Cannot delete designation: ${activeEmployees} active employee(s) hold this designation.`,
        [],
        400
      );
    }

    const designation = await Designation.findOne({ _id: id, isDeleted: false });
    if (!designation) {
      return sendError(res, 'Designation not found.', [], 404);
    }

    designation.isDeleted = true;
    await designation.save();

    return sendSuccess(res, 'Designation deleted successfully.');
  } catch (error) {
    next(error);
  }
};
