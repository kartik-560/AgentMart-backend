import { z } from 'zod';

export const updateBusinessProfileSchema = z.object({
  name: z.string().min(2).optional(),
  contactEmail: z.string().email().optional(),
  contactPhone: z.string().optional(),
  budgetLimit: z.number().positive().max(1000000).optional(),
  targetResaleMargin: z.number().min(5).max(80).optional(),
  maxDeliveryHours: z.number().int().min(12).max(168).optional(),
  riskTolerance: z.enum(['CONSERVATIVE', 'BALANCED', 'AGGRESSIVE']).optional(),
});

