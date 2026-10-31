import { test, describe } from 'node:test';
import assert from 'node:assert';
import { SellerDecisionEngine } from '../src/agent-engine/decision/seller.decision.engine.js';
import { DecisionEngine } from '../src/agent-engine/decision/decision.engine.js';

describe('Seller Decision Engine Tests', () => {
  const productContext = {
    id: 'prod-001',
    sku: 'ELEC-RT-001',
    name: 'Enterprise Wi-Fi 6 Mesh Router',
    baseCostPrice: 3200.00,
    minSellingPrice: 3500.00,
    targetSellingPrice: 4200.00,
    stockQuantity: 120,
    typicalLeadTimeHours: 24,
    logisticsCostPerUnit: 50.00,
    targetGrossMargin: 15.00,
    minGrossMargin: 8.00,
    minOrderQuantity: 5,
  };

  test('Recommends ACCEPT for compliant, profitable buyer request', () => {
    const profitableRfq = {
      buyerBusinessId: 'biz-apex',
      requestedQuantity: 12,
      offeredUnitPrice: 3900.00, // Above floor 3500, yields good margin
      requestedDeliveryHours: 40, // Feasible (>24h)
      requestedPaymentMethod: 'MOCK_UPI',
      buyerPaymentReliability: 90,
      buyerLifetimeVolume: 120000,
      buyerDisputeCount: 0,
    };

    const evaluation = SellerDecisionEngine.evaluateBuyerRequest(profitableRfq, productContext);
    assert.strictEqual(evaluation.recommendedAction, 'ACCEPT');
    assert.ok(evaluation.metrics.expectedGrossProfit > 0);
    assert.ok(evaluation.metrics.expectedGrossMarginPercent > 10);
    assert.strictEqual(evaluation.feasibility.isStockSufficient, true);
    assert.strictEqual(evaluation.feasibility.isDeliveryFeasible, true);
    assert.ok(evaluation.decisionReason.includes('Deal meets commercial criteria'));
  });

  test('Recommends REJECT when requested quantity exceeds available warehouse stock', () => {
    const excessQuantityRfq = {
      requestedQuantity: 500, // Stock is 120
      offeredUnitPrice: 4000.00,
      requestedDeliveryHours: 48,
    };

    const evaluation = SellerDecisionEngine.evaluateBuyerRequest(excessQuantityRfq, productContext);
    assert.strictEqual(evaluation.recommendedAction, 'REJECT');
    assert.strictEqual(evaluation.feasibility.isStockSufficient, false);
    assert.ok(evaluation.rejectionReasons.some(r => r.includes('Insufficient inventory')));
  });

  test('Recommends REJECT when buyer requests physically impossible delivery lead time', () => {
    const impossibleLeadTimeRfq = {
      requestedQuantity: 10,
      offeredUnitPrice: 4100.00,
      requestedDeliveryHours: 4, // 4 hours vs 24 hours minimum lead time
    };

    const evaluation = SellerDecisionEngine.evaluateBuyerRequest(impossibleLeadTimeRfq, productContext);
    assert.strictEqual(evaluation.recommendedAction, 'REJECT');
    assert.ok(evaluation.rejectionReasons.some(r => r.includes('Impossible delivery SLA')));
  });

  test('Recommends REJECT when offered price is severely below floor price (>15% deficit)', () => {
    const predatoryPriceRfq = {
      requestedQuantity: 10,
      offeredUnitPrice: 2800.00, // Floor is 3500, 2800 is 20% below floor
      requestedDeliveryHours: 48,
    };

    const evaluation = SellerDecisionEngine.evaluateBuyerRequest(predatoryPriceRfq, productContext);
    assert.strictEqual(evaluation.recommendedAction, 'REJECT');
    assert.strictEqual(evaluation.metrics.isBelowFloorPrice, true);
    assert.ok(evaluation.rejectionReasons.some(r => r.includes('floor price violation')));
  });

  test('Recommends REJECT when buyer has high payment default risk', () => {
    const riskyBuyerRfq = {
      requestedQuantity: 10,
      offeredUnitPrice: 4000.00,
      requestedDeliveryHours: 48,
      buyerPaymentReliability: 25, // Score < 35
      buyerDisputeCount: 4,
    };

    const evaluation = SellerDecisionEngine.evaluateBuyerRequest(riskyBuyerRfq, productContext);
    assert.strictEqual(evaluation.recommendedAction, 'REJECT');
    assert.ok(evaluation.rejectionReasons.some(r => r.includes('payment default risk')));
  });

  test('Recommends COUNTEROFFER when price is below target but volume justifies counter-proposal', () => {
    const negotiableRfq = {
      requestedQuantity: 15,
      offeredUnitPrice: 3450.00, // Slightly below floor 3500, but 15 units is bulk volume
      requestedDeliveryHours: 20, // Slightly tight vs 24h lead time
      requestedPaymentMethod: 'MOCK_UPI',
      buyerPaymentReliability: 85,
    };

    const evaluation = SellerDecisionEngine.evaluateBuyerRequest(negotiableRfq, productContext);
    assert.strictEqual(evaluation.recommendedAction, 'COUNTEROFFER');
    assert.ok(evaluation.counterofferTerms);
    assert.ok(evaluation.counterofferTerms.proposedUnitPrice >= productContext.minSellingPrice);
    assert.ok(evaluation.counterofferTerms.proposedDeliveryHours >= productContext.typicalLeadTimeHours);
    assert.ok(evaluation.counterofferTerms.expectedGrossProfit > 0);
  });

  test('generateCounteroffer produces protocol-compliant counter proposal payload', () => {
    const rfq = {
      requestedQuantity: 12,
      offeredUnitPrice: 3600.00,
      requestedDeliveryHours: 18,
    };

    const counterProposal = DecisionEngine.generateSellerRecommendation(rfq, productContext);
    assert.strictEqual(counterProposal.action, 'COUNTEROFFER');
    assert.strictEqual(counterProposal.quantity, 12);
    assert.ok(counterProposal.unitPrice >= productContext.minSellingPrice);
    assert.ok(counterProposal.deliveryHours >= productContext.typicalLeadTimeHours);
    assert.strictEqual(counterProposal.totalPrice, counterProposal.unitPrice * 12);
  });
});

