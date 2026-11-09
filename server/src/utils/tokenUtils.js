import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export const generateTokens = (payload) => {
  const accessToken = jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN,
  });

  const refreshToken = jwt.sign(payload, env.JWT_REFRESH_SECRET, {
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

  // If rememberMe is true, set a 7-day persistent cookie.
  // If false, omit maxAge so it functions as a browser session cookie.
  if (rememberMe) {
    options.maxAge = 7 * 24 * 60 * 60 * 1000;
  }

  return options;
};

