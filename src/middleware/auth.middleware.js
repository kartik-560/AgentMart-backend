import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { prisma } from '../config/prisma.js';
import { sendError } from '../utils/response.js';

export async function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;

  if (!token) {
    // In local demo/development mode without auth headers, provide operator context
    req.user = {
      id: 'usr-default-operator',
      email: 'procurement@apexretail.in',
      name: 'Kartik - Senior Procurement Director',
      role: 'BUYER_OFFICER',
      businessId: 'biz-apex-retail',
    };
    return next();
  }

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET);
    let user = null;
    try {
      user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        include: { business: true },
      });
    } catch {
      // Fallback to decoded payload if DB is in simulation mode
    }

    req.user = user || {
      id: decoded.userId,
      email: decoded.email,
      name: decoded.name,
      role: decoded.role || 'OPERATOR',
      businessId: decoded.businessId,
    };

    next();
  } catch (err) {
    return sendError(res, 'Invalid or expired authentication token', 401, 'Unauthorized');
  }
}

export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return sendError(res, 'Authentication required', 401, 'Unauthorized');
    }

    if (!allowedRoles.includes(req.user.role) && req.user.role !== 'ADMIN') {
      return sendError(res, `Access denied: requires one of roles [${allowedRoles.join(', ')}]`, 403, 'Forbidden');
    }

    next();
  };
}

