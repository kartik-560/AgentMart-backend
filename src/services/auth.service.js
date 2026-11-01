import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../config/prisma.js';
import { env } from '../config/env.js';
import { otpService } from './otp.service.js';
import logger from '../utils/logger.js';

export class AuthService {
  static generateToken(user) {
    const accountType = user.role === 'SUPPLIER_REP' || user.role === 'SELLER' ? 'SELLER' : 'BUYER';
    return jwt.sign(
      {
        userId: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        accountType,
        businessId: user.businessId,
      },
      env.JWT_SECRET,
      { expiresIn: env.JWT_EXPIRES_IN || '7d' }
    );
  }

  /**
   * Request OTP code dispatched to work email
   */
  static async requestOtp({ email, name, purpose = 'Account Registration' }) {
    const cleanEmail = email ? email.trim().toLowerCase() : '';

    // If registering, check if email already exists
    if (purpose === 'Account Registration') {
      const existing = await prisma.user.findFirst({
        where: { email: { equals: cleanEmail, mode: 'insensitive' } },
      });
      if (existing) {
        const error = new Error('An account with this email address is already registered. Please sign in.');
        error.statusCode = 409;
        throw error;
      }
    }

    return await otpService.sendOtp({ email: cleanEmail, name, purpose });
  }

  /**
   * Verify OTP code without immediately creating account
   */
  static verifyOtp({ email, otp, purpose = 'Account Registration' }) {
    const cleanEmail = email ? email.trim().toLowerCase() : '';
    otpService.verifyOtp({ email: cleanEmail, otp, purpose });
    return { success: true, email: cleanEmail, verified: true, message: 'Email address verified successfully' };
  }

  /**
   * Register new user and business organization with OTP verification
   */
  static async register({
    email,
    password,
    name,
    accountType = 'BUYER',
    role,
    businessName,
    businessType,
    contactPhone,
    businessId,
    otp,
  }) {
    const cleanEmail = email.trim().toLowerCase();
    const finalRole = role || (accountType === 'SELLER' ? 'SUPPLIER_REP' : 'BUYER_OFFICER');
    const computedAccountType = finalRole === 'SUPPLIER_REP' || finalRole === 'SELLER' ? 'SELLER' : 'BUYER';

    // 1. Verify OTP code if provided or ensure email was verified
    if (otp) {
      otpService.verifyOtp({ email: cleanEmail, otp, purpose: 'Account Registration' });
      otpService.consumeOtp(cleanEmail);
    } else if (otpService.isVerified(cleanEmail)) {
      otpService.consumeOtp(cleanEmail);
    } else {
      const error = new Error('Email verification required. Please verify the OTP code sent to your email.');
      error.statusCode = 400;
      throw error;
    }

    // 2. Check if user already exists
    const existing = await prisma.user.findFirst({
      where: { email: { equals: cleanEmail, mode: 'insensitive' } },
    });
    if (existing) {
      const error = new Error('An account with this email address already exists. Please sign in.');
      error.statusCode = 409;
      throw error;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    let resolvedBusinessId = businessId || null;

    // 3. Create or resolve Business entity
    if (!resolvedBusinessId) {
      const orgName = (businessName && businessName.trim().length > 0)
        ? businessName.trim()
        : `${name}'s ${computedAccountType === 'SELLER' ? 'Supplies' : 'Enterprise'}`;

      const resolvedBusinessType = businessType || (computedAccountType === 'SELLER' ? 'DISTRIBUTOR' : 'RETAIL_ENTERPRISE');
      const regNumber = `IN-${computedAccountType === 'SELLER' ? 'SLR' : 'BYR'}-${Date.now().toString(36).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;

      try {
        const newBiz = await prisma.business.create({
          data: {
            name: orgName,
            registrationNumber: regNumber,
            businessType: resolvedBusinessType,
            contactEmail: cleanEmail,
            contactPhone: contactPhone || null,
            profile: {
              create: {
                budgetLimit: computedAccountType === 'SELLER' ? 250000.00 : 75000.00,
                targetResaleMargin: computedAccountType === 'SELLER' ? 18.00 : 25.00,
                minAcceptableMargin: 12.00,
                maxDeliveryHours: computedAccountType === 'SELLER' ? 36 : 48,
                qualityTierRequirement: 'Enterprise',
                riskTolerance: 'BALANCED',
                paymentPreferences: ['MOCK_UPI', 'ESCROW'],
              },
            },
            businessMemory: {
              create: {
                totalTransactions: 0,
                successfulDeals: 0,
                supplierReliability: {},
                negotiationTactics: ['anti-hidden-fee-filter', 'sla-assurance'],
              },
            },
          },
        });
        resolvedBusinessId = newBiz.id;

        // Initialize dedicated AI Agent for this newly registered business
        try {
          await prisma.agent.create({
            data: {
              businessId: newBiz.id,
              name: `${orgName} Autonomous Agent`,
              agentType: computedAccountType === 'SELLER' ? 'SELLER_A_PRICE' : 'BUYER',
              status: 'ACTIVE',
              modelProvider: 'Google-Gemini',
              modelName: 'gemini-2.0-flash',
              trustScore: 98.0,
              systemPrompt: computedAccountType === 'SELLER'
                ? `You are the autonomous sales and wholesale pricing agent representing ${orgName}. Your objective is to participate in verified B2B RFQs, offer competitive pricing above base margin, guarantee fulfillment SLA, and maintain high commercial integrity.`
                : `You are the autonomous procurement agent representing ${orgName}. Your objective is to negotiate optimal wholesale prices, strictly enforce 48-hour delivery deadlines, reject hidden fees, and ensure human approval for settlements.`,
              configuration: {
                targetMargin: 20,
                minAcceptableMargin: 12,
                maxDeliveryHours: 48,
                enforceDeterministicLimits: true,
              },
            },
          });
        } catch (agentErr) {
          logger.warn(`Could not seed initial agent for business ${newBiz.id}: ${agentErr?.message}`);
        }
      } catch (bizErr) {
        logger.warn(`Could not create new business, resolving default: ${bizErr?.message}`);
        const defaultBiz = await prisma.business.findFirst({
          where: {
            businessType: computedAccountType === 'SELLER' ? 'DISTRIBUTOR' : 'RETAIL_ENTERPRISE',
          },
        });
        resolvedBusinessId = defaultBiz?.id || null;
      }
    }

    // 4. Create the User record
    const user = await prisma.user.create({
      data: {
        email: cleanEmail,
        passwordHash,
        name: name.trim(),
        role: finalRole,
        businessId: resolvedBusinessId,
      },
      include: {
        business: true,
      },
    });

    const token = this.generateToken(user);
    const { passwordHash: _, ...userSafe } = user;
    logger.info(`User registered successfully: ${user.email} (${computedAccountType})`);

    return {
      user: {
        ...userSafe,
        accountType: computedAccountType,
      },
      token,
    };
  }

  /**
   * Real database-authenticated user login (No dummy accounts)
   */
  static async login({ email, password, accountType }) {
    if (!email || !password) {
      const error = new Error('Email and password credentials are required');
      error.statusCode = 400;
      throw error;
    }

    const cleanEmail = email.trim().toLowerCase();

    // Query real PostgreSQL user record
    const user = await prisma.user.findFirst({
      where: { email: { equals: cleanEmail, mode: 'insensitive' } },
      include: { business: true },
    });

    if (!user) {
      const error = new Error('Invalid email or password credentials');
      error.statusCode = 401;
      throw error;
    }

    // Verify hashed password
    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      const error = new Error('Invalid email or password credentials');
      error.statusCode = 401;
      throw error;
    }

    const userAccountType = user.role === 'SUPPLIER_REP' || user.role === 'SELLER' ? 'SELLER' : 'BUYER';

    // Enforce portal isolation: Buyer accounts must not sign in through Seller portal and vice-versa
    if (accountType && accountType !== userAccountType) {
      const error = new Error(
        `Portal access restricted. This account is registered as an enterprise ${
          userAccountType === 'BUYER' ? 'Buyer' : 'Supplier'
        }. Please switch to the ${
          userAccountType === 'BUYER' ? 'Buyer Portal' : 'Supplier Portal'
        } tab to sign in.`
      );
      error.statusCode = 403;
      throw error;
    }

    const token = this.generateToken(user);
    const { passwordHash: _, ...userSafe } = user;
    logger.info(`User authenticated: ${user.email} (${userAccountType})`);

    return {
      user: {
        ...userSafe,
        accountType: userAccountType,
      },
      token,
    };
  }
}
