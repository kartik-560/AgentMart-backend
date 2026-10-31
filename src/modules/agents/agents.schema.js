import { z } from 'zod';

export const updateAgentStatusSchema = z.object({
  status: z.enum(['IDLE', 'ACTIVE', 'NEGOTIATING', 'SUSPENDED']),
  reason: z.string().optional(),
});

