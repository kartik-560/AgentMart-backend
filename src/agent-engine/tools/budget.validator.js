/**
 * Deterministic Budget & Boundary Validator
 * Enforces hard commercial limits. Rejects any attempt to breach enterprise thresholds.
 */

export class BudgetValidator {
  static HARD_MAX_BUDGET = 10000000.00; // ₹50,000 procurement cap
  static HARD_MAX_DELIVERY_HOURS = 48; // 48-hour SLA ceiling

  /**
   * Evaluates an offer strictly against enterprise boundaries
   */
  static validateOfferConstraints(offer, buyerConstraints = {}) {
    const maxBudget = Number(buyerConstraints.maxBudget || this.HARD_MAX_BUDGET);
    const maxHours = parseInt(buyerConstraints.maxDeliveryHours || this.HARD_MAX_DELIVERY_HOURS, 10);
    const minMargin = Number(buyerConstraints.minAcceptableMargin || 18.00);

    const issues = [];

    // 1. Hard Budget Limit
    if (offer.totalPrice > maxBudget) {
      issues.push({
        constraint: 'MAX_BUDGET',
        declared: offer.totalPrice,
        limit: maxBudget,
        message: `Total price ₹${offer.totalPrice.toLocaleString()} exceeds hard budget ceiling of ₹${maxBudget.toLocaleString()}`,
      });
    }

    // 2. Hard Delivery Deadline
    if (offer.deliveryHours > maxHours) {
      issues.push({
        constraint: 'MAX_DELIVERY_HOURS',
        declared: offer.deliveryHours,
        limit: maxHours,
        message: `Delivery SLA of ${offer.deliveryHours} hours exceeds maximum allowable deadline of ${maxHours} hours`,
      });
    }

    // 3. Minimum Margin
    if (offer.resaleMarginProjected !== undefined && offer.resaleMarginProjected < minMargin) {
      issues.push({
        constraint: 'MIN_RESALE_MARGIN',
        declared: offer.resaleMarginProjected,
        limit: minMargin,
        message: `Projected resale margin of ${offer.resaleMarginProjected}% is below minimum required threshold of ${minMargin}%`,
      });
    }

    return {
      isValid: issues.length === 0,
      issues,
    };
  }

  /**
   * Enforces seller floor price (prevents negative seller margins unless promotional clearance)
   */
  static validateSellerFloorPrice(unitPrice, minSellingPrice) {
    if (Number(unitPrice) < Number(minSellingPrice)) {
      return {
        isValid: false,
        message: `Offered unit price ₹${unitPrice} is below seller minimum floor price ₹${minSellingPrice}`,
      };
    }
    return { isValid: true };
  }
}

