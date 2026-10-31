/**
 * Deterministic Decision Engine
 * Computes multi-attribute utility scores for competing supplier offers.
 * Normalizes price, delivery SLA, quality grade, and supplier historical reliability.
 */

export class DecisionEngine {
  static WEIGHTS = {
    price: 0.40,
    delivery: 0.25,
    quality: 0.20,
    reliability: 0.15,
  };

  static QUALITY_SCORES = {
    'Enterprise-Plus': 100,
    'Enterprise': 88,
    'Tier-A': 80,
    'Industrial': 75,
    'Commercial': 65,
    'Standard': 55,
    'Uncertified': 10,
  };

  /**
   * Evaluates a single offer and calculates its normalized utility score (0 - 100)
   */
  static evaluateOffer(offer, constraints = {}, supplierReliabilityScore = 80) {
    const maxBudget = Number(constraints.maxBudget || 50000);
    const maxHours = parseInt(constraints.maxDeliveryHours || 48, 10);
    const targetRetail = Number(constraints.targetResalePrice || offer.unitPrice * 1.3);

    // 1. Price Score: Lower is better (higher savings relative to max budget)
    let priceScore = 0;
    if (offer.totalPrice <= maxBudget) {
      const savingsRatio = (maxBudget - offer.totalPrice) / maxBudget;
      priceScore = Math.min(100, Math.max(0, 75 + (savingsRatio * 150)));
    } else {
      priceScore = 0; // Breach
    }

    // 2. Delivery Score: Faster is better
    let deliveryScore = 0;
    if (offer.deliveryHours <= maxHours) {
      const speedRatio = (maxHours - offer.deliveryHours) / maxHours;
      deliveryScore = Math.min(100, Math.max(0, 70 + (speedRatio * 100)));
    } else {
      deliveryScore = 0;
    }

    // 3. Quality Score
    const qualityScore = this.QUALITY_SCORES[offer.qualityGrade] || 50;

    // 4. Historical Reliability Score (from Business Memory)
    const reliabilityScore = Math.min(100, Math.max(0, supplierReliabilityScore));

    // Weighted Utility Aggregate
    const rawUtility = (
      (priceScore * this.WEIGHTS.price) +
      (deliveryScore * this.WEIGHTS.delivery) +
      (qualityScore * this.WEIGHTS.quality) +
      (reliabilityScore * this.WEIGHTS.reliability)
    );

    // If hidden fee detected, penalize utility heavily
    const finalUtility = offer.hiddenFeeDetected ? Math.max(0, rawUtility - 50) : rawUtility;
    const roundedUtility = Math.round(finalUtility * 10) / 10;

    return {
      utilityScore: roundedUtility,
      breakdown: {
        priceScore: Math.round(priceScore * 10) / 10,
        deliveryScore: Math.round(deliveryScore * 10) / 10,
        qualityScore,
        reliabilityScore,
        penaltyApplied: offer.hiddenFeeDetected ? 50 : 0,
      },
    };
  }

  /**
   * Compares and ranks all offers in a negotiation round
   */
  static rankOffers(offersWithScores) {
    return [...offersWithScores].sort((a, b) => {
      // Discard flagged or invalid offers to the bottom
      if (a.hiddenFeeDetected && !b.hiddenFeeDetected) return 1;
      if (!a.hiddenFeeDetected && b.hiddenFeeDetected) return -1;
      return (b.utilityScore || 0) - (a.utilityScore || 0);
    });
  }
}

