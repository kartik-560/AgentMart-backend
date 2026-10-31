import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6, 'Password must be at least 6 characters long'),
  name: z.string().min(2),
  role: z.enum(['ADMIN', 'OPERATOR', 'BUYER_OFFICER', 'SUPPLIER_REP']).default('OPERATOR'),
  businessId: z.string().uuid().optional(),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1, 'Password is required'),
});

