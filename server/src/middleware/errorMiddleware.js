import { ZodError } from 'zod';

export const errorHandler = (err, req, res, next) => {
  console.error('Unhandled Application Error:', err);

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

  // 2. Mongoose Duplicate Key Error (Code 11000)
  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern || {})[0] || 'field';
    return res.status(409).json({
      success: false,
      message: `A record with this ${field} already exists in the system.`,
      errors: [`Duplicate value for field '${field}'`],
    });
  }

  // 3. Mongoose CastError (Invalid ObjectId)
  if (err.name === 'CastError') {
    return res.status(400).json({
      success: false,
      message: `Invalid ID format for parameter '${err.path}'.`,
      errors: [err.message],
    });
  }

  // 4. Mongoose Validation Error
  if (err.name === 'ValidationError') {
    const errors = Object.values(err.errors).map((val) => val.message);
    return res.status(400).json({
      success: false,
      message: 'Database schema validation error.',
      errors,
    });
  }

  // 5. Default Internal Server Error
  const statusCode = err.statusCode || 500;
  return res.status(statusCode).json({
    success: false,
    message: err.message || 'Internal Server Error',
    errors: process.env.NODE_ENV === 'development' ? [err.stack] : [],
  });
};

