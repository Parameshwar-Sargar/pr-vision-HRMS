import { verifyAccessToken } from '../utils/tokenUtils.js';
import { sendError } from '../utils/responseUtils.js';
import { isValidObjectId, sanitizeUserForResponse } from '../utils/securityUtils.js';
import User from '../models/User.js';
import Employee from '../models/Employee.js';
import UserSession from '../models/UserSession.js';

// Per-session short-TTL identity cache to avoid redundant Atlas roundtrips on parallel page loads
const AUTH_CACHE_TTL_MS = 15000; // 15 seconds
const authIdentityCache = new Map();

export const invalidateAuthCache = (userId = null, sessionId = null) => {
  if (userId && sessionId) {
    const exactPrefix = `${userId.toString()}:${sessionId}`;
    for (const key of authIdentityCache.keys()) {
      if (key === exactPrefix || key.startsWith(`${exactPrefix}:`)) {
        authIdentityCache.delete(key);
      }
    }
    return;
  }
  if (userId) {
    const prefix = `${userId.toString()}:`;
    for (const key of authIdentityCache.keys()) {
      if (key === userId.toString() || key.startsWith(prefix)) {
        authIdentityCache.delete(key);
      }
    }
    return;
  }
  authIdentityCache.clear();
};

export const authenticate = async (req, res, next) => {
  try {
    let token = null;

    // Strictly read per-tab Bearer token from Authorization header (never shared browser cookies)
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.slice(7).trim();
    }

    if (!token) {
      return sendError(res, 'Authentication required. Please log in.', [], 401);
    }

    let decoded;
    try {
      decoded = verifyAccessToken(token);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return sendError(res, 'Token has expired. Please refresh your session.', [], 401);
      }
      return sendError(res, 'Invalid authentication token.', [], 401);
    }

    if (!decoded || decoded.type !== 'access' || !isValidObjectId(decoded.userId)) {
      return sendError(res, 'Invalid authentication token payload.', [], 401);
    }

    const sessionId = decoded.sessionId ? String(decoded.sessionId).trim() : null;
    if (!sessionId) {
      return sendError(res, 'Session identifier missing from token. Please sign in again.', [], 401);
    }

    // Bind explicit X-Session-Id header when supplied by tab client
    const headerSessionId = req.headers['x-session-id'];
    if (headerSessionId && String(headerSessionId).trim() !== sessionId) {
      return sendError(res, 'Session mismatch for active browser tab. Please sign in again.', [], 401);
    }

    const tenantId = String(decoded.tenantId || 'pr_vision_hrms').trim();

    // Prevent unverified client-supplied cross-tenant header override
    const targetTenantHeader = req.headers['x-target-tenant'];
    if (targetTenantHeader && String(targetTenantHeader).trim() !== tenantId) {
      return sendError(res, 'Access denied: Cross-tenant header override is forbidden.', [], 403);
    }

    const cacheKey = `${decoded.userId.toString()}:${sessionId}:${tenantId}`;
    const now = Date.now();

    // Invalidate cache on any state-mutating request to guarantee fresh authorization state
    if (req.method !== 'GET') {
      invalidateAuthCache(decoded.userId, sessionId);
    }

    let cached = cacheKey && req.method === 'GET' ? authIdentityCache.get(cacheKey) : null;
    let user = null;
    let employee = null;
    let sessionDoc = null;

    if (cached && cached.expiresAt > now) {
      user = cached.user;
      employee = cached.employee;
      sessionDoc = cached.sessionDoc;
    } else {
      const [userDoc, fetchedSession] = await Promise.all([
        User.findById(decoded.userId)
          .select('-password -refreshToken')
          .populate('branchId', 'name code')
          .populate('employeeId')
          .lean(),
        UserSession.findOne({ sessionId, userId: decoded.userId }).lean(),
      ]);

      if (!userDoc) {
        return sendError(res, 'User account not found.', [], 401);
      }

      if (!userDoc.isActive) {
        return sendError(res, 'Account has been deactivated. Please contact your HR administrator.', [], 403);
      }

      // Enforce per-tab UserSession ownership, tenant isolation, revocation, and expiry
      if (!fetchedSession) {
        return sendError(res, 'Session not found or invalidated. Please sign in again.', [], 401);
      }
      if (fetchedSession.isRevoked) {
        return sendError(res, 'Session has been revoked. Please sign in again.', [], 401);
      }
      if (new Date(fetchedSession.expiresAt).getTime() <= now) {
        return sendError(res, 'Session has expired. Please sign in again.', [], 401);
      }
      if (fetchedSession.tenantId && fetchedSession.tenantId !== tenantId) {
        return sendError(res, 'Cross-tenant session mismatch.', [], 403);
      }

      sessionDoc = fetchedSession;

      // Throttled async update of lastActiveAt (every 30s)
      const lastActiveMs = fetchedSession.lastActiveAt ? new Date(fetchedSession.lastActiveAt).getTime() : 0;
      if (now - lastActiveMs > 30000) {
        const nowDate = new Date(now);
        sessionDoc.lastActiveAt = nowDate;
        UserSession.updateOne({ _id: fetchedSession._id }, { $set: { lastActiveAt: nowDate } }).catch(() => {});
      }

      // Resolve verified server-side employee record from populated field or fallback
      if (userDoc.employeeId && typeof userDoc.employeeId === 'object' && !userDoc.employeeId.isDeleted) {
        employee = userDoc.employeeId;
        user = sanitizeUserForResponse({ ...userDoc, employeeId: employee._id });
      } else {
        user = sanitizeUserForResponse(userDoc);
        if (userDoc.employeeId && typeof userDoc.employeeId !== 'object') {
          employee = await Employee.findOne({ _id: userDoc.employeeId, isDeleted: false }).lean();
        }
        if (!employee) {
          employee = await Employee.findOne({ userId: userDoc._id, isDeleted: false }).lean();
          if (employee) {
            user.employeeId = employee._id;
            User.updateOne({ _id: userDoc._id }, { $set: { employeeId: employee._id } }).catch(() => {});
          }
        }
      }

      if (cacheKey && req.method === 'GET') {
        authIdentityCache.set(cacheKey, {
          user,
          employee,
          sessionDoc,
          expiresAt: now + AUTH_CACHE_TTL_MS,
        });
      }
    }

    req.user = user;
    req.employee = employee;
    req.employeeId = employee ? employee._id : null;
    req.verifiedEmployeeId = employee ? employee._id : null;
    req.sessionId = sessionId;
    req.tenantId = tenantId;
    req.currentSession = sessionDoc;

    next();
  } catch (error) {
    console.error('Auth Middleware Error:', error.message);
    return sendError(res, 'Authentication failed.', [], 500);
  }
};

export const requireEmployee = (req, res, next) => {
  if (!req.verifiedEmployeeId) {
    return sendError(
      res,
      'Access denied: No active employee profile is linked to this authenticated user account.',
      [],
      403
    );
  }
  next();
};

export const getReportingEmployeeIds = async (managerEmployeeId) => {
  if (!managerEmployeeId) return [];
  const team = await Employee.find({ managerId: managerEmployeeId, isDeleted: false })
    .select('_id')
    .lean();
  return team.map((t) => t._id);
};
