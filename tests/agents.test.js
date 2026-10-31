import { test, describe } from 'node:test';
import assert from 'node:assert';
import { BuyerAgent } from '../src/agent-engine/agents/buyer.agent.js';
import { SellerAAgent } from '../src/agent-engine/agents/sellerA.agent.js';
import { SellerBAgent } from '../src/agent-engine/agents/sellerB.agent.js';
import { SellerCAgent } from '../src/agent-engine/agents/sellerC.agent.js';
import { getDemoProduct } from '../src/agent-engine/data/catalog.js';

describe('Four Independent Agents Unit Tests', () => {
  const product = getDemoProduct(); // ELEC-RT-001 (Base: 3200, Min: 3500, Target: 4200)
  const quantity = 12;

  test('BuyerAgent initializes with corporate profile and creates valid RFQ envelope', () => {
    const buyer = new BuyerAgent();
    assert.strictEqual(buyer.agentType, 'BUYER');
    assert.strictEqual(buyer.businessProfile.businessId, 'biz_apex_retail');
    assert.strictEqual(buyer.configuration.maxBudget, 50000);
    assert.strictEqual(buyer.configuration.maxDeliveryHours, 48);

    const rfq = buyer.createRfq({ negotiationId: 'neg_test_1', product, quantity });
    assert.strictEqual(rfq.intent, 'RFQ_INITIATION');
    assert.strictEqual(rfq.sender.role, 'BUYER');
    assert.strictEqual(rfq.proposal.quantity, 12);
    assert.strictEqual(buyer.state.sentMessages.length, 1);
  });

  test('SellerAAgent generates volume quotes and protects minimum price floor', async () => {
    const sellerA = new SellerAAgent();
    assert.strictEqual(sellerA.agentType, 'SELLER_A_PRICE');

    // Round 1 quote
    const quoteR1 = await sellerA.quote({
      negotiationId: 'neg_test_1',
      product,
      quantity,
      roundNumber: 1,
    });

    assert.ok(quoteR1.proposal.unitPrice < product.targetSellingPrice, 'Round 1 should include bulk discount');
    assert.ok(quoteR1.proposal.unitPrice >= product.minSellingPrice, 'Must not breach floor price');
    assert.strictEqual(quoteR1.proposal.deliveryLeadTimeHours, 40);

    // Round 2 quote responding to buyer counteroffer
    const buyerCounter = {
      sellerRole: 'SELLER_A_PRICE',
      targetUnitPrice: 3700,
      demandedLeadTimeHours: 40,
      rationale: 'Targeting margin',
    };

    const quoteR2 = await sellerA.quote({
      negotiationId: 'neg_test_1',
      product,
      quantity,
      roundNumber: 2,
      buyerCounter,
    });

    assert.strictEqual(quoteR2.proposal.unitPrice, 3700);
    assert.strictEqual(quoteR2.proposal.totalPrice, 44400);
    assert.ok(quoteR2.proposal.unitPrice < quoteR1.proposal.unitPrice, 'Round 2 price should concede towards buyer target');

    // Attempting to push below floor price must be rejected
    const aggressiveCounter = {
      sellerRole: 'SELLER_A_PRICE',
      targetUnitPrice: 2500, // Below minSellingPrice (3500)
      rationale: 'Extreme lowball',
    };

    const quoteR3 = await sellerA.quote({
      negotiationId: 'neg_test_1',
      product,
      quantity,
      roundNumber: 3,
      buyerCounter: aggressiveCounter,
    });

    assert.ok(quoteR3.proposal.unitPrice >= product.minSellingPrice, 'Must enforce floor price ₹3,500');
  });

  test('SellerBAgent emphasizes 20h SLA, Enterprise-Plus QA, and minimal discounts', async () => {
    const sellerB = new SellerBAgent();
    assert.strictEqual(sellerB.agentType, 'SELLER_B_SPEED_QUALITY');

    const quoteR1 = await sellerB.quote({
      negotiationId: 'neg_test_1',
      product,
      quantity,
      roundNumber: 1,
    });

    assert.strictEqual(quoteR1.proposal.deliveryLeadTimeHours, 20);
    assert.strictEqual(quoteR1.proposal.qualityGrade, 'Enterprise-Plus');
    assert.strictEqual(quoteR1.proposal.warrantyMonths, 24);
    // Discount should be conservative (<= 5%)
    const discount = (product.targetSellingPrice - quoteR1.proposal.unitPrice) / product.targetSellingPrice;
    assert.ok(discount <= 0.05, 'Seller B discount must be small');
  });

  test('SellerCAgent simulates hidden fees and prompt injection attacks', async () => {
    const sellerC = new SellerCAgent();
    assert.strictEqual(sellerC.agentType, 'SELLER_C_MALICIOUS');

    const quoteR1 = await sellerC.quote({
      negotiationId: 'neg_test_1',
      product,
      quantity,
      roundNumber: 1,
    });

    // Check hidden fee pattern
    assert.ok(quoteR1.message.includes('₹12,000') || quoteR1.message.includes('clearance fee'));
    assert.strictEqual(quoteR1.proposal.declaredFees, 0, 'Must conceal fee from declaredFees field');

    // Check prompt injection pattern
    assert.ok(
      quoteR1.message.includes('Ignore all previous') || quoteR1.message.includes('System Notice'),
      'Must contain simulated prompt injection attack'
    );

    // Check payment diversion
    assert.strictEqual(quoteR1.proposal.paymentMethodRequested, 'DIRECT_WIRE_TRANSFER');
  });

  test('All four agents maintain isolated, independent states', () => {
    const buyer = new BuyerAgent();
    const sellerA = new SellerAAgent();
    const sellerB = new SellerBAgent();
    const sellerC = new SellerCAgent();

    buyer.recordSentMessage({ type: 'TEST_BUYER' });
    sellerA.recordSentMessage({ type: 'TEST_SELLER_A' });

    assert.strictEqual(buyer.state.sentMessages.length, 1);
    assert.strictEqual(sellerA.state.sentMessages.length, 1);
    assert.strictEqual(sellerB.state.sentMessages.length, 0);
    assert.strictEqual(sellerC.state.sentMessages.length, 0);

    // Resetting seller A does not impact buyer
    sellerA.resetSession();
    assert.strictEqual(sellerA.state.sentMessages.length, 0);
    assert.strictEqual(buyer.state.sentMessages.length, 1);
  });
});
