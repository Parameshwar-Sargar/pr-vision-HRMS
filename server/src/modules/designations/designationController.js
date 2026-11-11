import { z } from 'zod';
import Designation from '../../models/Designation.js';
import Employee from '../../models/Employee.js';
import { sendSuccess, sendError } from '../../utils/responseUtils.js';

const designationSchema = z.object({
  title: z.string().min(2, 'Designation title must be at least 2 characters'),
  departmentId: z.string().min(1, 'Department is required'),
  code: z.string().optional().default(''),
  level: z.number().default(1),
  description: z.string().optional().default(''),
});

export const getDesignations = async (req, res, next) => {
  try {
    const { departmentId } = req.query;
    const query = { isDeleted: false };
    if (departmentId) {
      query.departmentId = departmentId;
    }

    const designations = await Designation.find(query)
      .populate('departmentId', 'name code')
      .sort({ level: 1, title: 1 })
      .lean();

    return sendSuccess(res, 'Designations retrieved.', { designations });
  } catch (error) {
    next(error);
  }
};

export const createDesignation = async (req, res, next) => {
  try {
    const validated = designationSchema.parse(req.body);

    const exists = await Designation.findOne({
      title: { $regex: new RegExp(`^${validated.title}$`, 'i') },
      departmentId: validated.departmentId,
      isDeleted: false,
    }).lean();
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
    const validated = designationSchema.parse(req.body);

    const designation = await Designation.findOne({ _id: id, isDeleted: false });
    if (!designation) {
      return sendError(res, 'Designation not found.', [], 404);
    }

    designation.title = validated.title;
    designation.departmentId = validated.departmentId;
    designation.code = validated.code || designation.code;
    designation.level = validated.level;
    designation.description = validated.description;

    await designation.save();
    return sendSuccess(res, 'Designation updated successfully.', { designation });
  } catch (error) {
    next(error);
  }
};

export const deleteDesignation = async (req, res, next) => {
  try {
    const { id } = req.params;

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

    const designation = await Designation.findOne({ _id: id });
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
