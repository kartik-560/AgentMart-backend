import { test, describe } from 'node:test';
import assert from 'node:assert';
import { NegotiationEngine } from '../src/agent-engine/negotiation/negotiation.engine.js';
import { RoundManager } from '../src/agent-engine/negotiation/round.manager.js';
import { getDemoProduct, CATALOG_SKUS } from '../src/agent-engine/data/catalog.js';

describe('Negotiation Engine & Round Manager Tests', () => {
  const product = getDemoProduct();
  const quantity = 12;
  const constraints = {
    maxBudget: 50000,
    maxDeliveryHours: 48,
    targetResaleMargin: 25,
    minAcceptableMargin: 18,
    maxRounds: 3,
  };

  test('NegotiationEngine initializes session with valid RFQ', () => {
    const engine = new NegotiationEngine();
    const session = engine.startNegotiation({
      negotiationId: 'neg_init_test',
      product,
      quantity,
      constraints,
    });

    assert.strictEqual(session.status, 'SOLICITING_BIDS');
    assert.strictEqual(session.messages.length, 1);
    assert.strictEqual(session.messages[0].intent, 'RFQ_INITIATION');
  });

  test('NegotiationEngine advances rounds and manages multi-round progression', async () => {
    const engine = new NegotiationEngine();
    const negId = 'neg_multi_round_test';

    // Round 1
    const r1 = await engine.advanceRound({
      negotiationId: negId,
      product,
      quantity,
      currentRound: 0,
      constraints,
    });

    assert.strictEqual(r1.roundNumber, 1);
    assert.strictEqual(r1.offers.length, 3);
    assert.strictEqual(r1.securityAlerts.length, 1); // Seller C intercepted
    assert.strictEqual(r1.buyerEvaluation.intent, 'COUNTER_OFFER');

    // Round 2
    const r2 = await engine.advanceRound({
      negotiationId: negId,
      product,
      quantity,
      currentRound: 1,
      constraints,
    });

    assert.strictEqual(r2.roundNumber, 2);
    assert.strictEqual(r2.offers.length, 3);
    assert.strictEqual(r2.status, 'DEAL_RECOMMENDED');
    assert.ok(r2.recommendedOffer !== null);
    assert.strictEqual(r2.recommendedOffer.sellerType, 'SELLER_A_PRICE');
    assert.strictEqual(r2.recommendedOffer.totalPrice, 44400);
  });

  test('NegotiationEngine runFullNegotiation executes end-to-end autonomous flow', async () => {
    const engine = new NegotiationEngine();
    const result = await engine.runFullNegotiation({
      negotiationId: 'neg_full_test',
      product,
      quantity,
      constraints,
      maxRounds: 3,
    });

    assert.strictEqual(result.status, 'DEAL_RECOMMENDED');
    assert.ok(result.totalRoundsExecuted >= 2);
    assert.ok(result.recommendedOffer !== null);
    assert.strictEqual(result.recommendedOffer.sellerType, 'SELLER_A_PRICE');
    assert.strictEqual(result.recommendedOffer.totalPrice, 44400);
    assert.ok(result.securityAlerts.length >= 1);
  });

  test('NegotiationEngine generates complete offer comparison matrix', async () => {
    const engine = new NegotiationEngine();
    const negId = 'neg_comp_test';

    await engine.advanceRound({
      negotiationId: negId,
      product,
      quantity,
      currentRound: 0,
      constraints,
    });

    const comparison = engine.getOfferComparison(negId);
    assert.ok(comparison !== null);
    assert.strictEqual(comparison.offers.length, 3);
    assert.strictEqual(comparison.constraints.maxBudget, 50000);
    const sellerC = comparison.offers.find((o) => o.sellerType === 'SELLER_C_MALICIOUS');
    assert.strictEqual(sellerC.hiddenFeeDetected, true);
    assert.strictEqual(sellerC.status, 'FLAGGED');
  });

  test('RoundManager handles convergence, max rounds cutoff, and security deadlock', () => {
    const compliantOffer = {
      sellerType: 'SELLER_A_PRICE',
      utilityScore: 89.5,
      totalPrice: 44400,
      deliveryHours: 40,
      status: 'PENDING',
      hiddenFeeDetected: false,
    };

    // Round 1 with utility 89.5 should continue because minRounds = 2
    const checkR1 = RoundManager.shouldContinueNegotiation(1, [compliantOffer], { minRounds: 2, targetUtility: 85 });
    assert.strictEqual(checkR1.continue, true);

    // Round 2 with utility 89.5 should converge
    const checkR2 = RoundManager.shouldContinueNegotiation(2, [compliantOffer], { minRounds: 2, targetUtility: 85 });
    assert.strictEqual(checkR2.continue, false);
    assert.strictEqual(checkR2.reason, 'DEAL_CONVERGENCE_ACHIEVED');

    // Max rounds reached with compliant offer
    const maxRoundsCheck = RoundManager.shouldContinueNegotiation(5, [compliantOffer], { maxRounds: 5, targetUtility: 95 });
    assert.strictEqual(maxRoundsCheck.continue, false);
    assert.strictEqual(maxRoundsCheck.reason, 'MAX_ROUNDS_REACHED');

    // Critical security deadlock
    const flaggedOffer = { ...compliantOffer, hiddenFeeDetected: true, status: 'FLAGGED' };
    const deadlockCheck = RoundManager.shouldContinueNegotiation(3, [flaggedOffer], { maxRounds: 5 });
    assert.strictEqual(deadlockCheck.continue, false);
    assert.strictEqual(deadlockCheck.reason, 'CRITICAL_SECURITY_DEADLOCK');
  });
});
