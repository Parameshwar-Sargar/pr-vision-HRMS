import { z } from 'zod';
import User from '../../models/User.js';
import Tenant from '../../models/Tenant.js';
import Plan from '../../models/Plan.js';
import Department from '../../models/Department.js';
import Designation from '../../models/Designation.js';
import LeaveType from '../../models/LeaveType.js';
import Shift from '../../models/Shift.js';
import { ROLES, TENANT_STATUS } from '../../config/constants.js';
import { generateTokens, verifyRefreshToken, getCookieOptions } from '../../utils/tokenUtils.js';
import { sendSuccess, sendError } from '../../utils/responseUtils.js';
import { logAudit } from '../../middleware/auditMiddleware.js';

// Registration Validation Schema
const registerSchema = z.object({
  companyName: z.string().min(2, 'Company name must be at least 2 characters'),
  adminName: z.string().min(2, 'Admin name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  phone: z.string().optional().default(''),
});

// Login Validation Schema
const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

/**
 * Register a new Company (Tenant Onboarding)
 */
export const registerCompany = async (req, res, next) => {
  try {
    const validated = registerSchema.parse(req.body);

    // Check if user email already exists globally for company admin
    const existingUser = await User.findOne({ email: validated.email });
    if (existingUser) {
      return sendError(res, 'An account with this email address already exists.', [], 409);
    }

    // Generate unique slug
    let baseSlug = validated.companyName
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    if (!baseSlug) baseSlug = 'company';

    let slug = baseSlug;
    let counter = 1;
    while (await Tenant.findOne({ slug })) {
      slug = `${baseSlug}-${counter}`;
      counter++;
    }

    // Find default trial or starter plan
    let plan = await Plan.findOne({ code: 'growth' });
    if (!plan) {
      plan = await Plan.findOne();
    }

    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + 30); // 30-day free trial

    // 1. Create Tenant
    const tenant = await Tenant.create({
      name: validated.companyName,
      slug,
      contactEmail: validated.email,
      contactPhone: validated.phone,
      planId: plan ? plan._id : null,
      planName: plan ? plan.name : 'Growth',
      status: TENANT_STATUS.ACTIVE,
      trialEndsAt,
      settings: {
        timezone: 'Asia/Kolkata',
        currency: 'INR',
        dateFormat: 'DD/MM/YYYY',
        workingDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
        standardWorkHoursPerDay: 8,
      },
    });

    // 2. Create Default Departments & Designations
    const hrDept = await Department.create({
      tenantId: tenant._id,
      name: 'Human Resources',
      code: 'HR',
      description: 'People Operations & Talent Acquisition',
    });

    const engDept = await Department.create({
      tenantId: tenant._id,
      name: 'Engineering',
      code: 'ENG',
      description: 'Product Development & Software Engineering',
    });

    await Designation.create([
      { tenantId: tenant._id, title: 'HR Director', departmentId: hrDept._id, code: 'HR-DIR', level: 1 },
      { tenantId: tenant._id, title: 'Senior Software Engineer', departmentId: engDept._id, code: 'ENG-SR', level: 2 },
    ]);

    // 3. Create Default Shift
    await Shift.create({
      tenantId: tenant._id,
      name: 'Standard General Shift',
      startTime: '09:00',
      endTime: '18:00',
      breakDurationMinutes: 60,
      gracePeriodMinutes: 15,
      weeklyOffDays: [0, 6], // Sun, Sat
      isDefault: true,
    });

    // 4. Create Standard Leave Types
    await LeaveType.create([
      { tenantId: tenant._id, name: 'Paid / Annual Leave', code: 'AL', defaultDaysPerYear: 18, isPaid: true },
      { tenantId: tenant._id, name: 'Sick Leave', code: 'SL', defaultDaysPerYear: 10, isPaid: true },
      { tenantId: tenant._id, name: 'Casual Leave', code: 'CL', defaultDaysPerYear: 8, isPaid: true },
      { tenantId: tenant._id, name: 'Unpaid Leave / LOP', code: 'LOP', defaultDaysPerYear: 0, isPaid: false },
    ]);

    // 5. Create Company Admin User
    const adminUser = await User.create({
      tenantId: tenant._id,
      name: validated.adminName,
      email: validated.email,
      password: validated.password,
      role: ROLES.COMPANY_ADMIN,
      isActive: true,
    });

    // 6. Generate Tokens
    const { accessToken, refreshToken } = generateTokens({
      userId: adminUser._id,
      tenantId: tenant._id,
      role: adminUser.role,
    });

    adminUser.refreshToken = refreshToken;
    adminUser.lastLoginAt = new Date();
    await adminUser.save();

    // Log Audit
    await logAudit({
      req: { user: adminUser, tenantId: tenant._id, ip: req.ip, headers: req.headers },
      action: 'TENANT_ONBOARDED',
      entity: 'Tenant',
      entityId: tenant._id,
      details: { companyName: tenant.name, slug: tenant.slug },
    });

    res.cookie('accessToken', accessToken, getCookieOptions());
    res.cookie('refreshToken', refreshToken, getCookieOptions());

    return sendSuccess(
      res,
      'Company registered successfully. Welcome to PR VISION HRMS!',
      {
        user: adminUser,
        tenant,
        tokens: { accessToken, refreshToken },
      },
      201
    );
  } catch (error) {
    next(error);
  }
};

/**
 * Universal Login (Super Admin, Company Admin, HR, Manager, Employee)
 */
export const login = async (req, res, next) => {
  try {
    const validated = loginSchema.parse(req.body);

    const user = await User.findOne({ email: validated.email.toLowerCase() }).populate('tenantId');
    if (!user) {
      return sendError(res, 'Invalid email or password credentials.', [], 401);
    }

    const isMatch = await user.comparePassword(validated.password);
    if (!isMatch) {
      return sendError(res, 'Invalid email or password credentials.', [], 401);
    }

    if (!user.isActive) {
      return sendError(res, 'Your account is deactivated. Contact system administrator.', [], 403);
    }

    // Check tenant status if not Super Admin
    if (user.role !== ROLES.SUPER_ADMIN && user.tenantId) {
      if (user.tenantId.isDeleted) {
        return sendError(res, 'Your company workspace has been deleted.', [], 403);
      }
      if (user.tenantId.status === TENANT_STATUS.SUSPENDED) {
        return sendError(res, 'Your company workspace has been suspended. Please contact support.', [], 403);
      }
    }

    // Generate tokens
    const { accessToken, refreshToken } = generateTokens({
      userId: user._id,
      tenantId: user.tenantId?._id || null,
      role: user.role,
    });

    user.refreshToken = refreshToken;
    user.lastLoginAt = new Date();
    await user.save();

    res.cookie('accessToken', accessToken, getCookieOptions());
    res.cookie('refreshToken', refreshToken, getCookieOptions());

    return sendSuccess(res, 'Login successful.', {
      user,
      tenant: user.tenantId,
      tokens: { accessToken, refreshToken },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Refresh Access Token with Token Rotation
 */
export const refreshTokenHandler = async (req, res, next) => {
  try {
    const token = req.cookies?.refreshToken || req.body?.refreshToken;
    if (!token) {
      return sendError(res, 'Refresh token is required.', [], 401);
    }

    let decoded;
    try {
      decoded = verifyRefreshToken(token);
    } catch (err) {
      return sendError(res, 'Invalid or expired refresh token. Please log in again.', [], 401);
    }

    const user = await User.findById(decoded.userId).populate('tenantId');
    if (!user || user.refreshToken !== token) {
      return sendError(res, 'Refresh token has been revoked or invalidated.', [], 401);
    }

    if (!user.isActive) {
      return sendError(res, 'Account deactivated.', [], 403);
    }

    // Generate fresh rotated tokens
    const tokens = generateTokens({
      userId: user._id,
      tenantId: user.tenantId?._id || null,
      role: user.role,
    });

    user.refreshToken = tokens.refreshToken;
    await user.save();

    res.cookie('accessToken', tokens.accessToken, getCookieOptions());
    res.cookie('refreshToken', tokens.refreshToken, getCookieOptions());

    return sendSuccess(res, 'Token refreshed successfully.', {
      tokens,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Logout
 */
export const logout = async (req, res, next) => {
  try {
    const userId = req.user?._id;
    if (userId) {
      await User.findByIdAndUpdate(userId, { refreshToken: null });
    }

    res.clearCookie('accessToken', { path: '/' });
    res.clearCookie('refreshToken', { path: '/' });

    return sendSuccess(res, 'Logged out successfully.');
  } catch (error) {
    next(error);
  }
};

/**
 * Current Authenticated Profile (`/me`)
 */
export const getCurrentUser = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id)
      .populate('tenantId')
      .populate({
        path: 'employeeId',
        populate: [
          { path: 'departmentId', select: 'name code' },
          { path: 'designationId', select: 'title code' },
          { path: 'shiftId' },
        ],
      });

    return sendSuccess(res, 'User profile retrieved.', {
      user,
      tenant: user.tenantId,
      employee: user.employeeId,
    });
  } catch (error) {
    next(error);
  }
};

