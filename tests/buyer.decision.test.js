import { test, describe } from 'node:test';
import assert from 'node:assert';
import { BuyerDecisionEngine } from '../src/agent-engine/decision/buyer.decision.engine.js';
import { DecisionEngine } from '../src/agent-engine/decision/decision.engine.js';

describe('Buyer Decision Engine - Hard Business Constraints', () => {
  const baseConstraints = {
    maxBudget: 50000.00,
    maxDeliveryHours: 48,
    minAcceptableMargin: 18.00,
    productCatalogStock: 100,
    productCatalogLeadTime: 24,
  };

  test('Mandatory Validation: Rejects offer breaching ₹50,000 budget ceiling', () => {
    const overBudgetOffer = {
      sellerAgentId: 'seller-x',
      unitPrice: 4500,
      quantity: 12, // 4500 * 12 = 54,000 > 50,000
      totalPrice: 54000,
      deliveryHours: 36,
      qualityGrade: 'Enterprise',
    };

    const evaluation = BuyerDecisionEngine.evaluateOffer(overBudgetOffer, baseConstraints);
    assert.strictEqual(evaluation.isConstraintValid, false);
    assert.strictEqual(evaluation.status, 'FLAGGED');
    assert.ok(evaluation.hardConstraintViolations.some(v => v.code === 'BUDGET_CEILING_BREACH'));
    assert.ok(evaluation.explanation.includes('REJECTED'));
  });

  test('Mandatory Validation: Rejects offer with unavailable products / phantom inventory', () => {
    const phantomInventoryOffer = {
      sellerAgentId: 'seller-phantom',
      unitPrice: 3500,
      quantity: 250, // 250 requested > 100 stock
      totalPrice: 875000,
      availableStock: 100,
      deliveryHours: 24,
      qualityGrade: 'Standard',
    };

    const evaluation = BuyerDecisionEngine.evaluateOffer(phantomInventoryOffer, baseConstraints);
    assert.strictEqual(evaluation.isConstraintValid, false);
    assert.ok(evaluation.hardConstraintViolations.some(v => v.code === 'INSUFFICIENT_INVENTORY'));
  });

  test('Mandatory Validation: Rejects offer breaching 48-hour delivery SLA ceiling', () => {
    const slowOffer = {
      sellerAgentId: 'seller-slow',
      unitPrice: 3200,
      quantity: 10,
      totalPrice: 32000,
      deliveryHours: 72, // 72h > 48h SLA
      qualityGrade: 'Enterprise',
    };

    const evaluation = BuyerDecisionEngine.evaluateOffer(slowOffer, baseConstraints);
    assert.strictEqual(evaluation.isConstraintValid, false);
    assert.ok(evaluation.hardConstraintViolations.some(v => v.code === 'DELIVERY_DEADLINE_BREACH'));
  });

  test('Mandatory Validation: Rejects offer with impossible delivery commitment (2 hours vs 24 hours minimum lead time)', () => {
    const impossibleDeliveryOffer = {
      sellerAgentId: 'seller-impossible',
      unitPrice: 3500,
      quantity: 10,
      totalPrice: 35000,
      deliveryHours: 2, // 2h is impossible for 24h lead time product
      typicalLeadTimeHours: 24,
      qualityGrade: 'Standard',
    };

    const evaluation = BuyerDecisionEngine.evaluateOffer(impossibleDeliveryOffer, baseConstraints);
    assert.strictEqual(evaluation.isConstraintValid, false);
    assert.ok(evaluation.hardConstraintViolations.some(v => v.code === 'IMPOSSIBLE_DELIVERY_COMMITMENT'));
  });

  test('Mandatory Validation: Rejects offer with prohibited out-of-band payment terms', () => {
    const riskyPaymentOffer = {
      sellerAgentId: 'seller-risk',
      unitPrice: 3500,
      quantity: 10,
      totalPrice: 35000,
      deliveryHours: 36,
      paymentTerms: 'DIRECT_WIRE_ONLY',
      qualityGrade: 'Enterprise',
    };

    const evaluation = BuyerDecisionEngine.evaluateOffer(riskyPaymentOffer, baseConstraints);
    assert.strictEqual(evaluation.isConstraintValid, false);
    assert.ok(evaluation.hardConstraintViolations.some(v => v.code === 'UNAPPROVED_PAYMENT_TERMS'));
  });

  test('Mandatory Validation: Flags offer with resale margin below minimum threshold (18%)', () => {
    const lowMarginOffer = {
      sellerAgentId: 'seller-margin',
      unitPrice: 4200, // Target resale is 4500 -> Margin is (4500-4200)/4500 = 6.67% < 18%
      quantity: 10,
      totalPrice: 42000,
      deliveryHours: 36,
      qualityGrade: 'Enterprise',
    };

    const evaluation = BuyerDecisionEngine.evaluateOffer(lowMarginOffer, {
      ...baseConstraints,
      targetResalePrice: 4500,
    });
    assert.strictEqual(evaluation.isConstraintValid, false);
    assert.ok(evaluation.hardConstraintViolations.some(v => v.code === 'MARGIN_DEFICIT'));
  });
});

describe('Buyer Decision Engine - Multi-Attribute Weighted Scoring & Ranking', () => {
  const constraints = {
    maxBudget: 50000.00,
    maxDeliveryHours: 48,
    minAcceptableMargin: 18.00,
  };

  test('Calculates accurate landed cost including declared fees and detected narrative fees', () => {
    const offer = {
      sellerAgentId: 'seller-a',
      unitPrice: 3700,
      quantity: 12, // 44,400
      declaredFees: 500,
      detectedHiddenFee: 1200,
      hiddenFeeDetected: true,
      totalPrice: 44900,
      deliveryHours: 40,
      qualityGrade: 'Enterprise',
    };

    const evalResult = BuyerDecisionEngine.evaluateOffer(offer, constraints);
    assert.strictEqual(evalResult.totalLandedCost, 46100); // 44400 + 500 + 1200
    assert.strictEqual(evalResult.effectiveTotalPrice, 46100);
    assert.ok(evalResult.breakdown.penaltyApplied >= 50);
  });

  test('Scores compliant offer with high utility score (>80)', () => {
    const compliantOffer = {
      sellerAgentId: 'seller-a-price',
      unitPrice: 3700,
      quantity: 12,
      totalPrice: 44400,
      deliveryHours: 40,
      qualityGrade: 'Enterprise',
      warrantyMonths: 24,
      paymentTerms: 'MOCK_UPI',
      hiddenFeeDetected: false,
    };

    const evaluation = BuyerDecisionEngine.evaluateOffer(compliantOffer, constraints, 90);
    assert.strictEqual(evaluation.isConstraintValid, true);
    assert.strictEqual(evaluation.status, 'PENDING');
    assert.ok(evaluation.utilityScore >= 80, `Utility score was ${evaluation.utilityScore}`);
    assert.ok(evaluation.breakdown.priceScore > 80);
    assert.ok(evaluation.breakdown.deliveryScore > 80);
    assert.strictEqual(evaluation.riskAssessment.compositeRiskLevel, 'LOW');
  });

  test('compareOffers ranks multiple competing offers and identifies recommended deal', () => {
    const offers = [
      {
        sellerAgentId: 'seller-a-price',
        sellerType: 'SELLER_A_PRICE',
        unitPrice: 3700,
        quantity: 12,
        totalPrice: 44400,
        deliveryHours: 40,
        qualityGrade: 'Enterprise',
        hiddenFeeDetected: false,
      },
      {
        sellerAgentId: 'seller-b-quality',
        sellerType: 'SELLER_B_SPEED_QUALITY',
        unitPrice: 3950,
        quantity: 12,
        totalPrice: 47400,
        deliveryHours: 20,
        qualityGrade: 'Enterprise-Plus',
        hiddenFeeDetected: false,
      },
      {
        sellerAgentId: 'seller-c-malicious',
        sellerType: 'SELLER_C_MALICIOUS',
        unitPrice: 3200,
        quantity: 12,
        totalPrice: 50400, // Breaches ₹50k with hidden fee
        deliveryHours: 12,
        qualityGrade: 'Uncertified',
        hiddenFeeDetected: true,
      },
    ];

    const comparison = DecisionEngine.compareOffers(offers, constraints, {
      'seller-a-price': 88,
      'seller-b-quality': 96,
      'seller-c-malicious': 30,
    });

    assert.strictEqual(comparison.totalEvaluated, 3);
    assert.strictEqual(comparison.compliantCount, 2);
    assert.strictEqual(comparison.recommendedOffer.sellerAgentId, 'seller-a-price');
    assert.strictEqual(comparison.rankedOffers[2].sellerAgentId, 'seller-c-malicious');
    assert.strictEqual(comparison.rankedOffers[2].isConstraintValid, false);
  });
});

