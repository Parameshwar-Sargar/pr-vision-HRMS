import { z } from 'zod';
import User from '../../models/User.js';
import Employee from '../../models/Employee.js';
import CompanySettings from '../../models/CompanySettings.js';
import { generateTokens, verifyRefreshToken, getCookieOptions } from '../../utils/tokenUtils.js';
import { sendSuccess, sendError } from '../../utils/responseUtils.js';
import { logAudit } from '../../middleware/auditMiddleware.js';

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
  rememberMe: z.boolean().optional().default(true),
});

export const login = async (req, res, next) => {
  try {
    const validated = loginSchema.parse(req.body);

    const user = await User.findOne({ email: validated.email.toLowerCase() }).populate('branchId');
    if (!user) {
      return sendError(res, 'Invalid email or password credentials.', [], 401);
    }

    const isMatch = await user.comparePassword(validated.password);
    if (!isMatch) {
      return sendError(res, 'Invalid email or password credentials.', [], 401);
    }

    if (!user.isActive) {
      return sendError(res, 'Your user account is deactivated. Contact system administrator.', [], 403);
    }

    const tokens = generateTokens({
      userId: user._id,
      role: user.role,
    });

    user.refreshToken = tokens.refreshToken;
    user.lastLoginAt = new Date();
    await user.save();

    const cookieOptions = getCookieOptions({ rememberMe: validated.rememberMe });
    res.cookie('accessToken', tokens.accessToken, cookieOptions);
    res.cookie('refreshToken', tokens.refreshToken, cookieOptions);

    const company = await CompanySettings.findOne();

    return sendSuccess(res, 'Login successful.', {
      user,
      company: company || { companyName: 'PR VISION INNOVATIONS' },
      tokens,
      rememberMe: validated.rememberMe,
    });
  } catch (error) {
    next(error);
  }
};

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
      return sendError(res, 'Invalid or expired refresh token. Please sign in again.', [], 401);
    }

    const user = await User.findById(decoded.userId);
    if (!user || user.refreshToken !== token) {
      return sendError(res, 'Refresh token has been revoked or invalidated.', [], 401);
    }

    if (!user.isActive) {
      return sendError(res, 'Account deactivated.', [], 403);
    }

    const tokens = generateTokens({
      userId: user._id,
      role: user.role,
    });

    user.refreshToken = tokens.refreshToken;
    await user.save();

    res.cookie('accessToken', tokens.accessToken, getCookieOptions());
    res.cookie('refreshToken', tokens.refreshToken, getCookieOptions());

    return sendSuccess(res, 'Token refreshed successfully.', { tokens });
  } catch (error) {
    next(error);
  }
};

export const logout = async (req, res, next) => {
  try {
    const userId = req.user?._id;
    if (userId) {
      await User.findByIdAndUpdate(userId, { refreshToken: null });
    }

    const clearOpts = getCookieOptions();
    delete clearOpts.maxAge;
    res.clearCookie('accessToken', clearOpts);
    res.clearCookie('refreshToken', clearOpts);

    return sendSuccess(res, 'Signed out successfully.');
  } catch (error) {
    next(error);
  }
};

export const getCurrentUser = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id)
      .populate('branchId')
      .populate({
        path: 'employeeId',
        populate: [
          { path: 'departmentId', select: 'name code' },
          { path: 'designationId', select: 'title code' },
          { path: 'branchId', select: 'name code' },
          { path: 'shiftId' },
        ],
      });

    const company = await CompanySettings.findOne();

    return sendSuccess(res, 'User profile retrieved.', {
      user,
      employee: user.employeeId,
      company: company || { companyName: 'PR VISION INNOVATIONS' },
    });
  } catch (error) {
    next(error);
  }
};
