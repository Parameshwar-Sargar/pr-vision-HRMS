import { z } from 'zod';
import User from '../../models/User.js';
import Employee from '../../models/Employee.js';
import UserSession from '../../models/UserSession.js';
import CompanySettings from '../../models/CompanySettings.js';
import {
  generateTokens,
  verifyRefreshToken,
  getCookieOptions,
  generateSessionId,
  hashToken,
  parseDeviceLabel,
} from '../../utils/tokenUtils.js';
import { sendSuccess, sendError } from '../../utils/responseUtils.js';
import { logAudit } from '../../middleware/auditMiddleware.js';
import { invalidateAuthCache } from '../../middleware/authMiddleware.js';

const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

const loginSchema = z.object({
  email: z.string().trim().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
  rememberMe: z.boolean().optional().default(false),
  tabId: z.string().optional(),
});

let cachedCompanySettings = null;
let companyCacheExpiresAt = 0;

export const getCachedCompanySettings = async () => {
  const now = Date.now();
  if (cachedCompanySettings && companyCacheExpiresAt > now) {
    return cachedCompanySettings;
  }
  const company = await CompanySettings.findOne().lean();
  cachedCompanySettings = company || { companyName: 'PR VISION INNOVATIONS' };
  companyCacheExpiresAt = now + 60000;
  return cachedCompanySettings;
};

const clearLegacyAuthCookies = (res) => {
  const clearOpts = getCookieOptions();
  delete clearOpts.maxAge;
  res.clearCookie('accessToken', clearOpts);
  res.clearCookie('refreshToken', clearOpts);
};

export const login = async (req, res, next) => {
  try {
    const validated = loginSchema.parse(req.body);

    const normalizedEmail = validated.email.trim().toLowerCase();
    const [user, company] = await Promise.all([
      User.findOne({ email: normalizedEmail }).populate('branchId'),
      getCachedCompanySettings(),
    ]);
    if (!user) {
      return sendError(res, 'Invalid email or password credentials.', [], 401);
    }

    let isMatch = await user.comparePassword(validated.password);
    if (!isMatch && validated.password.trim() !== validated.password) {
      // Tolerate accidental copy-paste whitespace
      isMatch = await user.comparePassword(validated.password.trim());
    }
    if (!isMatch) {
      return sendError(res, 'Invalid email or password credentials.', [], 401);
    }

    if (!user.isActive) {
      return sendError(res, 'Your user account is deactivated. Contact system administrator.', [], 403);
    }

    const sessionId = generateSessionId();
    const tabId = validated.tabId || req.headers['x-tab-id'] || '';
    const tenantId = 'pr_vision_hrms';
    const now = new Date();
    const expiresAt = new Date(now.getTime() + SESSION_DURATION_MS);

    const tokens = generateTokens({
      userId: user._id,
      role: user.role,
      sessionId,
      tenantId,
    });

    const userAgent = req.headers['user-agent'] || 'Unknown Browser';
    const ipAddress =
      (req.headers['x-forwarded-for'] && String(req.headers['x-forwarded-for']).split(',')[0].trim()) ||
      req.ip ||
      '127.0.0.1';

    const [userSession, employee] = await Promise.all([
      UserSession.create({
        sessionId,
        tabId: String(tabId),
        userId: user._id,
        tenantId,
        role: user.role,
        refreshTokenHash: hashToken(tokens.refreshToken),
        deviceLabel: parseDeviceLabel(userAgent, tabId),
        ipAddress,
        userAgent,
        loginAt: now,
        lastActiveAt: now,
        expiresAt,
        isRevoked: false,
      }),
      user.employeeId
        ? Employee.findOne({ _id: user.employeeId, isDeleted: false }).lean()
        : Employee.findOne({ userId: user._id, isDeleted: false }).lean(),
    ]);

    user.lastLoginAt = now;
    User.updateOne({ _id: user._id }, { $set: { lastLoginAt: now } }).catch(() => {});

    // Clear any legacy shared cookies so browser tabs never share cookie credentials
    clearLegacyAuthCookies(res);

    return sendSuccess(res, 'Login successful.', {
      user,
      employee: employee || null,
      company,
      tokens,
      session: userSession.toSafeObject(sessionId),
    });
  } catch (error) {
    next(error);
  }
};

export const refreshTokenHandler = async (req, res, next) => {
  try {
    const token = req.body?.refreshToken;
    if (!token) {
      return sendError(res, 'Refresh token is required.', [], 401);
    }

    let decoded;
    try {
      decoded = verifyRefreshToken(token);
    } catch (err) {
      return sendError(res, 'Invalid or expired refresh token. Please sign in again.', [], 401);
    }

    const { userId, sessionId } = decoded;
    if (!sessionId) {
      return sendError(res, 'Session identifier missing from refresh token. Please sign in again.', [], 401);
    }

    const [user, session] = await Promise.all([
      User.findById(userId).select('-password -refreshToken').lean(),
      UserSession.findOne({ sessionId, userId }),
    ]);

    if (!user) {
      return sendError(res, 'User account not found.', [], 401);
    }

    if (!user.isActive) {
      return sendError(res, 'Account deactivated.', [], 403);
    }

    if (!session) {
      return sendError(res, 'Session not found. Please sign in again.', [], 401);
    }

    if (session.isRevoked) {
      return sendError(res, 'Refresh token has been revoked. Please sign in again.', [], 401);
    }

    if (new Date(session.expiresAt).getTime() <= Date.now()) {
      return sendError(res, 'Session has expired. Please sign in again.', [], 401);
    }

    // Detect refresh token reuse / tampering
    const incomingHash = hashToken(token);
    if (session.refreshTokenHash !== incomingHash) {
      session.isRevoked = true;
      session.revokedAt = new Date();
      session.revokedReason = 'Refresh token reuse detected';
      await session.save();
      invalidateAuthCache(userId, sessionId);
      return sendError(res, 'Security alert: Refresh token reuse detected. Session has been revoked.', [], 401);
    }

    // Rotate both access and refresh tokens while preserving the tab's sessionId
    const tokens = generateTokens({
      userId: user._id,
      role: user.role,
      sessionId: session.sessionId,
      tenantId: session.tenantId || 'pr_vision_hrms',
    });

    session.refreshTokenHash = hashToken(tokens.refreshToken);
    session.lastActiveAt = new Date();
    session.role = user.role;
    await session.save();

    invalidateAuthCache(userId, sessionId);
    clearLegacyAuthCookies(res);

    return sendSuccess(res, 'Token refreshed successfully.', {
      tokens,
      session: session.toSafeObject(session.sessionId),
    });
  } catch (error) {
    next(error);
  }
};

export const logout = async (req, res, next) => {
  try {
    const userId = req.user?._id;
    const sessionId = req.sessionId;

    if (userId && sessionId) {
      invalidateAuthCache(userId, sessionId);
      await UserSession.findOneAndUpdate(
        { sessionId, userId },
        {
          $set: {
            isRevoked: true,
            revokedAt: new Date(),
            revokedReason: 'User logout (single tab)',
          },
        }
      );
    } else if (userId) {
      invalidateAuthCache(userId);
    }

    clearLegacyAuthCookies(res);

    return sendSuccess(res, 'Signed out of current tab session successfully.', {
      revokedSessionId: sessionId || null,
    });
  } catch (error) {
    next(error);
  }
};

export const logoutAll = async (req, res, next) => {
  try {
    const userId = req.user?._id;
    let revokedCount = 0;

    if (userId) {
      invalidateAuthCache(userId);
      const result = await UserSession.updateMany(
        { userId, isRevoked: false },
        {
          $set: {
            isRevoked: true,
            revokedAt: new Date(),
            revokedReason: 'Logout from all sessions',
          },
        }
      );
      revokedCount = result.modifiedCount || 0;
    }

    clearLegacyAuthCookies(res);

    return sendSuccess(res, 'Signed out from all active sessions successfully.', {
      revokedCount,
    });
  } catch (error) {
    next(error);
  }
};

export const getActiveSessions = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const currentSessionId = req.sessionId;

    const sessions = await UserSession.find({
      userId,
      isRevoked: false,
      expiresAt: { $gt: new Date() },
    }).sort({ lastActiveAt: -1 });

    const safeSessions = sessions.map((s) => s.toSafeObject(currentSessionId));
    const currentSession = safeSessions.find((s) => s.isCurrentSession) || null;

    return sendSuccess(res, 'Active sessions retrieved.', {
      currentSessionId,
      currentSession,
      sessions: safeSessions,
    });
  } catch (error) {
    next(error);
  }
};

export const revokeSession = async (req, res, next) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user._id;

    const session = await UserSession.findOne({ sessionId, userId });
    if (!session) {
      return sendError(res, 'Session not found.', [], 404);
    }

    if (!session.isRevoked) {
      session.isRevoked = true;
      session.revokedAt = new Date();
      session.revokedReason =
        sessionId === req.sessionId ? 'Revoked current session' : 'Revoked from Session Management UI';
      await session.save();
    }

    invalidateAuthCache(userId, sessionId);

    return sendSuccess(res, 'Session revoked successfully.', {
      revokedSessionId: sessionId,
      isCurrentSession: sessionId === req.sessionId,
    });
  } catch (error) {
    next(error);
  }
};

export const getCurrentUser = async (req, res, next) => {
  try {
    const company = await getCachedCompanySettings();

    let sessionMeta = null;
    if (req.currentSession) {
      sessionMeta = {
        sessionId: req.currentSession.sessionId,
        tabId: req.currentSession.tabId,
        userId: req.currentSession.userId,
        tenantId: req.currentSession.tenantId,
        role: req.user.role,
        deviceLabel: req.currentSession.deviceLabel,
        ipAddress: req.currentSession.ipAddress,
        userAgent: req.currentSession.userAgent,
        loginAt: req.currentSession.loginAt,
        lastActiveAt: req.currentSession.lastActiveAt,
        expiresAt: req.currentSession.expiresAt,
        isRevoked: req.currentSession.isRevoked,
        isCurrentSession: true,
      };
    }

    return sendSuccess(res, 'User profile retrieved.', {
      user: req.user,
      employee: req.employee || null,
      company,
      session: sessionMeta,
    });
  } catch (error) {
    next(error);
  }
};
