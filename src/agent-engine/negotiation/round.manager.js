/**
 * Round Manager
 * Governs negotiation round cycles, convergence metrics, and termination states.
 */

export class RoundManager {
  static DEFAULT_MAX_ROUNDS = 5;
  static DEFAULT_MIN_ROUNDS = 2; // Encourages genuine multi-round discourse before convergence
  static DEFAULT_TARGET_UTILITY = 85.0;

  /**
   * Determines whether negotiation should continue to next round or terminate
   */
  static shouldContinueNegotiation(currentRound, rankedOffers = [], options = {}) {
    const maxRounds = options.maxRounds || this.DEFAULT_MAX_ROUNDS;
    const minRounds = options.minRounds || this.DEFAULT_MIN_ROUNDS;
    const targetUtility = options.targetUtility || this.DEFAULT_TARGET_UTILITY;
    const maxBudget = options.maxBudget || 50000;
    const maxDeliveryHours = options.maxDeliveryHours || 48;

    // Filter valid compliant offers (no hidden fees, within budget & delivery ceiling)
    const compliantOffers = rankedOffers.filter(
      (o) => !o.hiddenFeeDetected && o.status !== 'FLAGGED' && o.totalPrice <= maxBudget && o.deliveryHours <= maxDeliveryHours
    );

    const topCompliant = compliantOffers[0] || null;

    // 1. Check convergence:
    // Immediate convergence if utility is extraordinary (>= 94),
    // OR if we have completed at least minRounds (e.g. Round 2+) and utility meets targetUtility (>= 85).
    if (topCompliant) {
      const isExtraordinary = (topCompliant.utilityScore || 0) >= 94.0;
      const isTargetMetAfterMinRounds = currentRound >= minRounds && (topCompliant.utilityScore || 0) >= targetUtility;

      if (isExtraordinary || isTargetMetAfterMinRounds) {
        return {
          continue: false,
          reason: 'DEAL_CONVERGENCE_ACHIEVED',
          recommendedOffer: topCompliant,
          message: `Top supplier offer [${topCompliant.sellerType}] achieved target utility score of ${topCompliant.utilityScore} (>= ${targetUtility}) in Round ${currentRound}.`,
        };
      }
    }

    // 2. Maximum rounds reached
    if (currentRound >= maxRounds) {
      if (topCompliant) {
        return {
          continue: false,
          reason: 'MAX_ROUNDS_REACHED',
          recommendedOffer: topCompliant,
          message: `Negotiation reached maximum round limit (${maxRounds}). Recommending best compliant offer [${topCompliant.sellerType}] with utility ${topCompliant.utilityScore}.`,
        };
      }
      return {
        continue: false,
        reason: 'MAX_ROUNDS_REACHED_NO_COMPLIANT_OFFER',
        recommendedOffer: null,
        message: `Maximum rounds (${maxRounds}) reached without any compliant supplier offer meeting budget/SLA requirements.`,
      };
    }

    // 3. Security deadlock (all competing offers flagged for 3+ rounds)
    if (rankedOffers.length > 0 && compliantOffers.length === 0 && currentRound >= 3) {
      return {
        continue: false,
        reason: 'CRITICAL_SECURITY_DEADLOCK',
        recommendedOffer: null,
        message: 'All competing supplier offers triggered critical security flags across multiple rounds.',
      };
    }

    // Continue negotiation to next round
    return {
      continue: true,
      currentRound,
      nextRound: currentRound + 1,
      topCompliantOffer: topCompliant,
      reason: 'AWAITING_COUNTER_CONVERGENCE',
      message: `Round ${currentRound} complete. Proceeding to Round ${currentRound + 1} to negotiate superior commercial terms.`,
    };
  }
}
