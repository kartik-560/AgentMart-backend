/**
 * Business Memory Engine
 * Retains historical supplier interactions, scores reliability, analyzes pricing trends,
 * tracks customer profitability, and generates strategic enterprise recommendations.
 * 
 * NON-NEGOTIABLE ARCHITECTURAL LAW:
 * Memory insights can formulate recommendations, but NEVER silently modify
 * critical business preferences or financial constraints (e.g. budget cap, SLA ceiling, floor price).
 * All policy recommendations require explicit human owner approval.
 */

import { prisma } from '../../config/prisma.js';
import { logger } from '../../utils/logger.js';
import {
  TransactionOutcomeSchema,
  PolicyRecommendationSchema,
  BusinessMemoryStoreSchema,
} from './memory.schema.js';

export class BusinessMemoryEngine {
  /**
   * Retrieves supplier reliability score from persistent memory.
   * Backward compatible with existing callers.
   *
   * @param {Object} memoryJson - Raw memory JSON from database or cache
   * @param {string} supplierKey - Identifier for supplier (e.g. 'seller-a-price')
   * @param {number} [defaultScore=80] - Default fallback score for new suppliers
   * @returns {number} Normalized reliability score (0 - 100)
   */
  static getSupplierScore(memoryJson, supplierKey, defaultScore = 80) {
    if (!memoryJson || typeof memoryJson !== 'object') return defaultScore;
    const reliability = memoryJson.supplierReliability || memoryJson;
    const supplier = reliability[supplierKey];
    if (supplier && typeof supplier.score === 'number') {
      return Math.min(100, Math.max(0, supplier.score));
    }
    return defaultScore;
  }

  /**
   * Records a completed transaction outcome and updates long-term intelligence.
   *
   * @param {Object} existingMemory - Current business memory snapshot
   * @param {Object} outcome - Transaction outcome details
   * @returns {Object} Updated business memory store
   */
  static recordTransactionOutcome(existingMemory, outcome = {}) {
    const memory = existingMemory ? JSON.parse(JSON.stringify(existingMemory)) : {
      totalTransactions: 0,
      successfulDeals: 0,
      totalSpend: 0,
      supplierReliability: {},
      historicalPricing: {},
      purchasingPatterns: {
        categoryBreakdown: {},
        averageOrderValue: 0,
        preferredSlaHours: 48,
      },
      customerProfiles: {},
      acceptedOffers: [],
      rejectedOffers: [],
      negotiationTactics: [],
      recommendedPolicies: [],
    };

    // Normalize memory structure if sparse
    memory.totalTransactions = (memory.totalTransactions || 0) + 1;
    memory.supplierReliability = memory.supplierReliability || {};
    memory.historicalPricing = memory.historicalPricing || {};
    memory.purchasingPatterns = memory.purchasingPatterns || {
      categoryBreakdown: {},
      averageOrderValue: 0,
      preferredSlaHours: 48,
    };
    memory.customerProfiles = memory.customerProfiles || {};
    memory.acceptedOffers = memory.acceptedOffers || [];
    memory.rejectedOffers = memory.rejectedOffers || [];
    memory.recommendedPolicies = memory.recommendedPolicies || [];

    const {
      supplierKey = 'unknown-supplier',
      supplierName = supplierKey,
      buyerKey = 'buyer-apex',
      sku,
      productName,
      category = 'General',
      unitPrice = 0,
      quantity = 1,
      totalAmount = 0,
      wasSuccessful = true,
      onTime = true,
      promisedHours = 48,
      actualHours = 48,
      hiddenFeeDetected = false,
      actualMargin,
      paymentReliable = true,
      disputeRaised = false,
      notes = '',
    } = outcome;

    if (wasSuccessful) {
      memory.successfulDeals = (memory.successfulDeals || 0) + 1;
      memory.totalSpend = Math.round(((memory.totalSpend || 0) + Number(totalAmount)) * 100) / 100;
    }

    // 1. Update Supplier Reliability Profile
    const currentSupplier = memory.supplierReliability[supplierKey] || {
      name: supplierName,
      score: 80,
      onTimeRate: 100,
      qualityScore: 85,
      totalOrders: 0,
      successfulDeals: 0,
      onTimeDeliveries: 0,
      hiddenFeeIncidents: 0,
      disputeIncidents: 0,
      isPreferred: false,
    };

    currentSupplier.totalOrders += 1;
    if (wasSuccessful) currentSupplier.successfulDeals += 1;
    if (onTime) currentSupplier.onTimeDeliveries += 1;
    if (disputeRaised) currentSupplier.disputeIncidents = (currentSupplier.disputeIncidents || 0) + 1;

    currentSupplier.onTimeRate = Math.round((currentSupplier.onTimeDeliveries / currentSupplier.totalOrders) * 100);

    // Score Adjustment:
    if (hiddenFeeDetected) {
      currentSupplier.hiddenFeeIncidents += 1;
      currentSupplier.score = Math.max(10, currentSupplier.score - 25);
    } else if (wasSuccessful && onTime) {
      currentSupplier.score = Math.min(100, currentSupplier.score + 3);
    } else if (!onTime) {
      currentSupplier.score = Math.max(20, currentSupplier.score - 10);
    }

    // Preferred Supplier Tagging Criteria: >=2 successful orders, score >= 85, onTimeRate >= 88%, zero hidden fees
    currentSupplier.isPreferred = (
      currentSupplier.totalOrders >= 2 &&
      currentSupplier.score >= 85 &&
      currentSupplier.onTimeRate >= 88 &&
      currentSupplier.hiddenFeeIncidents === 0
    );

    memory.supplierReliability[supplierKey] = currentSupplier;

    // 2. Historical Purchase Price Tracking & Analytics (Successful Transactions)
    if (sku && unitPrice > 0 && wasSuccessful) {
      const priceRecord = memory.historicalPricing[sku] || {
        sku,
        productName: productName || sku,
        minPrice: unitPrice,
        maxPrice: unitPrice,
        averagePrice: unitPrice,
        totalUnitsPurchased: 0,
        totalSpend: 0,
        lastPrice: unitPrice,
        priceTrend: 'STABLE',
        transactions: [],
      };

      priceRecord.minPrice = Math.min(priceRecord.minPrice, unitPrice);
      priceRecord.maxPrice = Math.max(priceRecord.maxPrice, unitPrice);
      priceRecord.totalUnitsPurchased += quantity;
      priceRecord.totalSpend = Math.round((priceRecord.totalSpend + (unitPrice * quantity)) * 100) / 100;
      priceRecord.averagePrice = Math.round((priceRecord.totalSpend / priceRecord.totalUnitsPurchased) * 100) / 100;

      // Price Trend Analysis
      if (priceRecord.lastPrice > unitPrice) {
        priceRecord.priceTrend = 'FALLING'; // Buyer achieved lower unit price
      } else if (priceRecord.lastPrice < unitPrice) {
        priceRecord.priceTrend = 'RISING';
      } else {
        priceRecord.priceTrend = 'STABLE';
      }
      priceRecord.lastPrice = unitPrice;

      priceRecord.transactions.push({
        price: unitPrice,
        quantity,
        total: Math.round(unitPrice * quantity * 100) / 100,
        supplierKey,
        timestamp: new Date().toISOString(),
      });

      // Keep last 15 price points
      if (priceRecord.transactions.length > 15) {
        priceRecord.transactions.shift();
      }

      memory.historicalPricing[sku] = priceRecord;
    }

    // 3. Purchasing Patterns
    if (category) {
      memory.purchasingPatterns.categoryBreakdown[category] = Math.round(
        ((memory.purchasingPatterns.categoryBreakdown[category] || 0) + Number(totalAmount)) * 100
      ) / 100;
    }
    if (memory.successfulDeals > 0) {
      memory.purchasingPatterns.averageOrderValue = Math.round(
        (memory.totalSpend / memory.successfulDeals) * 100
      ) / 100;
    }

    // 4. Customer Profitability & Payment Reliability (From Seller Perspective)
    if (buyerKey) {
      const custProfile = memory.customerProfiles[buyerKey] || {
        customerKey: buyerKey,
        totalOrders: 0,
        totalRevenue: 0,
        totalProfit: 0,
        averageProfitMargin: 0,
        paymentReliabilityScore: 100,
        disputes: 0,
      };

      custProfile.totalOrders += 1;
      custProfile.totalRevenue = Math.round((custProfile.totalRevenue + Number(totalAmount)) * 100) / 100;

      if (actualMargin) {
        const estimatedProfit = Math.round(Number(totalAmount) * (actualMargin / 100) * 100) / 100;
        custProfile.totalProfit = Math.round((custProfile.totalProfit + estimatedProfit) * 100) / 100;
        custProfile.averageProfitMargin = Math.round((custProfile.totalProfit / custProfile.totalRevenue * 100) * 10) / 10;
      }

      if (!paymentReliable) {
        custProfile.paymentReliabilityScore = Math.max(10, custProfile.paymentReliabilityScore - 20);
      } else {
        custProfile.paymentReliabilityScore = Math.min(100, custProfile.paymentReliabilityScore + 1);
      }

      if (disputeRaised) {
        custProfile.disputes += 1;
      }

      memory.customerProfiles[buyerKey] = custProfile;
    }

    // 5. Accepted / Rejected Offer Snapshot Logging
    const offerSnapshot = {
      timestamp: new Date().toISOString(),
      sku,
      supplierKey,
      unitPrice,
      quantity,
      totalAmount,
      wasSuccessful,
      onTime,
      hiddenFeeDetected,
      notes,
    };

    if (wasSuccessful) {
      memory.acceptedOffers.push(offerSnapshot);
      if (memory.acceptedOffers.length > 20) memory.acceptedOffers.shift();
    } else {
      memory.rejectedOffers.push(offerSnapshot);
      if (memory.rejectedOffers.length > 20) memory.rejectedOffers.shift();
    }

    // 6. Formulate Strategic Business Recommendations (Pending Explicit Human Owner Approval)
    this.synthesizeRecommendations(memory, {
      supplierKey,
      supplierProfile: currentSupplier,
      actualMargin,
      sku,
      unitPrice,
      hiddenFeeDetected,
    });

    memory.lastLearnedAt = new Date().toISOString();
    return memory;
  }

  /**
   * Synthesizes business recommendations without silently modifying constraints.
   * Every generated recommendation requires explicit owner authorization.
   */
  static synthesizeRecommendations(memory, context = {}) {
    const { supplierKey, supplierProfile, actualMargin, sku, unitPrice, hiddenFeeDetected } = context;

    // Rule A: Target Resale Margin Optimization
    if (actualMargin && actualMargin >= 27) {
      const rec = {
        id: `rec_margin_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        type: 'TARGET_MARGIN_INCREASE',
        description: `Supplier [${supplierKey}] consistently yields ${actualMargin}% resale margin. Recommend increasing target resale margin to 26% for upcoming procurement rounds.`,
        rationale: `Historical yield exceeds current 25% target by ${(actualMargin - 25).toFixed(1)} percentage points.`,
        proposedValue: 26.00,
        currentValue: 25.00,
        status: 'PENDING_OWNER_APPROVAL',
        requiresExplicitApproval: true,
        proposedAt: new Date().toISOString(),
      };
      this.addPendingRecommendation(memory, rec);
    }

    // Rule B: Preferred Supplier Elevation
    if (supplierProfile && supplierProfile.isPreferred) {
      const rec = {
        id: `rec_pref_${supplierKey}`,
        type: 'PREFERRED_SUPPLIER_TAG',
        description: `Supplier [${supplierKey}] achieved preferred supplier status (Score: ${supplierProfile.score}/100, On-time: ${supplierProfile.onTimeRate}%). Recommend granting priority RFQ dispatch in future negotiations.`,
        rationale: `Completed ${supplierProfile.successfulDeals} successful transactions with 0 hidden fees.`,
        proposedValue: { supplierKey, priorityWeightBonus: 10 },
        status: 'PENDING_OWNER_APPROVAL',
        requiresExplicitApproval: true,
        proposedAt: new Date().toISOString(),
      };
      this.addPendingRecommendation(memory, rec);
    }

    // Rule C: Supplier Malicious / Deprecation Warning
    if (hiddenFeeDetected || (supplierProfile && supplierProfile.hiddenFeeIncidents >= 1)) {
      const rec = {
        id: `rec_deprecate_${supplierKey}`,
        type: 'SUPPLIER_DEPRECATION_WARNING',
        description: `Supplier [${supplierKey}] intercepted injecting hidden narrative fees. Recommend excluding from autonomous RFQ broadcasts pending manual compliance review.`,
        rationale: `Detected ${supplierProfile.hiddenFeeIncidents} hidden fee infractions. Reliability score reduced to ${supplierProfile.score}/100.`,
        proposedValue: { supplierKey, action: 'SUSPEND_FROM_AUTONOMOUS_RFQ' },
        status: 'PENDING_OWNER_APPROVAL',
        requiresExplicitApproval: true,
        proposedAt: new Date().toISOString(),
      };
      this.addPendingRecommendation(memory, rec);
    }
  }

  /**
   * Helper to deduplicate and add recommendations
   */
  static addPendingRecommendation(memory, recommendation) {
    memory.recommendedPolicies = memory.recommendedPolicies || [];
    const exists = memory.recommendedPolicies.some(
      r => r.type === recommendation.type &&
           r.status === 'PENDING_OWNER_APPROVAL' &&
           r.description.includes(recommendation.type)
    );
    if (!exists) {
      memory.recommendedPolicies.push(recommendation);
    }
  }

  /**
   * Identifies all preferred suppliers meeting high-reliability benchmarks
   */
  static identifyPreferredSuppliers(memory) {
    if (!memory || !memory.supplierReliability) return [];

    return Object.entries(memory.supplierReliability)
      .map(([key, data]) => ({ supplierKey: key, ...data }))
      .filter(s => s.isPreferred || s.score >= 85)
      .sort((a, b) => b.score - a.score);
  }

  /**
   * Retrieves historical pricing intelligence for a specific SKU
   */
  static getHistoricalPriceAnalytics(memory, sku) {
    if (!memory || !memory.historicalPricing || !memory.historicalPricing[sku]) {
      return null;
    }
    return memory.historicalPricing[sku];
  }

  /**
   * Analyzes customer profitability and payment reliability (seller perspective)
   */
  static identifyProfitableCustomers(memory) {
    if (!memory || !memory.customerProfiles) return [];

    return Object.values(memory.customerProfiles)
      .sort((a, b) => b.totalProfit - a.totalProfit);
  }

  /**
   * Retrieves pending recommendations requiring human owner approval
   */
  static getPendingRecommendations(memory) {
    if (!memory || !Array.isArray(memory.recommendedPolicies)) return [];
    return memory.recommendedPolicies.filter(r => r.status === 'PENDING_OWNER_APPROVAL');
  }

  /**
   * Explicitly applies an owner-approved recommendation.
   * Guarantees that constraints are never mutated silently.
   *
   * @param {Object} memory - Business memory instance
   * @param {string} recommendationId - ID of policy recommendation
   * @param {Object} ownerAuthorization - { approvedBy: string, notes: string }
   * @returns {Object} { success: boolean, appliedPolicy: Object, updatedMemory: Object }
   */
  static applyPolicyRecommendation(memory, recommendationId, ownerAuthorization) {
    if (!ownerAuthorization || !ownerAuthorization.approvedBy) {
      throw new Error('Mandatory owner authorization required to apply policy recommendation');
    }

    memory.recommendedPolicies = memory.recommendedPolicies || [];
    const targetPolicy = memory.recommendedPolicies.find(r => r.id === recommendationId);

    if (!targetPolicy) {
      return { success: false, reason: `Policy recommendation [${recommendationId}] not found` };
    }

    if (targetPolicy.status === 'APPROVED_BY_OWNER') {
      return { success: false, reason: `Policy [${recommendationId}] was already approved previously` };
    }

    targetPolicy.status = 'APPROVED_BY_OWNER';
    targetPolicy.approvedAt = new Date().toISOString();
    targetPolicy.approvedBy = ownerAuthorization.approvedBy;
    targetPolicy.approvalNotes = ownerAuthorization.notes || 'Approved by enterprise owner';

    logger.info(`BusinessMemoryEngine: Policy recommendation [${recommendationId}] approved by owner [${ownerAuthorization.approvedBy}]`);

    return {
      success: true,
      appliedPolicy: targetPolicy,
      updatedMemory: memory,
    };
  }

  /**
   * Retrieves business memory from database with fallback
   */
  static async retrieveMemory(businessId) {
    try {
      if (process.env.DATABASE_URL && prisma && prisma.businessMemory) {
        const record = await prisma.businessMemory.findUnique({
          where: { businessId },
        });
        if (record) {
          return {
            totalTransactions: record.totalTransactions,
            successfulDeals: record.successfulDeals,
            supplierReliability: record.supplierReliability || {},
            negotiationTactics: record.negotiationTactics || [],
            recommendedPolicies: record.recommendedPolicies || [],
            lastLearnedAt: record.lastLearnedAt,
          };
        }
      }
    } catch (e) {
      logger.debug(`Prisma retrieveMemory fallback: ${e.message}`);
    }

    return null;
  }
}
