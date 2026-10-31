import { z } from 'zod';

export const productQuerySchema = z.object({
  category: z.string().optional(),
  search: z.string().optional(),
  limit: z.string().optional().transform((val) => (val ? parseInt(val, 10) : 50)),
  offset: z.string().optional().transform((val) => (val ? parseInt(val, 10) : 0)),
});

