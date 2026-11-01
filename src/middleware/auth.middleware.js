import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { prisma } from '../config/prisma.js';
import { sendError } from '../utils/response.js';

export async function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;

  if (!token) {
    return sendError(res, 'Authentication required. No authorization token provided.', 401, 'Unauthorized');
  }

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET);
    let user = null;
    try {
      user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        include: { business: true },
      });
    } catch (dbErr) {
      console.warn('DB lookup during auth notice:', dbErr?.message);
    }

    if (!user) {
      user = {
        id: decoded.userId,
        email: decoded.email,
        name: decoded.name,
        role: decoded.role || 'OPERATOR',
        businessId: decoded.businessId,
        business: null,
      };
    }

    const accountType = decoded.accountType || (user.role === 'SUPPLIER_REP' || user.role === 'SELLER' ? 'SELLER' : 'BUYER');

    req.user = {
      ...user,
      accountType,
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

    const userRole = req.user.role;
    const accountType = req.user.accountType;

    const hasRole =
      allowedRoles.includes(userRole) ||
      allowedRoles.includes(accountType) ||
      userRole === 'ADMIN';

    if (!hasRole) {
      return sendError(
        res,
        `Access denied: this operation requires one of authorized roles [${allowedRoles.join(', ')}]`,
        403,
        'Forbidden'
      );
    }

    next();
  };
}
