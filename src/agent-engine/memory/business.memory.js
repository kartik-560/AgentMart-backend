/**
 * Business Memory Engine
 * Retains historical supplier interactions, scores reliability, and learns negotiation insights.
 * 
 * Non-negotiable constraint: Can formulate recommended policy changes, but
 * CANNOT silently mutate hard business constraints (budget caps, SLAs).
 */

export class BusinessMemoryEngine {
  /**
   * Retrieves supplier reliability score from persistent memory
   */
  static getSupplierScore(memoryJson, supplierKey, defaultScore = 80) {
    if (!memoryJson || typeof memoryJson !== 'object') return defaultScore;
    const supplier = memoryJson[supplierKey];
    if (supplier && typeof supplier.score === 'number') {
      return supplier.score;
    }
    return defaultScore;
  }

  /**
   * Updates memory post-transaction
   */
  static recordTransactionOutcome(existingMemory, { supplierKey, wasSuccessful, onTime, hiddenFeeDetected, actualMargin }) {
    const memory = existingMemory || {
      totalTransactions: 0,
      successfulDeals: 0,
      supplierReliability: {},
      recommendedPolicies: [],
    };

    memory.totalTransactions = (memory.totalTransactions || 0) + 1;
    if (wasSuccessful) {
      memory.successfulDeals = (memory.successfulDeals || 0) + 1;
    }

    const currentSupplier = memory.supplierReliability[supplierKey] || {
      score: 80,
      totalOrders: 0,
      onTimeDeliveries: 0,
      hiddenFeeIncidents: 0,
    };

    currentSupplier.totalOrders += 1;
    if (onTime) currentSupplier.onTimeDeliveries += 1;
    if (hiddenFeeDetected) {
      currentSupplier.hiddenFeeIncidents += 1;
      currentSupplier.score = Math.max(10, currentSupplier.score - 25);
    } else if (wasSuccessful && onTime) {
      currentSupplier.score = Math.min(100, currentSupplier.score + 2);
    }

    memory.supplierReliability[supplierKey] = currentSupplier;

    // Check if a policy change recommendation should be generated
    if (actualMargin && actualMargin > 28) {
      const recommendation = {
        id: `rec_${Date.now()}`,
        type: 'TARGET_MARGIN_INCREASE',
        description: `Supplier consistently yields ${actualMargin}% margin. Recommend raising benchmark target margin to 26%.`,
        status: 'PENDING_OWNER_APPROVAL',
        requiresExplicitApproval: true,
        proposedAt: new Date().toISOString(),
      };
      
      memory.recommendedPolicies = memory.recommendedPolicies || [];
      // Deduplicate recommendations
      if (!memory.recommendedPolicies.some(r => r.type === recommendation.type && r.status === 'PENDING_OWNER_APPROVAL')) {
        memory.recommendedPolicies.push(recommendation);
      }
    }

    return memory;
  }
}

