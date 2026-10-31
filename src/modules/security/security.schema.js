import { z } from 'zod';

export const resolveAlertSchema = z.object({
  resolutionNotes: z.string().min(3),
  actionTaken: z.enum(['DISMISSED', 'PENALIZED', 'AGENT_SUSPENDED']),
});

