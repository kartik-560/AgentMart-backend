import { sendError } from '../utils/response.js';
import { logger } from '../utils/logger.js';
import { ZodError } from 'zod';

export function errorHandler(err, req, res, next) {
  logger.error(`Unhandled error at ${req.method} ${req.url}:`, {
    message: err.message,
    stack: err.stack,
  });

  if (err instanceof ZodError) {
    return sendError(
      res,
      'Validation failed for incoming payload',
      400,
      'ValidationError',
      err.errors
    );
  }

  const statusCode = err.statusCode || 500;
  const message = err.isOperational ? err.message : 'An unexpected internal error occurred';
  return sendError(res, message, statusCode, err.name || 'InternalError', err.details || null);
}

