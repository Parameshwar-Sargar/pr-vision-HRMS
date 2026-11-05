import { z } from 'zod';
import Employee from '../../models/Employee.js';
import User from '../../models/User.js';
import LeaveType from '../../models/LeaveType.js';
import LeaveBalance from '../../models/LeaveBalance.js';
import SalaryStructure from '../../models/SalaryStructure.js';
import { ROLES, LIFECYCLE_STAGES } from '../../config/constants.js';
import { sendSuccess, sendError } from '../../utils/responseUtils.js';
import { logAudit } from '../../middleware/auditMiddleware.js';

const employeeCreateSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  email: z.string().email('Invalid email address'),
  phone: z.string().optional().default(''),
  branchId: z.string().nullable().optional(),
  departmentId: z.string().min(1, 'Department is required'),
  designationId: z.string().min(1, 'Designation is required'),
  managerId: z.string().nullable().optional(),
  shiftId: z.string().nullable().optional(),
  employmentType: z.enum(['Full-Time', 'Part-Time', 'Contract', 'Intern']).default('Full-Time'),
  gender: z.enum(['Male', 'Female', 'Non-Binary', 'Other']).default('Male'),
  dateOfBirth: z.string().optional(),
  joiningDate: z.string().optional(),
  probationPeriodMonths: z.number().default(3),
  address: z
    .object({
      street: z.string().optional().default(''),
      city: z.string().optional().default(''),
      state: z.string().optional().default(''),
      postalCode: z.string().optional().default(''),
      country: z.string().optional().default('India'),
    })
    .optional(),
  emergencyContact: z
    .object({
      name: z.string().optional().default(''),
      relationship: z.string().optional().default(''),
      phone: z.string().optional().default(''),
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
  createUserAccount: z.boolean().default(true),
  password: z.string().min(6).optional().default('Welcome@123'),
  role: z.enum([ROLES.ADMIN, ROLES.HR_MANAGER, ROLES.MANAGER, ROLES.EMPLOYEE, ROLES.RECRUITER, ROLES.PAYROLL_ADMIN]).default(ROLES.EMPLOYEE),
});

export const getEmployees = async (req, res, next) => {
  try {
    const { page = 1, limit = 10, search = '', departmentId, branchId, status } = req.query;

    const query = { isDeleted: false };

    if (search) {
      query.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { employeeId: { $regex: search, $options: 'i' } },
      ];
    }

    if (departmentId) query.departmentId = departmentId;
    if (branchId) query.branchId = branchId;
    if (status) query.employmentStatus = status;

    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const total = await Employee.countDocuments(query);
    const employees = await Employee.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit, 10))
      .populate('departmentId', 'name code')
      .populate('designationId', 'title code')
      .populate('branchId', 'name code city')
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

export const getEmployeeById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const employee = await Employee.findOne({ _id: id, isDeleted: false })
      .populate('departmentId')
      .populate('designationId')
      .populate('branchId')
      .populate('managerId', 'firstName lastName employeeId email')
      .populate('shiftId')
      .populate('userId', 'role isActive lastLoginAt permissions');

    if (!employee) {
      return sendError(res, 'Employee not found.', [], 404);
    }

    const currentYear = new Date().getFullYear();
    const leaveBalances = await LeaveBalance.findOne({
      employeeId: employee._id,
      year: currentYear,
    }).populate('balances.leaveTypeId');

    const salary = await SalaryStructure.findOne({
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

export const createEmployee = async (req, res, next) => {
  try {
    const validated = employeeCreateSchema.parse(req.body);

    const duplicateEmail = await Employee.findOne({ email: validated.email.toLowerCase(), isDeleted: false });
    if (duplicateEmail) {
      return sendError(res, 'An employee with this email address already exists.', [], 409);
    }

    // Auto-generate sequential Employee ID (EMP-001)
    const lastEmployee = await Employee.findOne().sort({ createdAt: -1 });
    let nextNum = 1;
    if (lastEmployee && lastEmployee.employeeId) {
      const match = lastEmployee.employeeId.match(/\d+$/);
      if (match) {
        nextNum = parseInt(match[0], 10) + 1;
      }
    }
    const generatedEmpId = `EMP-${String(nextNum).padStart(3, '0')}`;

    const joinDate = validated.joiningDate ? new Date(validated.joiningDate) : new Date();
    const probEnd = new Date(joinDate);
    probEnd.setMonth(probEnd.getMonth() + (validated.probationPeriodMonths || 3));

    const employee = await Employee.create({
      employeeId: generatedEmpId,
      firstName: validated.firstName,
      lastName: validated.lastName,
      email: validated.email.toLowerCase(),
      phone: validated.phone,
      branchId: validated.branchId || null,
      departmentId: validated.departmentId,
      designationId: validated.designationId,
      managerId: validated.managerId || null,
      shiftId: validated.shiftId || null,
      employmentType: validated.employmentType,
      employmentStatus: LIFECYCLE_STAGES.PROBATION,
      gender: validated.gender,
      dateOfBirth: validated.dateOfBirth ? new Date(validated.dateOfBirth) : undefined,
      joiningDate: joinDate,
      probationPeriodMonths: validated.probationPeriodMonths || 3,
      probationEndDate: probEnd,
      address: validated.address,
      emergencyContact: validated.emergencyContact,
      bankDetails: validated.bankDetails,
    });

    // Create User login account if checked
    let createdUser = null;
    if (validated.createUserAccount) {
      const existingUser = await User.findOne({ email: validated.email.toLowerCase() });
      if (!existingUser) {
        createdUser = await User.create({
          email: validated.email.toLowerCase(),
          password: validated.password,
          name: `${validated.firstName} ${validated.lastName}`.trim(),
          role: validated.role,
          employeeId: employee._id,
          branchId: employee.branchId,
          isActive: true,
        });
        employee.userId = createdUser._id;
        await employee.save();
      }
    }

    // Initialize Leave Balances
    const leaveTypes = await LeaveType.find({ isActive: true });
    if (leaveTypes.length > 0) {
      const currentYear = new Date().getFullYear();
      await LeaveBalance.create({
        employeeId: employee._id,
        year: currentYear,
        balances: leaveTypes.map((lt) => ({
          leaveTypeId: lt._id,
          allocated: lt.defaultDaysPerYear,
          used: 0,
          pending: 0,
          remaining: lt.defaultDaysPerYear,
        })),
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

export const updateEmployee = async (req, res, next) => {
  try {
    const { id } = req.params;
    const employee = await Employee.findOne({ _id: id, isDeleted: false });

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
      'branchId',
      'departmentId',
      'designationId',
      'managerId',
      'shiftId',
      'employmentType',
      'address',
      'bankDetails',
      'emergencyContact',
      'education',
      'previousEmployment',
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

// ==========================================
// LIFECYCLE MANAGEMENT ENDPOINTS
// ==========================================

// 1. Confirm Probation
export const confirmProbation = async (req, res, next) => {
  try {
    const { id } = req.params;
    const employee = await Employee.findById(id);
    if (!employee) return sendError(res, 'Employee not found.', [], 404);

    employee.employmentStatus = LIFECYCLE_STAGES.CONFIRMED;
    employee.confirmationDate = new Date();
    await employee.save();

    await logAudit({
      req,
      action: 'PROBATION_CONFIRMED',
      entity: 'Employee',
      entityId: employee._id,
      details: { employeeId: employee.employeeId, confirmedAt: employee.confirmationDate },
    });

    return sendSuccess(res, `Probation confirmed for ${employee.firstName} ${employee.lastName}.`, { employee });
  } catch (error) {
    next(error);
  }
};

// 2. Promote Employee
export const promoteEmployee = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { newDesignationId, newDepartmentId, remarks } = req.body;

    const employee = await Employee.findById(id);
    if (!employee) return sendError(res, 'Employee not found.', [], 404);

    const oldDesig = employee.designationId;
    if (newDesignationId) employee.designationId = newDesignationId;
    if (newDepartmentId) employee.departmentId = newDepartmentId;
    employee.employmentStatus = LIFECYCLE_STAGES.PROMOTED;
    await employee.save();

    await logAudit({
      req,
      action: 'EMPLOYEE_PROMOTED',
      entity: 'Employee',
      entityId: employee._id,
      details: { previousDesignation: oldDesig, newDesignationId, remarks },
    });

    return sendSuccess(res, `Promotion processed for ${employee.firstName} ${employee.lastName}.`, { employee });
  } catch (error) {
    next(error);
  }
};

// 3. Process Resignation / Exit
export const processResignation = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { resignationDate, lastWorkingDate, exitInterviewNotes } = req.body;

    const employee = await Employee.findById(id);
    if (!employee) return sendError(res, 'Employee not found.', [], 404);

    employee.employmentStatus = LIFECYCLE_STAGES.RESIGNED;
    if (resignationDate) employee.resignationDate = new Date(resignationDate);
    if (lastWorkingDate) employee.lastWorkingDate = new Date(lastWorkingDate);
    if (exitInterviewNotes) employee.exitInterviewNotes = exitInterviewNotes;
    employee.fullAndFinalSettlementStatus = 'Pending';

    await employee.save();

    await logAudit({
      req,
      action: 'EMPLOYEE_RESIGNED',
      entity: 'Employee',
      entityId: employee._id,
      details: { lastWorkingDate },
    });

    return sendSuccess(res, 'Resignation registered and exit workflow initiated.', { employee });
  } catch (error) {
    next(error);
  }
};

// 4. Issue Relieving / Experience Letter
export const issueRelievingLetter = async (req, res, next) => {
  try {
    const { id } = req.params;
    const employee = await Employee.findById(id);
    if (!employee) return sendError(res, 'Employee not found.', [], 404);

    employee.relievingLetterIssued = true;
    employee.experienceLetterIssued = true;
    employee.employmentStatus = LIFECYCLE_STAGES.RELIEVED;
    await employee.save();

    await logAudit({
      req,
      action: 'RELIEVING_LETTER_ISSUED',
      entity: 'Employee',
      entityId: employee._id,
      details: { employeeId: employee.employeeId },
    });

    return sendSuccess(res, `Relieving & Experience letters issued for ${employee.firstName} ${employee.lastName}.`, {
      employee,
    });
  } catch (error) {
    next(error);
  }
};

// 5. Soft Delete / Deactivate
export const deleteEmployee = async (req, res, next) => {
  try {
    const { id } = req.params;
    const employee = await Employee.findById(id);
    if (!employee) return sendError(res, 'Employee not found.', [], 404);

    employee.isDeleted = true;
    employee.employmentStatus = LIFECYCLE_STAGES.TERMINATED;
    await employee.save();

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
