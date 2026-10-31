import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../config/prisma.js';
import { env } from '../config/env.js';

export class AuthService {
  static generateToken(user) {
    return jwt.sign(
      {
        userId: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        businessId: user.businessId,
      },
      env.JWT_SECRET,
      { expiresIn: env.JWT_EXPIRES_IN }
    );
  }

  static async register({ email, password, name, role = 'OPERATOR', businessId = null }) {
    const passwordHash = await bcrypt.hash(password, 10);
    let user;

    try {
      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) {
        const error = new Error('User with this email already exists');
        error.statusCode = 409;
        throw error;
      }

      user = await prisma.user.create({
        data: {
          email,
          passwordHash,
          name,
          role,
          businessId,
        },
      });
    } catch (err) {
      if (err.statusCode) throw err;
      // In-memory fallback if DB table not yet migrated
      user = {
        id: `usr-${Date.now()}`,
        email,
        name,
        role,
        businessId,
      };
    }

    const token = this.generateToken(user);
    const { passwordHash: _, ...userSafe } = user;
    return { user: userSafe, token };
  }

  static async login({ email, password }) {
    let user = null;

    try {
      user = await prisma.user.findUnique({
        where: { email },
        include: { business: true },
      });
    } catch {
      // Fallback
    }

    if (!user) {
      // Demo fallback user
      if (email === 'procurement@apexretail.in' && password === 'AgentMart@2026') {
        user = {
          id: 'usr-default-operator',
          email,
          name: 'Kartik - Senior Procurement Director',
          role: 'BUYER_OFFICER',
          businessId: 'biz-apex-retail',
        };
      } else {
        const error = new Error('Invalid email or password credentials');
        error.statusCode = 401;
        throw error;
      }
    } else {
      const isValid = await bcrypt.compare(password, user.passwordHash);
      if (!isValid) {
        const error = new Error('Invalid email or password credentials');
        error.statusCode = 401;
        throw error;
      }
    }

    const token = this.generateToken(user);
    const { passwordHash: _, ...userSafe } = user;
    return { user: userSafe, token };
  }
}

