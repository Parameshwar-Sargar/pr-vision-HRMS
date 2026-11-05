import { z } from 'zod';
import Employee from '../../models/Employee.js';
import User from '../../models/User.js';
import LeaveType from '../../models/LeaveType.js';
import LeaveBalance from '../../models/LeaveBalance.js';
import SalaryStructure from '../../models/SalaryStructure.js';
import Tenant from '../../models/Tenant.js';
import { ROLES } from '../../config/constants.js';
import { sendSuccess, sendError } from '../../utils/responseUtils.js';
import { logAudit } from '../../middleware/auditMiddleware.js';

const employeeCreateSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  email: z.string().email('Invalid email address'),
  phone: z.string().optional().default(''),
  departmentId: z.string().min(1, 'Department is required'),
  designationId: z.string().min(1, 'Designation is required'),
  managerId: z.string().nullable().optional(),
  shiftId: z.string().nullable().optional(),
  employmentType: z.enum(['Full-Time', 'Part-Time', 'Contract', 'Intern']).default('Full-Time'),
  gender: z.enum(['Male', 'Female', 'Non-Binary', 'Other']).default('Male'),
  dateOfBirth: z.string().optional(),
  joiningDate: z.string().optional(),
  address: z
    .object({
      street: z.string().optional().default(''),
      city: z.string().optional().default(''),
      state: z.string().optional().default(''),
      postalCode: z.string().optional().default(''),
      country: z.string().optional().default('India'),
    })
    .optional(),
  bankDetails: z
    .object({
      accountHolderName: z.string().optional().default(''),
      accountNumber: z.string().optional().default(''),
      bankName: z.string().optional().default(''),
      ifscCode: z.string().optional().default(''),
      branch: z.string().optional().default(''),
    })
    .optional(),
  // Portal account options
  createUserAccount: z.boolean().default(true),
  password: z.string().min(6).optional().default('Welcome@123'),
  role: z.enum([ROLES.COMPANY_ADMIN, ROLES.HR_MANAGER, ROLES.MANAGER, ROLES.EMPLOYEE]).default(ROLES.EMPLOYEE),
});

/**
 * List employees with search, department filter, status filter, and pagination
 */
export const getEmployees = async (req, res, next) => {
  try {
    const tenantId = req.tenantId;
    const { page = 1, limit = 10, search = '', departmentId, status } = req.query;

    const query = { tenantId, isDeleted: false };

    if (search) {
      query.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { employeeId: { $regex: search, $options: 'i' } },
      ];
    }

    if (departmentId) {
      query.departmentId = departmentId;
    }

    if (status) {
      query.employmentStatus = status;
    }

    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const total = await Employee.countDocuments(query);
    const employees = await Employee.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit, 10))
      .populate('departmentId', 'name code')
      .populate('designationId', 'title code')
      .populate('managerId', 'firstName lastName employeeId')
      .populate('shiftId', 'name startTime endTime')
      .populate('userId', 'role isActive lastLoginAt');

    return sendSuccess(res, 'Employees retrieved successfully.', {
      employees,
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
 * Get single employee by ID
 */
export const getEmployeeById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const employee = await Employee.findOne({ _id: id, tenantId: req.tenantId, isDeleted: false })
      .populate('departmentId')
      .populate('designationId')
      .populate('managerId', 'firstName lastName employeeId email')
      .populate('shiftId')
      .populate('userId', 'role isActive lastLoginAt');

    if (!employee) {
      return sendError(res, 'Employee not found.', [], 404);
    }

    // Include leave balances and active salary structure
    const currentYear = new Date().getFullYear();
    const leaveBalances = await LeaveBalance.findOne({
      tenantId: req.tenantId,
      employeeId: employee._id,
      year: currentYear,
    }).populate('balances.leaveTypeId');

    const salary = await SalaryStructure.findOne({
      tenantId: req.tenantId,
      employeeId: employee._id,
      isActive: true,
    });

    return sendSuccess(res, 'Employee profile retrieved.', {
      employee,
      leaveBalances,
      salary,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Create a new employee
 */
export const createEmployee = async (req, res, next) => {
  try {
    const tenantId = req.tenantId;
    const validated = employeeCreateSchema.parse(req.body);

    // 1. Check tenant employee limit
    const tenant = await Tenant.findById(tenantId);
    const currentCount = await Employee.countDocuments({ tenantId, isDeleted: false });
    if (tenant?.employeeLimit && currentCount >= tenant.employeeLimit) {
      return sendError(
        res,
        `Employee quota reached (${currentCount}/${tenant.employeeLimit}). Please upgrade your plan.`,
        [],
        400
      );
    }

    // 2. Check for duplicate email in this company
    const duplicateEmail = await Employee.findOne({ tenantId, email: validated.email.toLowerCase(), isDeleted: false });
    if (duplicateEmail) {
      return sendError(res, 'An employee with this email already exists in your company.', [], 409);
    }

    // 3. Auto-generate sequential Employee ID (e.g. EMP-001)
    const lastEmployee = await Employee.findOne({ tenantId }).sort({ createdAt: -1 });
    let nextNum = 1;
    if (lastEmployee && lastEmployee.employeeId) {
      const match = lastEmployee.employeeId.match(/\d+$/);
      if (match) {
        nextNum = parseInt(match[0], 10) + 1;
      }
    }
    const generatedEmpId = `EMP-${String(nextNum).padStart(3, '0')}`;

    // 4. Create Employee record
    const employee = await Employee.create({
      tenantId,
      employeeId: generatedEmpId,
      firstName: validated.firstName,
      lastName: validated.lastName,
      email: validated.email.toLowerCase(),
      phone: validated.phone,
      departmentId: validated.departmentId,
      designationId: validated.designationId,
      managerId: validated.managerId || null,
      shiftId: validated.shiftId || null,
      employmentType: validated.employmentType,
      gender: validated.gender,
      dateOfBirth: validated.dateOfBirth ? new Date(validated.dateOfBirth) : undefined,
      joiningDate: validated.joiningDate ? new Date(validated.joiningDate) : new Date(),
      address: validated.address,
      bankDetails: validated.bankDetails,
    });

    // 5. Create User account if requested
    let createdUser = null;
    if (validated.createUserAccount) {
      const existingUser = await User.findOne({ tenantId, email: validated.email.toLowerCase() });
      if (!existingUser) {
        createdUser = await User.create({
          tenantId,
          email: validated.email.toLowerCase(),
          password: validated.password,
          name: `${validated.firstName} ${validated.lastName}`.trim(),
          role: validated.role,
          employeeId: employee._id,
          isActive: true,
        });
        employee.userId = createdUser._id;
        await employee.save();
      }
    }

    // 6. Initialize default Leave Balances
    const leaveTypes = await LeaveType.find({ tenantId, isActive: true });
    if (leaveTypes.length > 0) {
      const currentYear = new Date().getFullYear();
      const balances = leaveTypes.map((lt) => ({
        leaveTypeId: lt._id,
        allocated: lt.defaultDaysPerYear,
        used: 0,
        pending: 0,
        remaining: lt.defaultDaysPerYear,
      }));

      await LeaveBalance.create({
        tenantId,
        employeeId: employee._id,
        year: currentYear,
        balances,
      });
    }

    await logAudit({
      req,
      action: 'EMPLOYEE_CREATED',
      entity: 'Employee',
      entityId: employee._id,
      details: { employeeId: employee.employeeId, email: employee.email },
    });

    return sendSuccess(res, 'Employee added successfully.', { employee, user: createdUser }, 201);
  } catch (error) {
    next(error);
  }
};

/**
 * Update employee
 */
export const updateEmployee = async (req, res, next) => {
  try {
    const { id } = req.params;
    const employee = await Employee.findOne({ _id: id, tenantId: req.tenantId, isDeleted: false });

    if (!employee) {
      return sendError(res, 'Employee not found.', [], 404);
    }

    const updatableFields = [
      'firstName',
      'lastName',
      'phone',
      'avatar',
      'dateOfBirth',
      'gender',
      'joiningDate',
      'departmentId',
      'designationId',
      'managerId',
      'shiftId',
      'employmentType',
      'employmentStatus',
      'address',
      'bankDetails',
      'emergencyContact',
    ];

    for (const field of updatableFields) {
      if (req.body[field] !== undefined) {
        employee[field] = req.body[field];
      }
    }

    await employee.save();

    await logAudit({
      req,
      action: 'EMPLOYEE_UPDATED',
      entity: 'Employee',
      entityId: employee._id,
      details: { employeeId: employee.employeeId },
    });

    return sendSuccess(res, 'Employee updated successfully.', { employee });
  } catch (error) {
    next(error);
  }
};

/**
 * Soft delete / deactivate employee
 */
export const deleteEmployee = async (req, res, next) => {
  try {
    const { id } = req.params;
    const employee = await Employee.findOne({ _id: id, tenantId: req.tenantId });

    if (!employee) {
      return sendError(res, 'Employee not found.', [], 404);
    }

    employee.isDeleted = true;
    employee.employmentStatus = 'Terminated';
    await employee.save();

    // Also deactivate linked user account
    if (employee.userId) {
      await User.findByIdAndUpdate(employee.userId, { isActive: false });
    }

    await logAudit({
      req,
      action: 'EMPLOYEE_DEACTIVATED',
      entity: 'Employee',
      entityId: employee._id,
      details: { employeeId: employee.employeeId },
    });

    return sendSuccess(res, 'Employee deactivated successfully.');
  } catch (error) {
    next(error);
  }
};

