import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6, 'Password must be at least 6 characters long'),
  name: z.string().min(2, 'Name must be at least 2 characters'),
  accountType: z.enum(['BUYER', 'SELLER']).default('BUYER'),
  role: z.enum(['ADMIN', 'OPERATOR', 'BUYER_OFFICER', 'SUPPLIER_REP']).optional(),
  businessName: z.string().min(2, 'Business name must be at least 2 characters').optional(),
  businessType: z.enum(['RETAIL_ENTERPRISE', 'DISTRIBUTOR', 'MANUFACTURER', 'ECOMMERCE_OPERATOR']).optional(),
  contactPhone: z.string().optional(),
  businessId: z.string().uuid().optional(),
  otp: z.string().optional(),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1, 'Password is required'),
  accountType: z.enum(['BUYER', 'SELLER']).optional(),
});

export const sendOtpSchema = z.object({
  email: z.string().email(),
  name: z.string().optional(),
  purpose: z.string().optional().default('Account Registration'),
});

export const verifyOtpSchema = z.object({
  email: z.string().email(),
  otp: z.string().min(4, 'OTP code is required'),
  purpose: z.string().optional().default('Account Registration'),
});
