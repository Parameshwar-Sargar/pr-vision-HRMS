import { z } from 'zod';
import Department from '../../models/Department.js';
import Branch from '../../models/Branch.js';
import Employee from '../../models/Employee.js';
import { escapeRegex, isValidObjectId } from '../../utils/securityUtils.js';
import { sendSuccess, sendError, parsePagination, buildPaginationMeta } from '../../utils/responseUtils.js';

const departmentSchema = z.object({
  name: z.string().trim().min(2, 'Department name must be at least 2 characters'),
  code: z.string().trim().optional().default(''),
  description: z.string().trim().optional().default(''),
  headId: z.string().nullable().optional(),
  branchId: z.string().nullable().optional(),
});

export const getDepartments = async (req, res, next) => {
  try {
    const { branchId } = req.query;
    const filter = { isDeleted: false };
    if (branchId) {
      if (!isValidObjectId(branchId)) {
        return sendError(res, 'Invalid branch ID format.', [], 400);
      }
      filter.branchId = branchId;
    }

    const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 100, maxLimit: 200 });

    const [departments, total, counts] = await Promise.all([
      Department.find(filter)
        .populate('headId', 'firstName lastName employeeId email')
        .populate('branchId', 'name code')
        .sort({ name: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Department.countDocuments(filter),
      Employee.aggregate([
        { $match: { isDeleted: false } },
        { $group: { _id: '$departmentId', count: { $sum: 1 } } },
      ]),
    ]);

    const countMap = new Map(counts.map((c) => [c._id?.toString(), c.count]));
    const deptsWithCount = departments.map((dept) => ({
      ...dept,
      employeeCount: countMap.get(dept._id.toString()) || 0,
    }));

    return sendSuccess(res, 'Departments retrieved.', {
      departments: deptsWithCount,
      pagination: buildPaginationMeta(total, page, limit),
    });
  } catch (error) {
    next(error);
  }
};

export const createDepartment = async (req, res, next) => {
  try {
    const validated = departmentSchema.parse(req.body);
    const headId = validated.headId || null;
    const branchId = validated.branchId || null;
    if (headId && !isValidObjectId(headId)) {
      return sendError(res, 'Invalid department head ID.', [], 400);
    }
    if (branchId && !isValidObjectId(branchId)) {
      return sendError(res, 'Invalid branch ID.', [], 400);
    }

    const exists = await Department.findOne({
      name: { $regex: new RegExp(`^${escapeRegex(validated.name)}$`, 'i') },
      isDeleted: false,
    })
      .select('_id')
      .lean();
    if (exists) {
      return sendError(res, 'Department with this name already exists in your company.', [], 409);
    }

    const created = await Department.create({
      name: validated.name,
      code: validated.code || validated.name.substring(0, 3).toUpperCase(),
      description: validated.description,
      headId,
      branchId,
      createdBy: req.user?._id || null,
    });

    const populated = await Department.findById(created._id)
      .populate('headId', 'firstName lastName employeeId email')
      .populate('branchId', 'name code')
      .lean();

    const department = { ...populated, employeeCount: 0 };

    return sendSuccess(res, 'Department created successfully.', { department }, 201);
  } catch (error) {
    next(error);
  }
};

export const updateDepartment = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return sendError(res, 'Invalid department ID.', [], 400);
    }
    const validated = departmentSchema.parse(req.body);
    const headId = validated.headId || null;
    const branchId = validated.branchId === undefined ? undefined : validated.branchId || null;
    if (headId && !isValidObjectId(headId)) {
      return sendError(res, 'Invalid department head ID.', [], 400);
    }
    if (branchId && !isValidObjectId(branchId)) {
      return sendError(res, 'Invalid branch ID.', [], 400);
    }

    const department = await Department.findOne({ _id: id, isDeleted: false });
    if (!department) {
      return sendError(res, 'Department not found.', [], 404);
    }

    const duplicate = await Department.findOne({
      _id: { $ne: id },
      name: { $regex: new RegExp(`^${escapeRegex(validated.name)}$`, 'i') },
      isDeleted: false,
    })
      .select('_id')
      .lean();
    if (duplicate) {
      return sendError(res, 'Another department with this name already exists.', [], 409);
    }

    department.name = validated.name;
    department.code = validated.code || department.code;
    department.description = validated.description;
    department.headId = headId;
    if (branchId !== undefined) {
      department.branchId = branchId;
    }

    await department.save();

    const [populated, employeeCount] = await Promise.all([
      Department.findById(department._id)
        .populate('headId', 'firstName lastName employeeId email')
        .populate('branchId', 'name code')
        .lean(),
      Employee.countDocuments({ departmentId: department._id, isDeleted: false }),
    ]);

    return sendSuccess(res, 'Department updated successfully.', {
      department: { ...populated, employeeCount },
    });
  } catch (error) {
    next(error);
  }
};

export const deleteDepartment = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return sendError(res, 'Invalid department ID.', [], 400);
    }

    // Safety check: Cannot delete department if active employees belong to it!
    const activeEmployees = await Employee.countDocuments({
      departmentId: id,
      isDeleted: false,
    });

    if (activeEmployees > 0) {
      return sendError(
        res,
        `Cannot delete department: ${activeEmployees} active employee(s) are currently assigned to it. Please reassign them first.`,
        [],
        400
      );
    }

    const department = await Department.findOne({ _id: id, isDeleted: false });
    if (!department) {
      return sendError(res, 'Department not found.', [], 404);
    }

    department.isDeleted = true;
    await department.save();

    return sendSuccess(res, 'Department deleted successfully.');
  } catch (error) {
    next(error);
  }
};
