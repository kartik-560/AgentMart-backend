import { z } from 'zod';

/**
 * LLM Structured Output Schemas
 * Validates JSON structures extracted from LLM markdown generation.
 */

export const LLMSellerProposalSchema = z.object({
  unitPrice: z.coerce.number().positive(),
  quantity: z.coerce.number().int().positive(),
  declaredFees: z.coerce.number().nonnegative().optional().default(0),
  totalPrice: z.coerce.number().positive(),
  deliveryLeadTimeHours: z.coerce.number().int().positive().optional(),
  deliveryHours: z.coerce.number().int().positive().optional(),
  qualityGrade: z.string().optional().default('Standard'),
  paymentMethodRequested: z.string().optional().default('MOCK_UPI'),
  warrantyMonths: z.coerce.number().int().nonnegative().optional().default(12),
  notes: z.string().optional().default(''),
}).transform((data) => {
  // Normalize delivery hours
  const hours = data.deliveryLeadTimeHours || data.deliveryHours || 48;
  return {
    unitPrice: data.unitPrice,
    quantity: data.quantity,
    declaredFees: data.declaredFees,
    totalPrice: data.totalPrice,
    deliveryLeadTimeHours: hours,
    qualityGrade: data.qualityGrade,
    paymentMethodRequested: data.paymentMethodRequested,
    warrantyMonths: data.warrantyMonths,
    notes: data.notes,
  };
});

export const LLMCounterOfferItemSchema = z.object({
  sellerRole: z.string(),
  targetUnitPrice: z.coerce.number().positive().optional(),
  demandedLeadTimeHours: z.coerce.number().int().positive().optional(),
  rationale: z.string(),
});

export const LLMBuyerEvaluationSchema = z.object({
  intent: z.enum(['COUNTER_OFFER', 'DEAL_RECOMMENDATION', 'REJECT_ALL']),
  reasoning: z.string().min(5),
  counterOffers: z.array(LLMCounterOfferItemSchema).optional().default([]),
  recommendedSellerRole: z.string().nullable().optional(),
  explanation: z.string().optional().default(''),
});
