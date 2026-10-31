import { z } from 'zod';

/**
 * Agent Communication Protocol (ACP) Schemas
 * Standardized wire message and validation contracts.
 */

export const AgentRoleEnum = z.enum([
  'BUYER',
  'SELLER_A_PRICE',
  'SELLER_B_SPEED_QUALITY',
  'SELLER_C_MALICIOUS',
  'SYSTEM',
]);

export const AgentIntentEnum = z.enum([
  'RFQ_INITIATION',
  'OFFER_SUBMISSION',
  'COUNTER_OFFER',
  'OFFER_ACCEPTANCE',
  'OFFER_REJECTION',
  'DEAL_RECOMMENDATION',
  'SECURITY_FLAG',
]);

export const AgentSenderSchema = z.object({
  agentId: z.string().min(1),
  businessId: z.string().min(1),
  role: AgentRoleEnum,
});

export const AgentProposalSchema = z.object({
  sku: z.string().min(1),
  quantity: z.number().int().positive(),
  unitPrice: z.number().positive(),
  declaredFees: z.number().nonnegative().default(0),
  totalPrice: z.number().positive(),
  deliveryLeadTimeHours: z.number().int().positive(),
  qualityGrade: z.string().default('Standard'),
  paymentMethodRequested: z.string().default('MOCK_UPI'),
  warrantyMonths: z.number().int().nonnegative().default(12),
  notes: z.string().optional().default(''),
});

export const SecurityValidationSchema = z.object({
  status: z.enum(['PASSED', 'FLAGGED', 'BLOCKED']),
  sanitized: z.boolean().default(true),
  anomaliesDetected: z.array(z.any()).default([]),
});

export const WireMessageSchema = z.object({
  protocolVersion: z.string().default('1.0'),
  messageId: z.string().min(1),
  negotiationId: z.string().min(1),
  roundNumber: z.number().int().nonnegative(),
  timestamp: z.string().datetime({ offset: true }).or(z.string().min(1)),
  sender: AgentSenderSchema,
  intent: AgentIntentEnum,
  content: z.string(),
  proposal: AgentProposalSchema.nullable().optional(),
  securityValidation: SecurityValidationSchema.optional(),
});

export const NegotiationConstraintsSchema = z.object({
  maxBudget: z.number().positive().default(50000),
  maxDeliveryHours: z.number().int().positive().default(48),
  targetResaleMargin: z.number().positive().default(25),
  minAcceptableMargin: z.number().positive().default(18),
  qualityTierRequirement: z.string().default('Enterprise'),
  paymentPreferences: z.array(z.string()).default(['MOCK_UPI', 'ESCROW']),
  riskTolerance: z.enum(['CONSERVATIVE', 'BALANCED', 'AGGRESSIVE']).default('BALANCED'),
});
