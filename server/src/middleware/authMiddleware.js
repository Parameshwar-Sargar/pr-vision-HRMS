import { verifyAccessToken } from '../utils/tokenUtils.js';
import { sendError } from '../utils/responseUtils.js';
import User from '../models/User.js';

export const authenticate = async (req, res, next) => {
  try {
    let token = null;

    // Check Authorization header
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    } else if (req.cookies && req.cookies.accessToken) {
      token = req.cookies.accessToken;
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

    // Retrieve user from database to ensure account is active and role is fresh
    const user = await User.findById(decoded.userId).populate('tenantId', 'name slug status isDeleted');

    if (!user) {
      return sendError(res, 'User account not found.', [], 401);
    }

    if (!user.isActive) {
      return sendError(res, 'Account has been deactivated. Please contact your administrator.', [], 403);
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('Auth Middleware Error:', error);
    return sendError(res, 'Authentication failed.', [error.message], 500);
  }
};

