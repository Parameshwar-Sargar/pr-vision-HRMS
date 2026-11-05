/**
 * Standard API Response Utilities
 * Enforces unified JSON payload contracts across all endpoints.
 */

export const sendSuccess = (res, message = 'Operation successful', data = {}, statusCode = 200) => {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
  });
};

export const sendError = (res, message = 'Something went wrong', errors = [], statusCode = 500) => {
  return res.status(statusCode).json({
    success: false,
    message,
    errors: Array.isArray(errors) ? errors : [errors],
  });
};

