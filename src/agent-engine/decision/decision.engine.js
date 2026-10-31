/**
 * Deterministic Decision Engine
 * Unifies the Buyer Decision Engine and Seller Decision Engine.
 * 
 * Computes multi-attribute utility scores for competing supplier offers,
 * validates hard business constraints, assesses risk, compares offers side-by-side,
 * and evaluates buyer RFQs for sellers with accept, reject, or counteroffer recommendations.
 */

import { BuyerDecisionEngine } from './buyer.decision.engine.js';
import { SellerDecisionEngine } from './seller.decision.engine.js';

export { BuyerDecisionEngine, SellerDecisionEngine };

export class DecisionEngine {
  // Expose existing constants for backward compatibility
  static WEIGHTS = BuyerDecisionEngine.LEGACY_WEIGHTS;
  static QUALITY_SCORES = BuyerDecisionEngine.QUALITY_SCORES;
  static PAYMENT_SCORES = BuyerDecisionEngine.PAYMENT_SCORES;

  /**
   * Evaluates a single supplier offer.
   * Backward compatible with existing callers, enhanced with hard constraint validation & risk evaluation.
   *
   * @param {Object} offer - Supplier offer payload
   * @param {Object} [constraints={}] - Buyer constraints (maxBudget, maxDeliveryHours, etc.)
   * @param {number} [supplierReliabilityScore=80] - Historical supplier reliability (0-100)
   * @returns {Object} Utility score, breakdown, and constraint check results
   */
  static evaluateOffer(offer, constraints = {}, supplierReliabilityScore = 80) {
    return BuyerDecisionEngine.evaluateOffer(offer, constraints, supplierReliabilityScore, { legacyWeights: true });
  }

  /**
   * Evaluates an offer using the full 6-attribute Buyer Decision Engine
   */
  static evaluateBuyerOffer(offer, constraints = {}, supplierReliabilityScore = 80, options = {}) {
    return BuyerDecisionEngine.evaluateOffer(offer, constraints, supplierReliabilityScore, options);
  }

  /**
   * Compares and ranks all offers in a negotiation round side-by-side
   */
  static rankOffers(offersWithScores) {
    return BuyerDecisionEngine.rankOffers(offersWithScores);
  }

  /**
   * Generates a side-by-side comparison matrix with recommended deal selection
   */
  static compareOffers(offers, constraints = {}, reliabilityMap = {}) {
    return BuyerDecisionEngine.compareOffers(offers, constraints, reliabilityMap);
  }

  /**
   * Evaluates a buyer purchase request from the seller's perspective
   *
   * @param {Object} rfq - Buyer RFQ / counter-proposal
   * @param {Object} productContext - Product cost, floor price, stock, lead time
   * @param {Object} [options={}] - Seller strategy parameters
   * @returns {Object} Evaluation with ACCEPT, REJECT, or COUNTEROFFER recommendation
   */
  static evaluateSellerRequest(rfq, productContext, options = {}) {
    return SellerDecisionEngine.evaluateBuyerRequest(rfq, productContext, options);
  }

  /**
   * Generates a concrete counteroffer proposal payload for sellers
   */
  static generateSellerRecommendation(rfq, productContext, options = {}) {
    return SellerDecisionEngine.generateCounteroffer(rfq, productContext, options);
  }
}
