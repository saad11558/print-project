/**
 * PrintShop — Centralized Error Handler Middleware
 */

class AppError extends Error {
  constructor(message, statusCode = 500) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
  }
}

/**
 * Express error-handling middleware (4-arg signature).
 */
function errorHandler(err, req, res, _next) {
  const statusCode = err.statusCode || 500;
  const message = err.isOperational ? err.message : 'Internal server error';

  console.error(`[Error] ${req.method} ${req.originalUrl} → ${statusCode}: ${err.message}`);
  if (!err.isOperational) {
    console.error(err.stack);
  }

  res.status(statusCode).json({ error: message });
}

module.exports = { AppError, errorHandler };
