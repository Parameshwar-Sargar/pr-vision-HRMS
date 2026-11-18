import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import { ROLES } from '../config/constants.js';

export const UPLOAD_ROOT = path.resolve('uploads');

export const ALLOWED_UPLOAD_EXTENSIONS = new Set([
  '.pdf',
  '.doc',
  '.docx',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.csv',
]);

export const ALLOWED_UPLOAD_MIMES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'text/csv',
  'application/csv',
]);

const SENSITIVE_AUDIT_KEYS = new Set([
  'password',
  'newpassword',
  'confirmpassword',
  'refreshtoken',
  'accesstoken',
  'refreshtokenhash',
  'token',
  'secret',
  'jwt_access_secret',
  'jwt_refresh_secret',
  'cookie_secret',
  'bankdetails',
  'accountnumber',
  'ifsccode',
  'pannumber',
]);

export const normalizeRole = (role) => String(role || '').toUpperCase().trim();

export const isAdminRole = (role) => {
  const normalized = normalizeRole(role);
  return normalized === ROLES.ADMIN || normalized === ROLES.SUPER_ADMIN;
};

export const isAdminOrHR = (role) => {
  const normalized = normalizeRole(role);
  return isAdminRole(normalized) || normalized === ROLES.HR_MANAGER;
};

export const isPayrollPrivileged = (role) => {
  const normalized = normalizeRole(role);
  return isAdminOrHR(normalized) || normalized === ROLES.PAYROLL_ADMIN;
};

export const isValidObjectId = (id) => {
  if (!id) return false;
  return mongoose.Types.ObjectId.isValid(String(id));
};

export const escapeRegex = (value = '') =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Strips authentication secrets cleanly from User objects returned in API payloads.
 */
export const sanitizeUserForResponse = (userDoc) => {
  if (!userDoc) return null;
  const plain = typeof userDoc.toObject === 'function' ? userDoc.toObject() : { ...userDoc };
  delete plain.password;
  delete plain.refreshToken;
  delete plain.__v;
  return plain;
};

/**
 * Removes sensitive internal network/hardware configuration from CompanySettings
 * for non-Admin/HR roles.
 */
export const sanitizeCompanyForRole = (companyDoc, role) => {
  if (!companyDoc) return companyDoc;
  const plain = typeof companyDoc.toObject === 'function' ? companyDoc.toObject() : { ...companyDoc };
  if (!isAdminOrHR(role)) {
    delete plain.biometricConfig;
  }
  return plain;
};

/**
 * Redacts credentials, tokens, and private financial details before storing AuditLog payloads.
 */
export const sanitizeAuditDetails = (value, depth = 0) => {
  if (depth > 4 || value === null || value === undefined) return value;
  if (Array.isArray(value)) {
    return value.slice(0, 25).map((item) => sanitizeAuditDetails(item, depth + 1));
  }
  if (typeof value === 'object' && !(value instanceof Date)) {
    const clean = {};
    for (const [k, v] of Object.entries(value)) {
      if (SENSITIVE_AUDIT_KEYS.has(String(k).toLowerCase())) {
        clean[k] = '[REDACTED]';
      } else {
        clean[k] = sanitizeAuditDetails(v, depth + 1);
      }
    }
    return clean;
  }
  return value;
};

/**
 * Escapes CSV values and prevents CSV formula injection (=, +, -, @, tab, CR).
 */
export const sanitizeCsvCell = (value) => {
  let str = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  return `"${str.replace(/"/g, '""')}"`;
};

/**
 * Safely deletes an uploaded file constrained within UPLOAD_ROOT.
 */
export const safeDeleteFile = (filePath) => {
  if (!filePath) return;
  try {
    const resolved = path.resolve(filePath);
    if (
      (resolved === UPLOAD_ROOT || resolved.startsWith(UPLOAD_ROOT + path.sep)) &&
      fs.existsSync(resolved)
    ) {
      fs.unlinkSync(resolved);
    }
  } catch {
    // Ignore cleanup errors
  }
};

/**
 * Resolves a stored fileName safely within UPLOAD_ROOT, blocking path traversal & sibling escapes.
 */
export const resolveSafeUploadPath = (fileName) => {
  if (!fileName || typeof fileName !== 'string') return null;
  if (fileName.includes('\0') || fileName.includes('..') || fileName.includes('/') || fileName.includes('\\')) {
    return null;
  }
  const base = path.basename(fileName);
  if (!base || base !== fileName || base === '.' || base === '..') {
    return null;
  }
  const resolved = path.resolve(UPLOAD_ROOT, base);
  if (!resolved.startsWith(UPLOAD_ROOT + path.sep)) {
    return null;
  }
  return resolved;
};

/**
 * Sanitizes Content-Disposition download filenames.
 */
export const sanitizeDownloadFilename = (name, fallback = 'document') => {
  const cleaned = String(name || fallback)
    .replace(/[\r\n"\\/:*?<>|]/g, '_')
    .trim();
  return cleaned || fallback;
};

const readFileHeaderBytes = (filePath, length = 512) => {
  const fd = fs.openSync(filePath, 'r');
  try {
    const buffer = Buffer.alloc(length);
    const bytesRead = fs.readSync(fd, buffer, 0, length, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    fs.closeSync(fd);
  }
};

/**
 * Verifies uploaded file magic bytes against declared MIME & extension to prevent spoofed uploads.
 */
export const validateUploadedFileMagicBytes = (filePath, mimeType, originalName = '') => {
  const ext = path.extname(String(originalName || '')).toLowerCase();
  const normalizedMime = String(mimeType || '').toLowerCase();

  if (!ALLOWED_UPLOAD_EXTENSIONS.has(ext) || !ALLOWED_UPLOAD_MIMES.has(normalizedMime)) {
    return { valid: false, reason: 'Unsupported file extension or MIME type.' };
  }

  let header;
  try {
    header = readFileHeaderBytes(filePath, 512);
  } catch {
    return { valid: false, reason: 'Unable to read uploaded file for security verification.' };
  }

  if (!header || header.length === 0) {
    return { valid: false, reason: 'Empty files are not allowed.' };
  }

  if (ext === '.pdf' || normalizedMime === 'application/pdf') {
    const ascii = header.subarray(0, 8).toString('ascii');
    if (!ascii.startsWith('%PDF-')) {
      return { valid: false, reason: 'Uploaded file does not match valid PDF file signature.' };
    }
    return { valid: true };
  }

  if (ext === '.png' || normalizedMime === 'image/png') {
    const pngSig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    if (header.length < 8 || !header.subarray(0, 8).equals(pngSig)) {
      return { valid: false, reason: 'Uploaded file does not match valid PNG signature.' };
    }
    return { valid: true };
  }

  if (ext === '.jpg' || ext === '.jpeg' || normalizedMime === 'image/jpeg' || normalizedMime === 'image/jpg') {
    if (header.length < 3 || header[0] !== 0xff || header[1] !== 0xd8 || header[2] !== 0xff) {
      return { valid: false, reason: 'Uploaded file does not match valid JPEG signature.' };
    }
    return { valid: true };
  }

  if (ext === '.webp' || normalizedMime === 'image/webp') {
    const riff = header.subarray(0, 4).toString('ascii');
    const webp = header.subarray(8, 12).toString('ascii');
    if (header.length < 12 || riff !== 'RIFF' || webp !== 'WEBP') {
      return { valid: false, reason: 'Uploaded file does not match valid WEBP signature.' };
    }
    return { valid: true };
  }

  if (ext === '.doc' || normalizedMime === 'application/msword') {
    const docSig = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    if (header.length < 8 || !header.subarray(0, 8).equals(docSig)) {
      return { valid: false, reason: 'Uploaded file does not match valid DOC signature.' };
    }
    return { valid: true };
  }

  if (
    ext === '.docx' ||
    normalizedMime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    const zipSig1 = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
    const zipSig2 = Buffer.from([0x50, 0x4b, 0x05, 0x06]);
    if (
      header.length < 4 ||
      (!header.subarray(0, 4).equals(zipSig1) && !header.subarray(0, 4).equals(zipSig2))
    ) {
      return { valid: false, reason: 'Uploaded file does not match valid DOCX archive signature.' };
    }
    return { valid: true };
  }

  if (ext === '.csv' || normalizedMime === 'text/csv' || normalizedMime === 'application/csv') {
    // Reject binary NUL bytes or active HTML/SVG/script content disguised as CSV
    if (header.includes(0x00)) {
      return { valid: false, reason: 'Binary content is not permitted inside CSV files.' };
    }
    const textPreview = header.toString('utf8').trimStart().toLowerCase();
    if (/^(<!doctype|<html|<script|<svg|<\?xml|<\?php)/i.test(textPreview) || /<script\b/i.test(textPreview)) {
      return { valid: false, reason: 'Executable HTML/script markup is not permitted in CSV uploads.' };
    }
    return { valid: true };
  }

  return { valid: false, reason: 'Unsupported file format.' };
};

const FORBIDDEN_OBJECT_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export const stripUnsafeKeys = (value) => {
  if (Array.isArray(value)) {
    for (const item of value) stripUnsafeKeys(item);
    return value;
  }
  if (!value || typeof value !== 'object' || value instanceof Date || Buffer.isBuffer(value)) {
    return value;
  }
  for (const key of Object.keys(value)) {
    if (key.startsWith('$') || FORBIDDEN_OBJECT_KEYS.has(key)) {
      delete value[key];
    } else {
      stripUnsafeKeys(value[key]);
    }
  }
  return value;
};

export const sanitizeRequestInputs = (req, _res, next) => {
  if (req.body && typeof req.body === 'object') stripUnsafeKeys(req.body);
  if (req.query && typeof req.query === 'object') stripUnsafeKeys(req.query);
  if (req.params && typeof req.params === 'object') stripUnsafeKeys(req.params);
  next();
};


