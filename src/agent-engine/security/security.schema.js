/**
 * Security Engine Zod Schemas
 * Strict input/output contracts for zero-trust security analysis, threat detection, and risk scoring.
 */

import { z } from 'zod';

export const ThreatTypeEnum = z.enum([
  'PROMPT_INJECTION',
  'HIDDEN_FEE',
  'UNDISCLOSED_SURCHARGE',
  'ARITHMETIC_MISMATCH',
  'PRICE_GOUGING',
  'PHANTOM_INVENTORY',
  'UNREALISTIC_SLA_FALSIFICATION',
  'IDENTITY_SPOOFING',
  'UNAUTHORIZED_PAYMENT_METHOD',
  'TOOL_INJECTION',
  'MEMORY_LEAK_ATTEMPT',
  'SYSTEM_OVERRIDE_ATTEMPT',
  'MALICIOUS_PAYLOAD',
]);

export const ThreatSeverityEnum = z.enum([
  'LOW',
  'MEDIUM',
  'HIGH',
  'CRITICAL',
]);

export const MitigationActionEnum = z.enum([
  'PASSED',
  'FLAGGED',
  'REJECTED',
  'BLOCKED',
  'SUSPENDED',
  'PENALIZED',
]);

export const SecurityAnomalySchema = z.object({
  type: ThreatTypeEnum,
  severity: ThreatSeverityEnum,
  description: z.string(),
  amount: z.number().optional(),
  pattern: z.string().optional(),
  evidence: z.string().optional(),
});

export const SecurityInspectionInputSchema = z.object({
  rawContent: z.string().nullable().optional(),
  proposal: z.object({
    unitPrice: z.number().optional(),
    quantity: z.number().optional(),
    totalPrice: z.number().optional(),
    declaredFees: z.number().optional(),
    deliveryHours: z.number().optional(),
    qualityGrade: z.string().optional(),
    paymentMethodRequested: z.string().optional(),
    paymentTerms: z.string().optional(),
  }).nullable().optional(),
  catalogContext: z.object({
    stockQuantity: z.number().optional(),
    typicalLeadTimeHours: z.number().optional(),
    minSellingPrice: z.number().optional(),
    baseCostPrice: z.number().optional(),
  }).nullable().optional(),
  agentContext: z.object({
    agentId: z.string().optional(),
    businessId: z.string().optional(),
    role: z.string().optional(),
    trustScore: z.number().optional(),
  }).nullable().optional(),
});

export const SecurityScanResultSchema = z.object({
  isClean: z.boolean(),
  sanitizedContent: z.string(),
  isolatedPayload: z.string(),
  anomalies: z.array(SecurityAnomalySchema),
  detectedHiddenFee: z.number().nonnegative(),
  riskScore: z.number().min(0).max(100),
  severity: ThreatSeverityEnum,
  mitigationAction: MitigationActionEnum,
  trustScoreAdjustment: z.number().int().negative().or(z.literal(0)),
});

export const AgentIdentityVerificationSchema = z.object({
  agentId: z.string().min(1),
  businessId: z.string().min(1),
  declaredRole: z.string().min(1),
  expectedAgentType: z.string().optional(),
  signature: z.string().optional(),
  timestamp: z.union([z.string(), z.number()]).optional(),
});

export const SecurityAuditLogEntrySchema = z.object({
  entityType: z.literal('SECURITY'),
  entityId: z.string(),
  action: z.enum(['ALERT_CREATED', 'THREAT_INTERCEPTED', 'AGENT_PENALIZED', 'PAYLOAD_BLOCKED']),
  actorType: z.enum(['HUMAN', 'AGENT', 'SYSTEM']).default('SYSTEM'),
  actorId: z.string().default('SECURITY_ENGINE'),
  threatType: ThreatTypeEnum,
  severity: ThreatSeverityEnum,
  tamperProofHash: z.string(),
  details: z.record(z.any()),
  timestamp: z.string(),
});

