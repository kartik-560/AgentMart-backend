/**
 * Deterministic Financial Calculator
 * Strict arithmetic module - strictly prevents floating-point inaccuracies and LLM hallucinated math.
 */

export class FinancialCalculator {
  /**
   * Computes total price strictly: (unitPrice * quantity) + declaredFees
   */
  static calculateTotal(unitPrice, quantity, declaredFees = 0) {
    const unit = Number(unitPrice);
    const qty = parseInt(quantity, 10);
    const fees = Number(declaredFees);

    if (isNaN(unit) || isNaN(qty) || unit < 0 || qty <= 0) {
      throw new Error('Invalid financial inputs for total calculation');
    }

    const subtotal = Math.round(unit * qty * 100) / 100;
    const total = Math.round((subtotal + fees) * 100) / 100;
    return {
      subtotal,
      declaredFees: fees,
      total,
    };
  }

  /**
   * Calculates gross resale margin percentage: ((targetResalePrice - unitCostPrice) / targetResalePrice) * 100
   */
  static calculateResaleMargin(unitCostPrice, targetResalePrice) {
    const cost = Number(unitCostPrice);
    const retail = Number(targetResalePrice);

    if (retail <= 0) return 0;
    const margin = ((retail - cost) / retail) * 100;
    return Math.round(margin * 100) / 100;
  }

  /**
   * Calculates volume discount percentage applied
   */
  static calculateDiscountPercentage(basePrice, offeredPrice) {
    const base = Number(basePrice);
    const offered = Number(offeredPrice);

    if (base <= 0 || offered >= base) return 0;
    const discount = ((base - offered) / base) * 100;
    return Math.round(discount * 100) / 100;
  }
}

