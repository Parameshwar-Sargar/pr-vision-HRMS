import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { env } from '../config/env.js';

export const generateSessionId = () => {
  return `sess_${crypto.randomBytes(20).toString('hex')}`;
};

export const hashToken = (token) => {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
};

export const parseDeviceLabel = (userAgent = '', tabId = '') => {
  let browser = 'Browser';
  if (/Edg\//i.test(userAgent)) browser = 'Edge';
  else if (/Chrome\//i.test(userAgent)) browser = 'Chrome';
  else if (/Firefox\//i.test(userAgent)) browser = 'Firefox';
  else if (/Safari\//i.test(userAgent)) browser = 'Safari';

  let os = 'Desktop';
  if (/Windows/i.test(userAgent)) os = 'Windows';
  else if (/Mac OS/i.test(userAgent)) os = 'macOS';
  else if (/Linux/i.test(userAgent)) os = 'Linux';
  else if (/Android/i.test(userAgent)) os = 'Android';
  else if (/iPhone|iPad/i.test(userAgent)) os = 'iOS';

  const shortTab = tabId ? ` • Tab ${String(tabId).slice(-6)}` : '';
  return `${browser} on ${os}${shortTab}`;
};

export const generateTokens = ({ userId, role, sessionId, tenantId = 'pr_vision_hrms' }) => {
  const accessPayload = {
    userId: userId.toString(),
    role,
    sessionId,
    tenantId,
    type: 'access',
  };

  const refreshPayload = {
    userId: userId.toString(),
    role,
    sessionId,
    tenantId,
    jti: crypto.randomUUID(),
    type: 'refresh',
  };

  const accessToken = jwt.sign(accessPayload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN,
  });

  const refreshToken = jwt.sign(refreshPayload, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN,
  });

  return { accessToken, refreshToken };
};

export const verifyAccessToken = (token) => {
  return jwt.verify(token, env.JWT_ACCESS_SECRET);
};

export const verifyRefreshToken = (token) => {
  return jwt.verify(token, env.JWT_REFRESH_SECRET);
};

export const getCookieOptions = ({ rememberMe = true } = {}) => {
  const isProd = env.NODE_ENV === 'production';
  const options = {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    path: '/',
  };

  if (rememberMe) {
    options.maxAge = 7 * 24 * 60 * 60 * 1000;
  }

  return options;
};
