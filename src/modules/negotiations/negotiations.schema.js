import { z } from 'zod';

export const createNegotiationSchema = z.object({
  targetProductId: z.string().uuid(),
  targetQuantity: z.number().int().positive().max(10000),
  maxBudget: z.number().positive().max(50000, 'Max budget cannot exceed ₹50,000 constraint'),
  maxDeliveryHours: z.number().int().min(12).max(48, 'Max delivery deadline cannot exceed 48 hours constraint'),
  targetResaleMargin: z.number().min(10).max(80).default(22.00),
});

export const advanceRoundSchema = z.object({
  roundNumber: z.number().int().positive().optional(),
});

