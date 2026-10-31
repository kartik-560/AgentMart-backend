import { test, describe } from 'node:test';
import assert from 'node:assert';
import {
  WireMessageSchema,
  AgentProposalSchema,
  AgentSenderSchema,
  NegotiationConstraintsSchema,
} from '../src/agent-engine/schemas/protocol.schemas.js';
import {
  LLMSellerProposalSchema,
  LLMBuyerEvaluationSchema,
} from '../src/agent-engine/schemas/llm.schemas.js';

describe('ACP Protocol & Wire Message Zod Schemas', () => {
  test('WireMessageSchema validates compliant ACP wire message envelope', () => {
    const validMessage = {
      protocolVersion: '1.0',
      messageId: 'msg_test_001',
      negotiationId: 'neg_test_abc',
      roundNumber: 1,
      timestamp: new Date().toISOString(),
      sender: {
        agentId: 'agent_seller_a',
        businessId: 'biz_prism_wholesale',
        role: 'SELLER_A_PRICE',
      },
      intent: 'OFFER_SUBMISSION',
      content: 'We can supply 12 units of Wi-Fi 6 Routers at ₹3,700 per unit.',
      proposal: {
        sku: 'ELEC-RT-001',
        quantity: 12,
        unitPrice: 3700.00,
        declaredFees: 0.00,
        totalPrice: 44400.00,
        deliveryLeadTimeHours: 40,
        qualityGrade: 'Enterprise',
        paymentMethodRequested: 'MOCK_UPI',
        warrantyMonths: 24,
        notes: '24-month warranty included.',
      },
      securityValidation: {
        status: 'PASSED',
        sanitized: true,
        anomaliesDetected: [],
      },
    };

    const parsed = WireMessageSchema.safeParse(validMessage);
    assert.strictEqual(parsed.success, true);
    assert.strictEqual(parsed.data.sender.role, 'SELLER_A_PRICE');
    assert.strictEqual(parsed.data.proposal.totalPrice, 44400);
  });

  test('WireMessageSchema rejects invalid role or negative prices', () => {
    const invalidMessage = {
      protocolVersion: '1.0',
      messageId: 'msg_fail_002',
      negotiationId: 'neg_test_abc',
      roundNumber: 1,
      timestamp: new Date().toISOString(),
      sender: {
        agentId: 'agent_rogue',
        businessId: 'biz_unknown',
        role: 'INVALID_ROLE',
      },
      intent: 'OFFER_SUBMISSION',
      content: 'Invalid offer',
      proposal: {
        sku: 'ELEC-RT-001',
        quantity: -5, // Negative quantity should fail
        unitPrice: -100,
        totalPrice: -500,
        deliveryLeadTimeHours: 0,
      },
    };

    const parsed = WireMessageSchema.safeParse(invalidMessage);
    assert.strictEqual(parsed.success, false);
    assert.ok(parsed.error.issues.length >= 2);
  });

  test('NegotiationConstraintsSchema enforces defaults for budget and delivery ceiling', () => {
    const constraints = NegotiationConstraintsSchema.parse({});
    assert.strictEqual(constraints.maxBudget, 50000);
    assert.strictEqual(constraints.maxDeliveryHours, 48);
    assert.strictEqual(constraints.targetResaleMargin, 25);
    assert.strictEqual(constraints.minAcceptableMargin, 18);
  });
});

describe('LLM Extraction & Validation Zod Schemas', () => {
  test('LLMSellerProposalSchema normalizes deliveryHours into deliveryLeadTimeHours', () => {
    const rawProposal = {
      unitPrice: '3700',
      quantity: '12',
      totalPrice: '44400',
      deliveryHours: '40',
      qualityGrade: 'Enterprise',
    };

    const parsed = LLMSellerProposalSchema.parse(rawProposal);
    assert.strictEqual(parsed.unitPrice, 3700);
    assert.strictEqual(parsed.quantity, 12);
    assert.strictEqual(parsed.deliveryLeadTimeHours, 40);
    assert.strictEqual(parsed.declaredFees, 0);
  });

  test('LLMBuyerEvaluationSchema validates counter-proposals and deal recommendation', () => {
    const rawEval = {
      intent: 'COUNTER_OFFER',
      reasoning: 'Seller A pricing is acceptable but we need margin improvement.',
      counterOffers: [
        {
          sellerRole: 'SELLER_A_PRICE',
          targetUnitPrice: 3700,
          demandedLeadTimeHours: 40,
          rationale: 'Targeting 25% margin.',
        },
      ],
      recommendedSellerRole: null,
      explanation: 'Countering Seller A to optimize wholesale rate.',
    };

    const parsed = LLMBuyerEvaluationSchema.parse(rawEval);
    assert.strictEqual(parsed.intent, 'COUNTER_OFFER');
    assert.strictEqual(parsed.counterOffers.length, 1);
    assert.strictEqual(parsed.counterOffers[0].targetUnitPrice, 3700);
  });
});
