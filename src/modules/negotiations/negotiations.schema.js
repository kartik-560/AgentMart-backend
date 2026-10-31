import { z } from 'zod';

export const createNegotiationSchema = z.object({
  targetProductId: z.string().min(1, 'Target Product ID is required'),
  targetQuantity: z.number().int().positive().max(10000),
  maxBudget: z.number().positive(),
  maxDeliveryHours: z.number().int().min(1).max(168).default(48),
  targetResaleMargin: z.number().min(5).max(80).default(25.00),
});

export const advanceRoundSchema = z.object({
  roundNumber: z.number().int().positive().optional(),
});
