/**
 * Business Memory Engine Zod Schemas
 * Strict input/output contracts for transaction history learning, preferred supplier scoring,
 * price analytics, and non-silent policy change governance.
 */

import { z } from 'zod';

export const TransactionOutcomeSchema = z.object({
  supplierKey: z.string().min(1),
  supplierName: z.string().optional(),
  buyerKey: z.string().default('buyer-apex'),
  sku: z.string().optional(),
  productName: z.string().optional(),
  category: z.string().optional(),
  unitPrice: z.number().positive(),
  quantity: z.number().int().positive(),
  totalAmount: z.number().positive(),
  wasSuccessful: z.boolean(),
  onTime: z.boolean(),
  promisedHours: z.number().int().positive().optional(),
  actualHours: z.number().int().positive().optional(),
  hiddenFeeDetected: z.boolean().default(false),
  actualMargin: z.number().optional(),
  paymentReliable: z.boolean().default(true),
  paymentDelayHours: z.number().int().nonnegative().default(0),
  disputeRaised: z.boolean().default(false),
  customerFeedbackScore: z.number().min(1).max(5).optional(),
  notes: z.string().optional(),
  timestamp: z.string().optional(),
});

export const PolicyRecommendationSchema = z.object({
  id: z.string(),
  type: z.enum([
    'TARGET_MARGIN_INCREASE',
    'TARGET_MARGIN_DECREASE',
    'PREFERRED_SUPPLIER_TAG',
    'SUPPLIER_DEPRECATION_WARNING',
    'BUDGET_CAP_ADJUSTMENT',
    'SLA_ADJUSTMENT',
    'RISK_TOLERANCE_ADJUSTMENT',
    'PREFERRED_PAYMENT_METHOD',
  ]),
  description: z.string(),
  rationale: z.string().optional(),
  metricEvidence: z.record(z.any()).optional(),
  proposedValue: z.any(),
  currentValue: z.any().optional(),
  status: z.enum(['PENDING_OWNER_APPROVAL', 'APPROVED_BY_OWNER', 'REJECTED_BY_OWNER']).default('PENDING_OWNER_APPROVAL'),
  requiresExplicitApproval: z.literal(true).default(true),
  proposedAt: z.string(),
  approvedAt: z.string().optional(),
  approvedBy: z.string().optional(),
});

export const SupplierReliabilityProfileSchema = z.object({
  score: z.number().min(0).max(100),
  onTimeRate: z.number().min(0).max(100),
  qualityScore: z.number().min(0).max(100),
  totalOrders: z.number().int().nonnegative(),
  successfulDeals: z.number().int().nonnegative(),
  onTimeDeliveries: z.number().int().nonnegative(),
  hiddenFeeIncidents: z.number().int().nonnegative(),
  disputeIncidents: z.number().int().nonnegative().default(0),
  averageMarginDelivered: z.number().optional(),
  isPreferred: z.boolean().default(false),
  lastTransactionAt: z.string().optional(),
});

export const BusinessMemoryStoreSchema = z.object({
  totalTransactions: z.number().int().nonnegative().default(0),
  successfulDeals: z.number().int().nonnegative().default(0),
  totalSpend: z.number().nonnegative().default(0),
  supplierReliability: z.record(SupplierReliabilityProfileSchema).default({}),
  historicalPricing: z.record(z.object({
    sku: z.string(),
    minPrice: z.number().nonnegative(),
    maxPrice: z.number().nonnegative(),
    averagePrice: z.number().nonnegative(),
    totalUnitsPurchased: z.number().int().nonnegative(),
    totalSpend: z.number().nonnegative(),
    lastPrice: z.number().nonnegative(),
    transactions: z.array(z.object({
      price: z.number(),
      quantity: z.number(),
      supplierKey: z.string(),
      timestamp: z.string(),
    })).default([]),
  })).default({}),
  purchasingPatterns: z.object({
    categoryBreakdown: z.record(z.number()).default({}),
    averageOrderValue: z.number().default(0),
    peakOrderingDays: z.array(z.string()).default([]),
    preferredSlaHours: z.number().default(48),
  }).default({}),
  customerProfiles: z.record(z.object({
    customerKey: z.string(),
    totalOrders: z.number().int().nonnegative().default(0),
    totalRevenue: z.number().nonnegative().default(0),
    totalProfit: z.number().default(0),
    averageProfitMargin: z.number().default(0),
    paymentReliabilityScore: z.number().min(0).max(100).default(100),
    disputes: z.number().int().nonnegative().default(0),
  })).default({}),
  negotiationTactics: z.array(z.string()).default([]),
  recommendedPolicies: z.array(PolicyRecommendationSchema).default([]),
  lastLearnedAt: z.string().optional(),
});

