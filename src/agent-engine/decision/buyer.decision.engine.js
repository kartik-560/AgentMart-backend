/**
 * Buyer Decision Engine
 * Deterministic multi-attribute utility evaluator for supplier offers.
 * Enforces hard business constraints (budget ceiling, inventory, delivery SLA),
 * performs weighted scoring, risk assessment, offer comparison, and decision explanations.
 */

import {
  BuyerConstraintsSchema,
  SupplierOfferSchema,
  QualityGradeEnum,
} from './decision.schema.js';
import { FinancialCalculator } from '../tools/financial.calculator.js';
import { logger } from '../../utils/logger.js';

export class BuyerDecisionEngine {
  static DEFAULT_WEIGHTS = {
    price: 0.40,
    delivery: 0.20,
    quality: 0.20,
    reliability: 0.15,
    payment: 0.025,
    inventory: 0.025,
  };

  static LEGACY_WEIGHTS = {
    price: 0.40,
    delivery: 0.25,
    quality: 0.20,
    reliability: 0.15,
  };

  static QUALITY_SCORES = {
    'Enterprise-Plus': 100,
    'Enterprise': 88,
    'Medical-Grade': 90,
    'Certified': 85,
    'Tier-A': 80,
    'Industrial': 75,
    'Eco-Friendly': 75,
    'Compliant': 70,
    'Commercial': 65,
    'Standard': 55,
    'Uncertified': 10,
  };

  static PAYMENT_SCORES = {
    'MOCK_UPI': 90,
    'ESCROW': 95,
    'NET_30': 100,
    'NET_60': 100,
    'BANK_TRANSFER': 80,
    'DIRECT_WIRE_ONLY': 10,
    'CRYPTO': 5,
    'ADVANCE_UNVERIFIED': 15,
  };

  /**
   * Evaluates a single supplier offer against buyer parameters and constraints.
   * Enforces mandatory hard business constraints before computing utility score.
   *
   * @param {Object} rawOffer - Supplier quote payload
   * @param {Object} rawConstraints - Buyer business constraints and preferences
   * @param {number} [supplierReliabilityScore=80] - Historical supplier reliability (0-100)
   * @param {Object} [options={}] - Options (e.g. legacyMode for exact legacy score formula)
   * @returns {Object} Comprehensive evaluation result
   */
  static evaluateOffer(rawOffer, rawConstraints = {}, supplierReliabilityScore = 80, options = {}) {
    // 1. Zod Validation & Normalization
    const offerParse = SupplierOfferSchema.safeParse(rawOffer);
    if (!offerParse.success) {
      logger.warn('BuyerDecisionEngine: Offer schema validation warning', offerParse.error.format());
    }
    const offer = offerParse.success ? offerParse.data : { ...rawOffer };

    const constraintsParse = BuyerConstraintsSchema.safeParse(rawConstraints);
    const constraints = constraintsParse.success ? constraintsParse.data : {
      maxBudget: Number(rawConstraints.maxBudget || 50000.00),
      maxDeliveryHours: parseInt(rawConstraints.maxDeliveryHours || 48, 10),
      minAcceptableMargin: Number(rawConstraints.minAcceptableMargin || 18.00),
      targetResaleMargin: Number(rawConstraints.targetResaleMargin || 25.00),
      targetResalePrice: rawConstraints.targetResalePrice ? Number(rawConstraints.targetResalePrice) : undefined,
      allowedPaymentMethods: rawConstraints.allowedPaymentMethods || ['MOCK_UPI', 'ESCROW'],
      weights: rawConstraints.weights || {},
      productCatalogLeadTime: rawConstraints.productCatalogLeadTime,
      productCatalogStock: rawConstraints.productCatalogStock,
      productBaseCost: rawConstraints.productBaseCost,
    };

    const maxBudget = Number(constraints.maxBudget || 50000.00);
    const maxHours = parseInt(constraints.maxDeliveryHours || 48, 10);
    const minMargin = Number(constraints.minAcceptableMargin || 18.00);

    // 2. Compute Total Landed Cost (Safely handle partial offer payloads)
    const qty = Number(offer.quantity || 1);
    const unitPrice = offer.unitPrice !== undefined
      ? Number(offer.unitPrice)
      : (offer.totalPrice !== undefined ? Math.round(Number(offer.totalPrice) / qty * 100) / 100 : 0);
    const subtotal = Math.round(unitPrice * qty * 100) / 100;
    const declaredFees = Number(offer.declaredFees || 0);
    const detectedHiddenFee = Number(offer.detectedHiddenFee || 0);
    const totalLandedCost = Math.round((subtotal + declaredFees + detectedHiddenFee) * 100) / 100;
    const effectiveTotalPrice = Math.max(Number(offer.totalPrice || 0), totalLandedCost);

    // 3. Mandatory Hard Business Constraints Evaluation
    const hardConstraintViolations = [];

    // Constraint A: Budget Ceiling (Hard Limit ₹50,000 Procurement Cap)
    if (effectiveTotalPrice > maxBudget) {
      hardConstraintViolations.push({
        code: 'BUDGET_CEILING_BREACH',
        severity: 'CRITICAL',
        field: 'totalPrice',
        declared: effectiveTotalPrice,
        limit: maxBudget,
        message: `Total landed cost of ₹${effectiveTotalPrice.toLocaleString()} exceeds enterprise budget ceiling of ₹${maxBudget.toLocaleString()}`,
      });
    }

    // Constraint B: Inventory Availability / Phantom Inventory
    const availableStock = offer.availableStock ?? offer.stockQuantity ?? constraints.productCatalogStock;
    if (availableStock !== undefined && availableStock !== null) {
      if (offer.quantity > availableStock) {
        hardConstraintViolations.push({
          code: 'INSUFFICIENT_INVENTORY',
          severity: 'CRITICAL',
          field: 'quantity',
          requested: offer.quantity,
          available: availableStock,
          message: `Requested order quantity of ${offer.quantity} units exceeds verified available stock of ${availableStock} units`,
        });
      }
    }

    // Constraint C: Delivery SLA & Physical Feasibility
    if (offer.deliveryHours > maxHours) {
      hardConstraintViolations.push({
        code: 'DELIVERY_DEADLINE_BREACH',
        severity: 'CRITICAL',
        field: 'deliveryHours',
        declared: offer.deliveryHours,
        limit: maxHours,
        message: `Delivery commitment of ${offer.deliveryHours} hours breaches maximum acceptable SLA deadline of ${maxHours} hours`,
      });
    }

    const minCatalogLeadTime = offer.typicalLeadTimeHours ?? constraints.productCatalogLeadTime;
    if (minCatalogLeadTime && offer.deliveryHours < Math.max(4, Math.floor(minCatalogLeadTime * 0.4))) {
      hardConstraintViolations.push({
        code: 'IMPOSSIBLE_DELIVERY_COMMITMENT',
        severity: 'CRITICAL',
        field: 'deliveryHours',
        declared: offer.deliveryHours,
        minimumFeasible: minCatalogLeadTime,
        message: `Delivery commitment of ${offer.deliveryHours} hours is physically unachievable for SKU with minimum lead time of ${minCatalogLeadTime} hours`,
      });
    }

    // Constraint D: Payment Terms
    const paymentTerm = offer.paymentTerms || 'MOCK_UPI';
    const allowedPayments = constraints.allowedPaymentMethods || ['MOCK_UPI', 'ESCROW', 'NET_30'];
    if (!allowedPayments.includes(paymentTerm) && ['DIRECT_WIRE_ONLY', 'CRYPTO', 'ADVANCE_UNVERIFIED'].includes(paymentTerm)) {
      hardConstraintViolations.push({
        code: 'UNAPPROVED_PAYMENT_TERMS',
        severity: 'HIGH',
        field: 'paymentTerms',
        declared: paymentTerm,
        allowed: allowedPayments,
        message: `Supplier requires unapproved or high-risk payment rail: [${paymentTerm}]. Permitted: ${allowedPayments.join(', ')}`,
      });
    }

    // Constraint E: Projected Resale Margin
    let resaleMargin = offer.resaleMarginProjected;
    if (resaleMargin === undefined && constraints.targetResalePrice) {
      resaleMargin = FinancialCalculator.calculateResaleMargin(offer.unitPrice, constraints.targetResalePrice);
    }
    if (resaleMargin !== undefined && resaleMargin < minMargin) {
      hardConstraintViolations.push({
        code: 'MARGIN_DEFICIT',
        severity: 'HIGH',
        field: 'resaleMarginProjected',
        projected: resaleMargin,
        minimumRequired: minMargin,
        message: `Projected resale margin of ${resaleMargin}% is below acceptable enterprise floor of ${minMargin}%`,
      });
    }

    const isConstraintValid = hardConstraintViolations.length === 0;

    // 4. Multi-Attribute Weighted Utility Scoring
    // Select weights (legacy 4-attribute mode for backward compatibility or full 6-attribute)
    const useLegacy = options.legacyMode || (!constraints.weights?.payment && !constraints.weights?.inventory && options.legacyWeights);
    const weights = useLegacy
      ? this.LEGACY_WEIGHTS
      : {
          price: constraints.weights?.price ?? this.DEFAULT_WEIGHTS.price,
          delivery: constraints.weights?.delivery ?? this.DEFAULT_WEIGHTS.delivery,
          quality: constraints.weights?.quality ?? this.DEFAULT_WEIGHTS.quality,
          reliability: constraints.weights?.reliability ?? this.DEFAULT_WEIGHTS.reliability,
          payment: constraints.weights?.payment ?? this.DEFAULT_WEIGHTS.payment,
          inventory: constraints.weights?.inventory ?? this.DEFAULT_WEIGHTS.inventory,
        };

    // Sub-score 1: Price Score (Lower Landed Cost = Higher Savings)
    let priceScore = 0;
    if (effectiveTotalPrice <= maxBudget) {
      const savingsRatio = (maxBudget - effectiveTotalPrice) / maxBudget;
      priceScore = useLegacy
        ? Math.min(100, Math.max(0, 75 + (savingsRatio * 150)))
        : Math.min(100, Math.max(0, 60 + (savingsRatio * 300)));
    } else {
      priceScore = 0;
    }

    // Sub-score 2: Delivery Speed Score
    let deliveryScore = 0;
    if (offer.deliveryHours <= maxHours) {
      const speedRatio = (maxHours - offer.deliveryHours) / maxHours;
      deliveryScore = Math.min(100, Math.max(0, 70 + (speedRatio * 100)));
    } else {
      deliveryScore = 0;
    }

    // Sub-score 3: Product Quality & Warranty Score
    const baseQualityScore = this.QUALITY_SCORES[offer.qualityGrade] || 50;
    const warrantyBonus = Math.min(10, Math.floor(((offer.warrantyMonths || 12) / 12) * 5));
    const qualityScore = Math.min(100, baseQualityScore + (offer.qualityGrade === 'Enterprise-Plus' ? 0 : warrantyBonus));

    // Sub-score 4: Historical Supplier Reliability (from Business Memory)
    const reliabilityScore = Math.min(100, Math.max(0, Number(supplierReliabilityScore)));

    // Sub-score 5: Payment Terms Score
    const paymentScore = this.PAYMENT_SCORES[paymentTerm] ?? 60;

    // Sub-score 6: Inventory Cushion Score
    let inventoryScore = 80;
    if (availableStock !== undefined && availableStock !== null) {
      if (availableStock >= offer.quantity * 2) {
        inventoryScore = 100;
      } else if (availableStock >= offer.quantity) {
        const cushion = (availableStock - offer.quantity) / offer.quantity;
        inventoryScore = Math.min(100, Math.max(60, 60 + Math.round(cushion * 40)));
      } else {
        inventoryScore = 0;
      }
    }

    const weightSum = Object.values(weights).reduce((acc, v) => acc + v, 0);
    const norm = weightSum > 0 ? weightSum : 1;

    let rawUtility = (
      (priceScore * weights.price) +
      (deliveryScore * weights.delivery) +
      (qualityScore * weights.quality) +
      (reliabilityScore * weights.reliability) +
      ((paymentScore || 80) * (weights.payment || 0)) +
      ((inventoryScore || 80) * (weights.inventory || 0))
    ) / norm;

    // 5. Deduct Security & Compliance Penalties
    let penaltyApplied = 0;
    if (offer.hiddenFeeDetected) {
      penaltyApplied += 50;
    }
    if (!isConstraintValid) {
      penaltyApplied += 35;
    }
    if (offer.qualityGrade === 'Uncertified') {
      penaltyApplied += 15;
    }

    const finalUtility = Math.max(0, Math.min(100, rawUtility - penaltyApplied));
    const roundedUtility = Math.round(finalUtility * 10) / 10;

    // 6. Comprehensive Risk Evaluation
    const riskAssessment = this.evaluateRisk({
      offer,
      totalLandedCost: effectiveTotalPrice,
      maxBudget,
      deliveryHours: offer.deliveryHours,
      maxHours,
      reliabilityScore,
      violations: hardConstraintViolations,
      hiddenFeeDetected: offer.hiddenFeeDetected,
    });

    // 7. Structured Decision Explanation
    const explanation = this.generateExplanation({
      offer,
      effectiveTotalPrice,
      maxBudget,
      isConstraintValid,
      violations: hardConstraintViolations,
      utilityScore: roundedUtility,
      riskAssessment,
      breakdown: {
        priceScore: Math.round(priceScore * 10) / 10,
        deliveryScore: Math.round(deliveryScore * 10) / 10,
        qualityScore,
        reliabilityScore,
        paymentScore,
        inventoryScore,
        penaltyApplied,
      },
    });

    return {
      utilityScore: roundedUtility,
      isConstraintValid,
      effectiveTotalPrice,
      totalLandedCost,
      status: (isConstraintValid && !offer.hiddenFeeDetected) ? 'PENDING' : 'FLAGGED',
      breakdown: {
        priceScore: Math.round(priceScore * 10) / 10,
        deliveryScore: Math.round(deliveryScore * 10) / 10,
        qualityScore,
        reliabilityScore,
        paymentScore,
        inventoryScore,
        penaltyApplied,
      },
      hardConstraintViolations,
      riskAssessment,
      explanation,
    };
  }

  /**
   * Evaluates composite risk across Financial, Operational, and Fraud dimensions.
   */
  static evaluateRisk({ offer, totalLandedCost, maxBudget, deliveryHours, maxHours, reliabilityScore, violations, hiddenFeeDetected }) {
    let financialRiskScore = 0;
    let operationalRiskScore = 0;
    let securityRiskScore = 0;
    const riskFactors = [];

    // Financial Risk
    const budgetUtilization = (totalLandedCost / maxBudget) * 100;
    if (budgetUtilization > 100) {
      financialRiskScore += 100;
      riskFactors.push('Exceeds maximum allowable procurement budget ceiling');
    } else if (budgetUtilization > 95) {
      financialRiskScore += 45;
      riskFactors.push('Consumes >95% of total budget ceiling with negligible variance buffer');
    } else if (budgetUtilization > 90) {
      financialRiskScore += 25;
    }

    // Operational Risk
    const deliverySlack = maxHours - deliveryHours;
    if (deliverySlack < 0) {
      operationalRiskScore += 90;
      riskFactors.push('Breaches delivery SLA deadline');
    } else if (deliverySlack <= 4) {
      operationalRiskScore += 35;
      riskFactors.push('Tight delivery buffer (<=4h remaining before SLA deadline)');
    }

    if (reliabilityScore < 60) {
      operationalRiskScore += 40;
      riskFactors.push(`Supplier historical reliability is below benchmark (${reliabilityScore}/100)`);
    }

    // Security / Fraud Risk
    if (hiddenFeeDetected) {
      securityRiskScore += 85;
      riskFactors.push('Undeclared hidden surcharge detected in unstructured negotiation narrative');
    }
    if (offer.qualityGrade === 'Uncertified') {
      securityRiskScore += 40;
      riskFactors.push('Uncertified product quality grade poses enterprise reliability risk');
    }
    if (['DIRECT_WIRE_ONLY', 'CRYPTO'].includes(offer.paymentTerms)) {
      securityRiskScore += 70;
      riskFactors.push('Unprotected out-of-band wire payment rail requested');
    }

    // Composite Risk Level
    const compositeRiskScore = Math.min(
      100,
      Math.round(
        (financialRiskScore * 0.40) +
        (operationalRiskScore * 0.35) +
        (securityRiskScore * 0.25)
      )
    );

    let compositeRiskLevel = 'LOW';
    if (compositeRiskScore >= 75 || violations.some(v => v.severity === 'CRITICAL')) {
      compositeRiskLevel = 'CRITICAL';
    } else if (compositeRiskScore >= 50) {
      compositeRiskLevel = 'HIGH';
    } else if (compositeRiskScore >= 25) {
      compositeRiskLevel = 'MEDIUM';
    }

    return {
      compositeRiskLevel,
      compositeRiskScore,
      financialRiskScore: Math.min(100, financialRiskScore),
      operationalRiskScore: Math.min(100, operationalRiskScore),
      securityRiskScore: Math.min(100, securityRiskScore),
      riskFactors,
    };
  }

  /**
   * Generates a clear, transparent human-auditable rationale for the decision.
   */
  static generateExplanation({ offer, effectiveTotalPrice, maxBudget, isConstraintValid, violations, utilityScore, riskAssessment, breakdown }) {
    if (!isConstraintValid) {
      const topViolations = violations.map(v => `• ${v.message}`).join('\n');
      return `REJECTED: Offer breaches hard enterprise business constraints.\n${topViolations}`;
    }

    if (offer.hiddenFeeDetected) {
      return `FLAGGED (Utility: ${utilityScore}): Adversarial hidden charge detected. Landed cost inflated to ₹${effectiveTotalPrice.toLocaleString()} (Penalty: -${breakdown.penaltyApplied} points). Offer disqualified from automatic recommendation.`;
    }

    const savings = Math.max(0, maxBudget - effectiveTotalPrice);
    const savingsPercent = Math.round((savings / maxBudget) * 100);

    return `COMPLIANT (Utility: ${utilityScore}/100, Risk: ${riskAssessment.compositeRiskLevel}): Total landed cost ₹${effectiveTotalPrice.toLocaleString()} achieves ${savingsPercent}% savings against ₹${maxBudget.toLocaleString()} ceiling. Delivery guaranteed in ${offer.deliveryHours}h with ${offer.qualityGrade} grade build. Score components: Price (${breakdown.priceScore}), SLA (${breakdown.deliveryScore}), Quality (${breakdown.qualityScore}), Reliability (${breakdown.reliabilityScore}).`;
  }

  /**
   * Compares and ranks multiple supplier offers side-by-side.
   *
   * @param {Array<Object>} offers - Array of raw or evaluated offers
   * @param {Object} constraints - Buyer constraints
   * @param {Object} [reliabilityMap={}] - Map of sellerAgentId -> reliability score
   * @returns {Object} Ranked offers, recommended deal, and comparative utility matrix
   */
  static compareOffers(offers, constraints = {}, reliabilityMap = {}) {
    if (!Array.isArray(offers) || offers.length === 0) {
      return {
        rankedOffers: [],
        recommendedOffer: null,
        comparisonMatrix: [],
        summary: 'No offers provided for comparison',
      };
    }

    const evaluated = offers.map(offer => {
      // If already evaluated, check if re-evaluation needed
      const relScore = reliabilityMap[offer.sellerAgentId] ?? (offer.breakdown?.reliabilityScore || 80);
      const evalResult = this.evaluateOffer(offer, constraints, relScore);
      return {
        ...offer,
        ...evalResult,
        utilityScore: evalResult.utilityScore,
      };
    });

    // Rank: Disqualified/Flagged go to bottom; highest utility first
    const rankedOffers = [...evaluated].sort((a, b) => {
      const aDisqualified = !a.isConstraintValid || a.hiddenFeeDetected;
      const bDisqualified = !b.isConstraintValid || b.hiddenFeeDetected;
      if (aDisqualified && !bDisqualified) return 1;
      if (!aDisqualified && bDisqualified) return -1;
      return (b.utilityScore || 0) - (a.utilityScore || 0);
    });

    const recommendedOffer = rankedOffers.find(o => o.isConstraintValid && !o.hiddenFeeDetected) || null;

    // Create side-by-side comparison matrix
    const comparisonMatrix = rankedOffers.map(o => ({
      sellerAgentId: o.sellerAgentId,
      sellerType: o.sellerType,
      unitPrice: o.unitPrice,
      totalPrice: o.effectiveTotalPrice || o.totalPrice,
      deliveryHours: o.deliveryHours,
      qualityGrade: o.qualityGrade,
      utilityScore: o.utilityScore,
      riskLevel: o.riskAssessment?.compositeRiskLevel || 'LOW',
      isCompliant: o.isConstraintValid && !o.hiddenFeeDetected,
      status: o.status,
      rejectionReason: o.hardConstraintViolations?.length ? o.hardConstraintViolations[0].message : null,
    }));

    return {
      rankedOffers,
      recommendedOffer,
      comparisonMatrix,
      totalEvaluated: rankedOffers.length,
      compliantCount: rankedOffers.filter(o => o.isConstraintValid && !o.hiddenFeeDetected).length,
      summary: recommendedOffer
        ? `Top recommendation is [${recommendedOffer.sellerAgentId}] with utility score ${recommendedOffer.utilityScore}/100 at ₹${recommendedOffer.effectiveTotalPrice.toLocaleString()} landed cost.`
        : 'No compliant offers satisfied enterprise constraints.',
    };
  }

  /**
   * Backward-compatible rankOffers method matching existing callers
   */
  static rankOffers(offersWithScores) {
    return [...offersWithScores].sort((a, b) => {
      const aFlagged = a.hiddenFeeDetected || (a.isConstraintValid === false);
      const bFlagged = b.hiddenFeeDetected || (b.isConstraintValid === false);
      if (aFlagged && !bFlagged) return 1;
      if (!aFlagged && bFlagged) return -1;
      return (b.utilityScore || 0) - (a.utilityScore || 0);
    });
  }
}
