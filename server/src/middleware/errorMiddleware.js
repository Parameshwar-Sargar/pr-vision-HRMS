import { ZodError } from 'zod';
import { env } from '../config/env.js';

export const errorHandler = (err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  const isProd = env.NODE_ENV === 'production';

  if (env.NODE_ENV !== 'test') {
    console.error(`[ERROR] ${req.method} ${req.originalUrl} -> ${err.name || 'Error'}: ${err.message}`);
  }

  // 1. Zod Schema Validation Error
  if (err instanceof ZodError) {
    const formattedErrors = err.errors.map((e) => ({
      field: e.path.join('.'),
      message: e.message,
    }));
    return res.status(400).json({
      success: false,
      message: 'Validation failed. Please verify input data.',
      errors: formattedErrors,
    });
  }

  // 2. Malformed JSON request payload
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({
      success: false,
      message: 'Invalid JSON request payload.',
      errors: ['Malformed JSON syntax'],
    });
  }

  // 3. Multer File Upload Errors
  if (err.name === 'MulterError' || err.isUploadValidationError) {
    const uploadMsg =
      err.code === 'LIMIT_FILE_SIZE'
        ? 'Uploaded file exceeds the 10 MB size limit.'
        : err.message || 'Invalid file upload.';
    return res.status(400).json({
      success: false,
      message: uploadMsg,
      errors: [uploadMsg],
    });
  }

  // 4. Mongoose Duplicate Key Error (Code 11000)
  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern || {})[0] || 'field';
    return res.status(409).json({
      success: false,
      message: `A record with this ${field} already exists in the system.`,
      errors: [`Duplicate value for field '${field}'`],
    });
  }

  // 5. Mongoose CastError (Invalid ObjectId)
  if (err.name === 'CastError') {
    return res.status(400).json({
      success: false,
      message: `Invalid ID format for parameter '${err.path}'.`,
      errors: ['Invalid identifier format'],
    });
  }

  // 6. Mongoose Validation Error
  if (err.name === 'ValidationError') {
    const errors = Object.values(err.errors).map((val) => val.message);
    return res.status(400).json({
      success: false,
      message: 'Database schema validation error.',
      errors,
    });
  }

  // 7. Default Internal Server Error (never leak internal stack/secrets in production)
  return res.status(statusCode).json({
    success: false,
    message: statusCode >= 500 && isProd ? 'Internal Server Error' : err.message || 'Internal Server Error',
    errors: env.NODE_ENV === 'development' && statusCode >= 500 ? [err.message] : [],
  });
};

