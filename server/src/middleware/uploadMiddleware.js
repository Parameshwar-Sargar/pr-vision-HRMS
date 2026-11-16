import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import {
  UPLOAD_ROOT,
  ALLOWED_UPLOAD_EXTENSIONS,
  ALLOWED_UPLOAD_MIMES,
} from '../utils/securityUtils.js';

if (!fs.existsSync(UPLOAD_ROOT)) {
  fs.mkdirSync(UPLOAD_ROOT, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_ROOT);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const safeExt = ALLOWED_UPLOAD_EXTENSIONS.has(ext) ? ext : '';
    const sanitizedName = path
      .basename(file.originalname || 'file', ext)
      .replace(/[^a-zA-Z0-9]/g, '_')
      .slice(0, 48);
    const uniqueSuffix = `${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
    cb(null, `${sanitizedName || 'upload'}_${uniqueSuffix}${safeExt}`);
  },
});

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname || '').toLowerCase();
  const mime = String(file.mimetype || '').toLowerCase();

  if (ALLOWED_UPLOAD_MIMES.has(mime) && ALLOWED_UPLOAD_EXTENSIONS.has(ext)) {
    cb(null, true);
  } else {
    const err = new Error(
      `Unsupported file type (${file.mimetype || 'unknown'} / ${ext || 'no ext'}). Allowed: PDF, DOC, DOCX, PNG, JPG, WEBP, CSV.`
    );
    err.statusCode = 400;
    err.isUploadValidationError = true;
    cb(err, false);
  }
};

export const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024, files: 1 }, // 10 MB limit, single file per upload
  fileFilter,
});

