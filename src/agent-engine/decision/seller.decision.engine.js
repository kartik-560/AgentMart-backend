/**
 * Seller Decision Engine
 * Evaluates purchasing businesses, incoming buyer RFQs, and counter-proposals.
 * Considers expected profit, floor price, payment reliability, order volume,
 * repeat business potential, and fulfillment lead times.
 * Formulates ACCEPT, REJECT, or COUNTEROFFER recommendations with clear commercial rationales.
 */

import {
  SellerRFQSchema,
  SellerProductContextSchema,
  DecisionActionEnum,
} from './decision.schema.js';
import { FinancialCalculator } from '../tools/financial.calculator.js';
import { logger } from '../../utils/logger.js';

export class SellerDecisionEngine {
  /**
   * Evaluates an incoming buyer RFQ / proposal against seller commercial parameters.
   *
   * @param {Object} rawRfq - Buyer request / proposal details
   * @param {Object} rawProductContext - Product cost, inventory, lead times, and seller strategy
   * @param {Object} [options={}] - Additional seller preferences
   * @returns {Object} Commercial evaluation and recommended action (ACCEPT, REJECT, COUNTEROFFER)
   */
  static evaluateBuyerRequest(rawRfq, rawProductContext, options = {}) {
    const rfqParse = SellerRFQSchema.safeParse(rawRfq);
    const productParse = SellerProductContextSchema.safeParse(rawProductContext);

    if (!rfqParse.success) {
      logger.warn('SellerDecisionEngine: RFQ schema validation warning', rfqParse.error.format());
    }
    if (!productParse.success) {
      logger.warn('SellerDecisionEngine: Product context validation warning', productParse.error.format());
    }

    const rfq = rfqParse.success ? rfqParse.data : { ...rawRfq };
    const product = productParse.success ? productParse.data : {
      baseCostPrice: Number(rawProductContext.baseCostPrice || 3200),
      minSellingPrice: Number(rawProductContext.minSellingPrice || 3500),
      targetSellingPrice: Number(rawProductContext.targetSellingPrice || 4200),
      stockQuantity: Number(rawProductContext.stockQuantity || 100),
      typicalLeadTimeHours: Number(rawProductContext.typicalLeadTimeHours || 24),
      logisticsCostPerUnit: Number(rawProductContext.logisticsCostPerUnit || 50),
      targetGrossMargin: Number(rawProductContext.targetGrossMargin || 15.00),
      minGrossMargin: Number(rawProductContext.minGrossMargin || 8.00),
      minOrderQuantity: Number(rawProductContext.minOrderQuantity || 1),
    };

    const requestedQty = Number(rfq.requestedQuantity || 1);
    const offeredPrice = rfq.offeredUnitPrice !== undefined
      ? Number(rfq.offeredUnitPrice)
      : (rfq.targetLandedPrice ? Math.round(Number(rfq.targetLandedPrice) / requestedQty) : Number(product.targetSellingPrice));

    const baseCost = Number(product.baseCostPrice);
    const floorPrice = Number(product.minSellingPrice);
    const targetPrice = Number(product.targetSellingPrice);
    const logisticsPerUnit = Number(product.logisticsCostPerUnit || 0);

    // 1. Commercial Financial Calculations
    const revenue = Math.round(offeredPrice * requestedQty * 100) / 100;
    const totalCogs = Math.round(baseCost * requestedQty * 100) / 100;
    const totalLogistics = Math.round(logisticsPerUnit * requestedQty * 100) / 100;
    const totalFulfillmentCost = totalCogs + totalLogistics;
    const grossProfit = Math.round((revenue - totalFulfillmentCost) * 100) / 100;
    const grossMarginPercent = revenue > 0
      ? Math.round(((grossProfit / revenue) * 100) * 100) / 100
      : 0;

    // 2. Minimum Selling Price (Floor Price) Check
    const isBelowFloorPrice = offeredPrice < floorPrice;
    const floorDeficit = isBelowFloorPrice ? Math.round((floorPrice - offeredPrice) * 100) / 100 : 0;
    const floorDeficitPercent = isBelowFloorPrice ? Math.round((floorDeficit / floorPrice) * 1000) / 10 : 0;

    // 3. Payment Reliability & Credit Assessment
    const buyerPaymentReliability = Number(rfq.buyerPaymentReliability ?? 80);
    const buyerDisputeCount = Number(rfq.buyerDisputeCount ?? 0);
    const paymentMethodRequested = rfq.requestedPaymentMethod || 'MOCK_UPI';
    const isSafePaymentRail = ['MOCK_UPI', 'ESCROW', 'BANK_TRANSFER'].includes(paymentMethodRequested);

    // 4. Order Quantity & Capacity Analysis
    const stockAvailable = Number(product.stockQuantity || 0);
    const isStockSufficient = stockAvailable >= requestedQty;
    const capacityUtilization = stockAvailable > 0
      ? Math.round((requestedQty / stockAvailable) * 100)
      : 100;
    const isBulkVolume = requestedQty >= (product.minOrderQuantity * 5);

    // 5. Repeat Business & Customer Lifetime Value
    const buyerLifetimeVolume = Number(rfq.buyerLifetimeVolume || 0);
    const hasRepeatBusinessHistory = buyerLifetimeVolume > 50000;
    const repeatPotentialScore = Math.min(100, Math.round(
      (buyerPaymentReliability * 0.4) +
      (Math.min(50, buyerLifetimeVolume / 2000) * 0.8) +
      (hasRepeatBusinessHistory ? 20 : 0) -
      (buyerDisputeCount * 15)
    ));

    // 6. Delivery Lead Time Feasibility
    const requestedDeliveryHours = Number(rfq.requestedDeliveryHours || 48);
    const minimumLeadTimeHours = Number(product.typicalLeadTimeHours || 24);
    const isDeliveryFeasible = requestedDeliveryHours >= minimumLeadTimeHours;
    const isDeliveryPhysicallyImpossible = requestedDeliveryHours < Math.floor(minimumLeadTimeHours * 0.4);

    // 7. Decision Recommendation Formulation (ACCEPT, REJECT, COUNTEROFFER)
    let recommendedAction = 'COUNTEROFFER';
    let decisionReason = '';
    const rejectionReasons = [];
    let counterofferTerms = null;

    // Rejection Criteria
    if (!isStockSufficient) {
      recommendedAction = 'REJECT';
      rejectionReasons.push(`Insufficient inventory: Requested ${requestedQty} units, available stock is ${stockAvailable} units.`);
    } else if (isDeliveryPhysicallyImpossible) {
      recommendedAction = 'REJECT';
      rejectionReasons.push(`Impossible delivery SLA: Requested ${requestedDeliveryHours}h is far below physical minimum ${minimumLeadTimeHours}h.`);
    } else if (buyerPaymentReliability < 35 || buyerDisputeCount >= 3) {
      recommendedAction = 'REJECT';
      rejectionReasons.push(`High payment default risk: Buyer payment reliability is ${buyerPaymentReliability}/100 with ${buyerDisputeCount} disputes.`);
    } else if (isBelowFloorPrice && floorDeficitPercent > 15) {
      recommendedAction = 'REJECT';
      rejectionReasons.push(`Severe floor price violation: Offered ₹${offeredPrice} is ${floorDeficitPercent}% below floor price ₹${floorPrice}.`);
    }

    // Acceptance Criteria
    if (recommendedAction !== 'REJECT') {
      const minAcceptableMargin = Number(product.minGrossMargin || 8.00);
      const isProfitable = grossMarginPercent >= minAcceptableMargin;
      const isCompliantPrice = offeredPrice >= floorPrice;
      const isReliableBuyer = buyerPaymentReliability >= 60;

      if (isCompliantPrice && isProfitable && isDeliveryFeasible && isReliableBuyer && isSafePaymentRail) {
        recommendedAction = 'ACCEPT';
        decisionReason = `Deal meets commercial criteria. Generates ₹${grossProfit.toLocaleString()} gross profit (${grossMarginPercent}% margin) above floor price ₹${floorPrice}. Delivery in ${requestedDeliveryHours}h is within standard ${minimumLeadTimeHours}h lead time.`;
      } else {
        // Counteroffer Formulation
        recommendedAction = 'COUNTEROFFER';

        // Calculate optimal counter unit price
        // Target: achieve product.targetGrossMargin or at least floorPrice + volume discount
        let proposedUnitPrice = targetPrice;
        if (isBulkVolume) {
          // Volume discount: discount up to 5-10% if requested volume is large, but stay >= floorPrice
          const volumeDiscountPct = Math.min(10, Math.floor((requestedQty / 10) * 2));
          proposedUnitPrice = Math.max(floorPrice, Math.round(targetPrice * (1 - volumeDiscountPct / 100)));
        } else if (offeredPrice < targetPrice) {
          // Compromise halfway between buyer offer and target price, bounded by floorPrice
          proposedUnitPrice = Math.max(floorPrice, Math.round((offeredPrice + targetPrice) / 2));
        }

        const counterTotal = Math.round(proposedUnitPrice * requestedQty * 100) / 100;
        const counterDelivery = isDeliveryFeasible ? requestedDeliveryHours : Math.max(minimumLeadTimeHours, requestedDeliveryHours);
        const counterProfit = Math.round((counterTotal - (totalCogs + totalLogistics)) * 100) / 100;
        const counterMargin = Math.round(((counterProfit / counterTotal) * 100) * 100) / 100;

        counterofferTerms = {
          proposedUnitPrice,
          requestedQuantity: requestedQty,
          proposedTotalPrice: counterTotal,
          proposedDeliveryHours: counterDelivery,
          requiredPaymentTerms: isSafePaymentRail ? paymentMethodRequested : 'MOCK_UPI',
          expectedGrossProfit: counterProfit,
          expectedGrossMarginPercent: counterMargin,
        };

        const reasons = [];
        if (isBelowFloorPrice) reasons.push(`Offered price ₹${offeredPrice} is below seller floor ₹${floorPrice}; counter-proposing ₹${proposedUnitPrice}`);
        else if (offeredPrice < targetPrice) reasons.push(`Adjusting unit price to ₹${proposedUnitPrice} to satisfy minimum commercial margin`);
        if (!isDeliveryFeasible) reasons.push(`Extending delivery commitment from ${requestedDeliveryHours}h to feasible ${counterDelivery}h lead time`);
        if (!isSafePaymentRail) reasons.push(`Requiring secure MOCK_UPI payment rail to mitigate counterparty risk`);

        decisionReason = `Counteroffer proposed: ${reasons.join('. ')}. Yields ₹${counterProfit.toLocaleString()} profit (${counterMargin}% margin).`;
      }
    }

    if (recommendedAction === 'REJECT') {
      decisionReason = `REJECTED: ${rejectionReasons.join(' ')}`;
    }

    return {
      recommendedAction,
      decisionReason,
      metrics: {
        offeredUnitPrice: offeredPrice,
        requestedQuantity: requestedQty,
        totalRevenue: revenue,
        totalCogs,
        totalLogistics,
        expectedGrossProfit: grossProfit,
        expectedGrossMarginPercent: grossMarginPercent,
        unitFloorPrice: floorPrice,
        unitTargetPrice: targetPrice,
        isBelowFloorPrice,
        floorDeficit,
      },
      feasibility: {
        isStockSufficient,
        capacityUtilization,
        isDeliveryFeasible,
        requestedDeliveryHours,
        minimumLeadTimeHours,
      },
      counterpartyRisk: {
        buyerPaymentReliability,
        buyerDisputeCount,
        isSafePaymentRail,
        repeatPotentialScore,
        hasRepeatBusinessHistory,
      },
      counterofferTerms,
      rejectionReasons: rejectionReasons.length > 0 ? rejectionReasons : null,
    };
  }

  /**
   * Generates a counteroffer proposal payload ready for the negotiation protocol
   */
  static generateCounteroffer(rfq, productContext, options = {}) {
    const evaluation = this.evaluateBuyerRequest(rfq, productContext, options);
    if (evaluation.recommendedAction === 'ACCEPT') {
      return {
        action: 'ACCEPT',
        unitPrice: evaluation.metrics.offeredUnitPrice,
        quantity: evaluation.metrics.requestedQuantity,
        totalPrice: evaluation.metrics.totalRevenue,
        deliveryHours: evaluation.feasibility.requestedDeliveryHours,
        notes: evaluation.decisionReason,
      };
    }

    if (evaluation.recommendedAction === 'REJECT') {
      return {
        action: 'REJECT',
        rejectionReasons: evaluation.rejectionReasons,
        notes: evaluation.decisionReason,
      };
    }

    return {
      action: 'COUNTEROFFER',
      unitPrice: evaluation.counterofferTerms.proposedUnitPrice,
      quantity: evaluation.counterofferTerms.requestedQuantity,
      totalPrice: evaluation.counterofferTerms.proposedTotalPrice,
      deliveryHours: evaluation.counterofferTerms.proposedDeliveryHours,
      paymentTerms: evaluation.counterofferTerms.requiredPaymentTerms,
      expectedMargin: evaluation.counterofferTerms.expectedGrossMarginPercent,
      notes: evaluation.decisionReason,
    };
  }
}

