/**
 * Decision Engine Zod Schemas
 * Strict input/output contracts for Buyer and Seller Decision Engines.
 */

import { z } from 'zod';

export const QualityGradeEnum = z.enum([
  'Enterprise-Plus',
  'Enterprise',
  'Tier-A',
  'Industrial',
  'Commercial',
  'Standard',
  'Eco-Friendly',
  'Medical-Grade',
  'Certified',
  'Compliant',
  'Uncertified',
]);

export const PaymentMethodEnum = z.enum([
  'MOCK_UPI',
  'ESCROW',
  'NET_30',
  'NET_60',
  'BANK_TRANSFER',
  'DIRECT_WIRE_ONLY',
  'CRYPTO',
  'ADVANCE_UNVERIFIED',
]);

export const DecisionActionEnum = z.enum([
  'ACCEPT',
  'REJECT',
  'COUNTEROFFER',
]);

export const ScoringWeightsSchema = z.object({
  price: z.number().min(0).max(1).default(0.35),
  delivery: z.number().min(0).max(1).default(0.25),
  quality: z.number().min(0).max(1).default(0.20),
  reliability: z.number().min(0).max(1).default(0.15),
  payment: z.number().min(0).max(1).default(0.025),
  inventory: z.number().min(0).max(1).default(0.025),
}).partial();

export const BuyerConstraintsSchema = z.object({
  maxBudget: z.number().positive().default(50000.00),
  maxDeliveryHours: z.number().int().positive().default(48),
  minAcceptableMargin: z.number().min(0).max(100).default(18.00),
  targetResaleMargin: z.number().min(0).max(100).default(25.00),
  targetResalePrice: z.number().positive().optional(),
  targetQuantity: z.number().int().positive().default(1),
  allowedPaymentMethods: z.array(z.string()).default(['MOCK_UPI', 'ESCROW']),
  minQualityGrade: QualityGradeEnum.optional(),
  weights: ScoringWeightsSchema.optional(),
  productCatalogLeadTime: z.number().int().nonnegative().optional(),
  productCatalogStock: z.number().int().nonnegative().optional(),
  productBaseCost: z.number().nonnegative().optional(),
});

export const SupplierOfferSchema = z.object({
  id: z.string().optional(),
  sellerAgentId: z.string().default('unknown-seller'),
  sellerBusinessId: z.string().optional(),
  sellerType: z.string().optional(),
  productId: z.string().optional(),
  sku: z.string().optional(),
  unitPrice: z.number().nonnegative().optional(),
  quantity: z.number().int().positive().default(1),
  declaredFees: z.number().nonnegative().default(0),
  totalPrice: z.number().nonnegative().optional(),
  deliveryHours: z.number().int().positive().default(48),
  qualityGrade: z.string().default('Standard'),
  warrantyMonths: z.number().int().nonnegative().default(12),
  paymentTerms: z.string().default('MOCK_UPI'),
  availableStock: z.number().int().nonnegative().optional(),
  stockQuantity: z.number().int().nonnegative().optional(),
  typicalLeadTimeHours: z.number().int().nonnegative().optional(),
  hiddenFeeDetected: z.boolean().default(false),
  detectedHiddenFee: z.number().nonnegative().default(0),
  resaleMarginProjected: z.number().optional(),
  notes: z.string().optional(),
  metadata: z.record(z.any()).optional(),
});

export const SellerRFQSchema = z.object({
  buyerBusinessId: z.string().optional(),
  buyerAgentId: z.string().optional(),
  productId: z.string().optional(),
  sku: z.string().optional(),
  requestedQuantity: z.number().int().positive(),
  offeredUnitPrice: z.number().positive().optional(),
  targetLandedPrice: z.number().positive().optional(),
  requestedDeliveryHours: z.number().int().positive().default(48),
  requestedPaymentMethod: z.string().default('MOCK_UPI'),
  buyerPaymentReliability: z.number().min(0).max(100).default(80),
  buyerLifetimeVolume: z.number().nonnegative().default(0),
  buyerDisputeCount: z.number().int().nonnegative().default(0),
  urgencyLevel: z.enum(['STANDARD', 'EXPEDITED', 'CRITICAL']).default('STANDARD'),
});

export const SellerProductContextSchema = z.object({
  id: z.string().optional(),
  sku: z.string().optional(),
  name: z.string().optional(),
  baseCostPrice: z.number().positive(),
  minSellingPrice: z.number().positive(),
  targetSellingPrice: z.number().positive(),
  stockQuantity: z.number().int().nonnegative().default(0),
  typicalLeadTimeHours: z.number().int().positive().default(24),
  qualityGrade: z.string().default('Standard'),
  logisticsCostPerUnit: z.number().nonnegative().default(50),
  minOrderQuantity: z.number().int().positive().default(1),
  targetGrossMargin: z.number().min(0).max(100).default(15.00),
  minGrossMargin: z.number().min(0).max(100).default(8.00),
  volumeDiscountTiers: z.array(z.object({
    minQuantity: z.number().int().positive(),
    discountPercent: z.number().min(0).max(50),
  })).optional(),
});
