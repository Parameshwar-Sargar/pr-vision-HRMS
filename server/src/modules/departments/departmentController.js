import { z } from 'zod';
import Department from '../../models/Department.js';
import Employee from '../../models/Employee.js';
import { sendSuccess, sendError } from '../../utils/responseUtils.js';

const departmentSchema = z.object({
  name: z.string().min(2, 'Department name must be at least 2 characters'),
  code: z.string().optional().default(''),
  description: z.string().optional().default(''),
  headId: z.string().nullable().optional(),
  branchId: z.string().nullable().optional(),
});

export const getDepartments = async (req, res, next) => {
  try {
    const { branchId } = req.query;
    const filter = { isDeleted: false };
    if (branchId) filter.branchId = branchId;

    const [departments, counts] = await Promise.all([
      Department.find(filter)
        .populate('headId', 'firstName lastName employeeId email')
        .populate('branchId', 'name code')
        .sort({ name: 1 })
        .lean(),
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

    return sendSuccess(res, 'Departments retrieved.', { departments: deptsWithCount });
  } catch (error) {
    next(error);
  }
};

export const createDepartment = async (req, res, next) => {
  try {
    const validated = departmentSchema.parse(req.body);

    const exists = await Department.findOne({
      name: { $regex: new RegExp(`^${validated.name}$`, 'i') },
      isDeleted: false,
    }).lean();
    if (exists) {
      return sendError(res, 'Department with this name already exists in your company.', [], 409);
    }

    const created = await Department.create({
      name: validated.name,
      code: validated.code || validated.name.substring(0, 3).toUpperCase(),
      description: validated.description,
      headId: validated.headId || null,
      branchId: validated.branchId || null,
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
    const validated = departmentSchema.parse(req.body);

    const department = await Department.findOne({ _id: id, isDeleted: false });
    if (!department) {
      return sendError(res, 'Department not found.', [], 404);
    }

    department.name = validated.name;
    department.code = validated.code || department.code;
    department.description = validated.description;
    department.headId = validated.headId || null;
    if (validated.branchId !== undefined) {
      department.branchId = validated.branchId;
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

    const department = await Department.findOne({ _id: id });
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
