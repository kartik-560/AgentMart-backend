/**
 * Round Manager
 * Controls round limits, convergence checks, and timeout handling.
 */

export class RoundManager {
  static MAX_ROUNDS = 5;

  static shouldContinueNegotiation(currentRound, rankedOffers, targetUtility = 85) {
    if (currentRound >= this.MAX_ROUNDS) {
      return { continue: false, reason: 'MAX_ROUNDS_REACHED' };
    }

    const topOffer = rankedOffers.find(o => !o.hiddenFeeDetected);
    if (topOffer && topOffer.utilityScore >= targetUtility) {
      return { continue: false, reason: 'DEAL_CONVERGENCE_ACHIEVED', recommendedOffer: topOffer };
    }

    return { continue: true };
  }
}

