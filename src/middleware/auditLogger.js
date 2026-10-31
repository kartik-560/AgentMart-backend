import crypto from 'crypto';
import { logger } from '../utils/logger.js';

export function auditLogger(req, res, next) {
  const start = Date.now();
  const requestId = crypto.randomUUID();
  req.requestId = requestId;

  res.on('finish', () => {
    const duration = Date.now() - start;
    if (req.originalUrl.includes('/api/')) {
      logger.info(`HTTP ${req.method} ${req.originalUrl} [${res.statusCode}] - ${duration}ms`, {
        requestId,
        ip: req.ip,
      });
    }
  });

  next();
}

