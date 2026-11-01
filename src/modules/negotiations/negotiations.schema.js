import { z } from 'zod';

export const createNegotiationSchema = z.object({
  targetProductId: z.string().optional(),
  targetSku: z.string().optional(),
  targetQuantity: z.coerce.number().int().positive().max(10000),
  maxBudget: z.coerce.number().positive(),
  maxDeliveryHours: z.coerce.number().int().min(1).max(168).default(48),
  targetResaleMargin: z.coerce.number().min(5).max(80).default(25.00),
}).refine((data) => data.targetProductId || data.targetSku, {
  message: 'Either targetProductId or targetSku must be provided',
});

export const advanceRoundSchema = z.object({
  roundNumber: z.number().int().positive().optional(),
});
