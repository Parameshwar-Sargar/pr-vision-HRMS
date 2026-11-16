import { z } from 'zod';
import Employee from '../../models/Employee.js';
import User from '../../models/User.js';
import Department from '../../models/Department.js';
import Designation from '../../models/Designation.js';
import Branch from '../../models/Branch.js';
import Shift from '../../models/Shift.js';
import LeaveType from '../../models/LeaveType.js';
import LeaveBalance from '../../models/LeaveBalance.js';
import SalaryStructure from '../../models/SalaryStructure.js';
import { ROLES, LIFECYCLE_STAGES } from '../../config/constants.js';
import { sendSuccess, sendError, parsePagination, buildPaginationMeta } from '../../utils/responseUtils.js';
import {
  isAdminRole,
  isAdminOrHR,
  isPayrollPrivileged,
  isValidObjectId,
  escapeRegex,
  sanitizeUserForResponse,
} from '../../utils/securityUtils.js';
import UserSession from '../../models/UserSession.js';
import { logAudit } from '../../middleware/auditMiddleware.js';
import { invalidateAuthCache } from '../../middleware/authMiddleware.js';

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
  role: z
    .enum([
      ROLES.SUPER_ADMIN,
      ROLES.ADMIN,
      ROLES.HR_MANAGER,
      ROLES.MANAGER,
      ROLES.EMPLOYEE,
      ROLES.RECRUITER,
      ROLES.PAYROLL_ADMIN,
    ])
    .default(ROLES.EMPLOYEE),
});

const selfProfileUpdateSchema = z.object({
  phone: z.string().max(30).optional(),
  address: z
    .object({
      street: z.string().max(200).optional(),
      city: z.string().max(100).optional(),
      state: z.string().max(100).optional(),
      postalCode: z.string().max(20).optional(),
      country: z.string().max(100).optional(),
    })
    .optional(),
  emergencyContact: z
    .object({
      name: z.string().max(120).optional(),
      relationship: z.string().max(80).optional(),
      phone: z.string().max(30).optional(),
    })
    .optional(),
});

const ensureCanManageTargetEmployee = async (req, employee) => {
  if (!employee?.userId || isAdminRole(req.user.role)) {
    return true;
  }
  const targetUser = await User.findById(employee.userId).select('role').lean();
  if (targetUser && isAdminRole(targetUser.role)) {
    return false;
  }
  return true;
};

export const getEmployees = async (req, res, next) => {
  try {
    const { search = '', departmentId, branchId, status } = req.query;

    // RBAC: Employees and Recruiters cannot view the organization-wide employee directory
    if (req.user.role === ROLES.EMPLOYEE || req.user.role === ROLES.RECRUITER) {
      return sendError(
        res,
        'Access denied: Your role does not permit viewing the organization-wide employee directory.',
        [],
        403
      );
    }

    const query = { isDeleted: false };
    let projection = '-bankDetails -previousEmployment -exitInterviewNotes';

    // Managers can only view their direct reporting team with restricted PII fields
    if (req.user.role === ROLES.MANAGER) {
      if (!req.verifiedEmployeeId) {
        return sendError(res, 'Access denied: No manager employee profile found.', [], 403);
      }
      query.managerId = req.verifiedEmployeeId;
      projection = '-bankDetails -previousEmployment -exitInterviewNotes -address -emergencyContact -dateOfBirth';
    } else if (!isPayrollPrivileged(req.user.role)) {
      return sendError(res, 'Access denied: Insufficient permissions to view employee directory.', [], 403);
    }

    if (search) {
      const safeSearch = escapeRegex(String(search).trim());
      query.$or = [
        { firstName: { $regex: safeSearch, $options: 'i' } },
        { lastName: { $regex: safeSearch, $options: 'i' } },
        { email: { $regex: safeSearch, $options: 'i' } },
        { employeeId: { $regex: safeSearch, $options: 'i' } },
      ];
    }

    if (departmentId) query.departmentId = departmentId;
    if (branchId) query.branchId = branchId;
    if (status) query.employmentStatus = status;

    const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 10, maxLimit: 200 });

    const [total, employees] = await Promise.all([
      Employee.countDocuments(query),
      Employee.find(query)
        .select(projection)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('departmentId', 'name code')
        .populate('designationId', 'title code')
        .populate('branchId', 'name code city')
        .populate('managerId', 'firstName lastName employeeId')
        .populate('shiftId', 'name startTime endTime')
        .populate('userId', 'role isActive lastLoginAt')
        .lean(),
    ]);

    return sendSuccess(res, 'Employees retrieved successfully.', {
      employees,
      pagination: buildPaginationMeta(total, page, limit),
    });
  } catch (error) {
    next(error);
  }
};

export const getEmployeeById = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return sendError(res, 'Invalid employee ID format.', [], 400);
    }

    // RBAC: An employee or recruiter can ONLY view their own employee profile
    if (req.user.role === ROLES.EMPLOYEE || req.user.role === ROLES.RECRUITER) {
      if (!req.verifiedEmployeeId || id.toString() !== req.verifiedEmployeeId.toString()) {
        return sendError(res, 'Access denied: You cannot view another employee profile.', [], 403);
      }
    }

    const currentYear = new Date().getFullYear();
    const isSelf = !!(req.verifiedEmployeeId && id.toString() === req.verifiedEmployeeId.toString());

    // Sensitive Finance (Salary Structure & Bank Details): Only visible to ADMIN, SUPER_ADMIN, HR_MANAGER, PAYROLL_ADMIN, or employee themselves
    const canViewSalary = isPayrollPrivileged(req.user.role) || isSelf;

    const [employee, leaveBalances, salary] = await Promise.all([
      Employee.findOne({ _id: id, isDeleted: false })
        .populate('departmentId')
        .populate('designationId')
        .populate('branchId')
        .populate('managerId', 'firstName lastName employeeId email')
        .populate('shiftId')
        .populate('userId', 'role isActive lastLoginAt permissions')
        .lean(),
      LeaveBalance.findOne({
        employeeId: id,
        year: currentYear,
      })
        .populate('balances.leaveTypeId')
        .lean(),
      canViewSalary
        ? SalaryStructure.findOne({
            employeeId: id,
            isActive: true,
          }).lean()
        : Promise.resolve(null),
    ]);

    if (!employee) {
      return sendError(res, 'Employee not found.', [], 404);
    }

    // Managers can only view self or direct reports, and cannot view reports' sensitive personal/finance details
    if (req.user.role === ROLES.MANAGER) {
      const isDirectReport =
        req.verifiedEmployeeId &&
        employee.managerId?._id?.toString() === req.verifiedEmployeeId.toString();
      if (!isSelf && !isDirectReport) {
        return sendError(res, 'Access denied: You can only view profiles for your direct reporting team.', [], 403);
      }
      if (!isSelf) {
        delete employee.bankDetails;
        delete employee.previousEmployment;
        delete employee.exitInterviewNotes;
        delete employee.address;
        delete employee.emergencyContact;
        if (employee.userId && typeof employee.userId === 'object') {
          delete employee.userId.permissions;
        }
      }
    } else if (!canViewSalary) {
      delete employee.bankDetails;
      delete employee.previousEmployment;
      delete employee.exitInterviewNotes;
    }

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
 * Get Authenticated Employee Profile (Self-Service)
 */
export const getMyProfile = async (req, res, next) => {
  try {
    if (!req.verifiedEmployeeId) {
      return sendError(res, 'No active employee profile linked to your user account.', [], 404);
    }

    const currentYear = new Date().getFullYear();

    const [employee, leaveBalances, salary] = await Promise.all([
      Employee.findOne({ _id: req.verifiedEmployeeId, isDeleted: false })
        .populate('departmentId')
        .populate('designationId')
        .populate('branchId')
        .populate('managerId', 'firstName lastName employeeId email')
        .populate('shiftId')
        .populate('userId', 'role isActive lastLoginAt')
        .lean(),
      LeaveBalance.findOne({
        employeeId: req.verifiedEmployeeId,
        year: currentYear,
      })
        .populate('balances.leaveTypeId')
        .lean(),
      SalaryStructure.findOne({
        employeeId: req.verifiedEmployeeId,
        isActive: true,
      }).lean(),
    ]);

    if (!employee) {
      return sendError(res, 'Employee record not found.', [], 404);
    }

    return sendSuccess(res, 'Self profile retrieved.', {
      employee,
      leaveBalances,
      salary,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update Authenticated Employee Profile (Self-Service Contact Updates)
 */
export const updateMyProfile = async (req, res, next) => {
  try {
    if (!req.verifiedEmployeeId) {
      return sendError(res, 'No active employee profile linked to your user account.', [], 404);
    }

    const employee = await Employee.findOne({ _id: req.verifiedEmployeeId, isDeleted: false });
    if (!employee) {
      return sendError(res, 'Employee record not found.', [], 404);
    }

    const validated = selfProfileUpdateSchema.parse(req.body);

    // Only allow self-service contact field updates
    if (validated.phone !== undefined) employee.phone = validated.phone;
    if (validated.address !== undefined) employee.address = { ...employee.address, ...validated.address };
    if (validated.emergencyContact !== undefined) {
      employee.emergencyContact = { ...employee.emergencyContact, ...validated.emergencyContact };
    }

    await employee.save();

    await logAudit({
      req,
      action: 'EMPLOYEE_SELF_UPDATE',
      entity: 'Employee',
      entityId: employee._id,
      details: { updatedFields: Object.keys(validated) },
    });

    return sendSuccess(res, 'Profile updated successfully.', { employee });
  } catch (error) {
    next(error);
  }
};

export const createEmployee = async (req, res, next) => {
  try {
    // Privilege Escalation Prevention: Block non-Admin attempts to create ADMIN / SUPER_ADMIN accounts upfront
    const rawTargetRole = String(req.body?.role || '').toUpperCase().trim();
    if (
      (rawTargetRole === ROLES.ADMIN || rawTargetRole === ROLES.SUPER_ADMIN) &&
      !isAdminRole(req.user.role)
    ) {
      return sendError(
        res,
        'Access denied: HR_MANAGER cannot register or promote a user to ADMIN or SUPER_ADMIN.',
        [],
        403
      );
    }

    const validated = employeeCreateSchema.parse(req.body);
    const normalizedEmail = validated.email.toLowerCase();

    // Privilege Escalation Prevention: Only ADMIN or SUPER_ADMIN can create an ADMIN / SUPER_ADMIN user
    if (validated.createUserAccount) {
      const targetRole = String(validated.role || '').toUpperCase();
      const isTargetAdmin = targetRole === ROLES.ADMIN || targetRole === ROLES.SUPER_ADMIN;

      if (isTargetAdmin && !isAdminRole(req.user.role)) {
        return sendError(
          res,
          'Access denied: HR_MANAGER cannot register or promote a user to ADMIN or SUPER_ADMIN.',
          [],
          403
        );
      }
    }

    const [duplicateEmail, lastEmployee, existingUser, leaveTypes] = await Promise.all([
      Employee.findOne({ email: normalizedEmail, isDeleted: false }).select('_id').lean(),
      Employee.findOne().sort({ createdAt: -1 }).select('employeeId').lean(),
      validated.createUserAccount
        ? User.findOne({ email: normalizedEmail }).select('_id').lean()
        : Promise.resolve(null),
      LeaveType.find({ isActive: true }).lean(),
    ]);

    if (duplicateEmail) {
      return sendError(res, 'An employee with this email address already exists.', [], 409);
    }

    if (validated.createUserAccount && existingUser) {
      return sendError(res, 'A user login account with this email address already exists.', [], 409);
    }

    // Auto-generate sequential Employee ID (EMP-001)
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
      email: normalizedEmail,
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

    // Create User login account and Leave Balances in parallel
    let createdUser = null;
    const postCreateTasks = [];

    if (validated.createUserAccount && !existingUser) {
      postCreateTasks.push(
        User.create({
          email: normalizedEmail,
          password: validated.password,
          name: `${validated.firstName} ${validated.lastName}`.trim(),
          role: validated.role,
          employeeId: employee._id,
          branchId: employee.branchId,
          isActive: true,
        }).then(async (u) => {
          createdUser = u;
          employee.userId = u._id;
          await employee.save();
        })
      );
    }

    if (leaveTypes.length > 0) {
      const currentYear = new Date().getFullYear();
      postCreateTasks.push(
        LeaveBalance.create({
          employeeId: employee._id,
          year: currentYear,
          balances: leaveTypes.map((lt) => ({
            leaveTypeId: lt._id,
            allocated: lt.defaultDaysPerYear,
            used: 0,
            pending: 0,
            remaining: lt.defaultDaysPerYear,
          })),
        })
      );
    }

    await Promise.all(postCreateTasks);

    const populatedEmployee = await Employee.findById(employee._id)
      .populate('departmentId', 'name code')
      .populate('designationId', 'title code')
      .populate('branchId', 'name code city')
      .populate('managerId', 'firstName lastName employeeId')
      .populate('shiftId', 'name startTime endTime')
      .populate('userId', 'role isActive lastLoginAt')
      .lean();

    logAudit({
      req,
      action: 'EMPLOYEE_CREATED',
      entity: 'Employee',
      entityId: employee._id,
      details: { employeeId: employee.employeeId, email: employee.email },
    });

    return sendSuccess(
      res,
      'Employee added successfully.',
      { employee: populatedEmployee, user: sanitizeUserForResponse(createdUser) },
      201
    );
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

    if (!(await ensureCanManageTargetEmployee(req, employee))) {
      return sendError(
        res,
        'Access denied: Only ADMIN or SUPER_ADMIN can modify an ADMIN or SUPER_ADMIN account.',
        [],
        403
      );
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
      'employmentStatus',
      'address',
      'bankDetails',
      'emergencyContact',
      'education',
      'previousEmployment',
    ];

    const nullableObjectIdFields = ['branchId', 'managerId', 'shiftId'];
    const requiredObjectIdFields = ['departmentId', 'designationId'];

    for (const field of updatableFields) {
      if (req.body[field] !== undefined) {
        if (nullableObjectIdFields.includes(field)) {
          employee[field] = req.body[field] === '' ? null : req.body[field];
        } else if (requiredObjectIdFields.includes(field)) {
          if (req.body[field] !== '' && req.body[field] !== null) {
            employee[field] = req.body[field];
          }
        } else {
          employee[field] = req.body[field];
        }
      }
    }

    await employee.save();

    if (employee.userId) {
      invalidateAuthCache(employee.userId);
    }

    const populatedEmployee = await Employee.findById(employee._id)
      .populate('departmentId', 'name code')
      .populate('designationId', 'title code')
      .populate('branchId', 'name code city')
      .populate('managerId', 'firstName lastName employeeId')
      .populate('shiftId', 'name startTime endTime')
      .populate('userId', 'role isActive lastLoginAt')
      .lean();

    logAudit({
      req,
      action: 'EMPLOYEE_UPDATED',
      entity: 'Employee',
      entityId: employee._id,
      details: { employeeId: employee.employeeId },
    });

    return sendSuccess(res, 'Employee updated successfully.', { employee: populatedEmployee });
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

    if (!(await ensureCanManageTargetEmployee(req, employee))) {
      return sendError(
        res,
        'Access denied: Non-admin roles cannot initiate exit or deactivation workflows for an ADMIN/SUPER_ADMIN.',
        [],
        403
      );
    }

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

    if (!(await ensureCanManageTargetEmployee(req, employee))) {
      return sendError(
        res,
        'Access denied: Non-admin roles cannot relieve an ADMIN/SUPER_ADMIN account.',
        [],
        403
      );
    }

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

    if (!(await ensureCanManageTargetEmployee(req, employee))) {
      return sendError(
        res,
        'Access denied: Only ADMIN or SUPER_ADMIN can deactivate an ADMIN or SUPER_ADMIN account.',
        [],
        403
      );
    }

    employee.isDeleted = true;
    employee.employmentStatus = LIFECYCLE_STAGES.TERMINATED;
    await employee.save();

    if (employee.userId) {
      await Promise.all([
        User.findByIdAndUpdate(employee.userId, { isActive: false }),
        UserSession.updateMany(
          { userId: employee.userId, isRevoked: false },
          {
            $set: {
              isRevoked: true,
              revokedAt: new Date(),
              revokedReason: 'Employee account deactivated',
            },
          }
        ),
      ]);
      invalidateAuthCache(employee.userId);
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
