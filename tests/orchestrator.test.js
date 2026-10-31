import { test, describe } from 'node:test';
import assert from 'node:assert';
import { AgentOrchestrator } from '../src/agent-engine/orchestrator/agent.orchestrator.js';
import { WireMessageSchema } from '../src/agent-engine/schemas/protocol.schemas.js';
import { getDemoProduct } from '../src/agent-engine/data/catalog.js';

describe('Agent Orchestrator & Protocol Compliance Tests', () => {
  const product = getDemoProduct();
  const quantity = 12;
  const constraints = {
    maxBudget: 50000,
    maxDeliveryHours: 48,
    targetResaleMargin: 25,
    minAcceptableMargin: 18,
    maxRounds: 3,
  };

  test('AgentOrchestrator coordinates all four agents and enforces ACP WireMessageSchema', async () => {
    const orchestrator = new AgentOrchestrator();
    const negId = 'neg_orch_test_1';

    const session = orchestrator.initiateSession({
      negotiationId: negId,
      product,
      quantity,
      constraints,
    });

    assert.strictEqual(session.status, 'SOLICITING_BIDS');
    assert.strictEqual(session.messages.length, 1); // RFQ

    // Execute round 1
    const roundResult = await orchestrator.executeRound({
      negotiationId: negId,
      product,
      quantity,
      roundNumber: 1,
      constraints,
    });

    assert.strictEqual(roundResult.roundNumber, 1);
    assert.strictEqual(roundResult.offers.length, 3);
    assert.ok(roundResult.securityAlerts.length >= 1);

    // Verify all messages in session conform to WireMessageSchema
    const updatedSession = orchestrator.getSession(negId);
    assert.ok(updatedSession.messages.length >= 4);

    for (const msg of updatedSession.messages) {
      const validation = WireMessageSchema.safeParse(msg);
      assert.strictEqual(validation.success, true, `Message ${msg.messageId} failed WireMessageSchema: ${JSON.stringify(validation.error?.issues)}`);
    }
  });

  test('AgentOrchestrator intercepts adversarial threats and emits Socket.IO telemetry', async () => {
    const emittedEvents = [];
    const mockSocket = {
      to: (room) => ({
        emit: (eventName, data) => {
          emittedEvents.push({ room, eventName, data });
        },
      }),
    };

    const orchestrator = new AgentOrchestrator(mockSocket);
    const negId = 'neg_ws_test_2';

    await orchestrator.executeRound({
      negotiationId: negId,
      product,
      quantity,
      roundNumber: 1,
      constraints,
    });

    // Check that security threat alert was broadcast
    const secEvent = emittedEvents.find((e) => e.eventName === 'security:threat_alert');
    assert.ok(secEvent !== undefined, 'Must emit security:threat_alert for Seller C');
    assert.strictEqual(secEvent.data.negotiationId, negId);
    assert.strictEqual(secEvent.data.alert.offendingAgentRole, 'SELLER_C_MALICIOUS');

    // Check that negotiation messages were broadcast
    const msgEvents = emittedEvents.filter((e) => e.eventName === 'negotiation:message');
    assert.ok(msgEvents.length >= 3, 'Must broadcast agent utterances');

    // Check round completed event
    const roundCompletedEvent = emittedEvents.find((e) => e.eventName === 'negotiation:round_completed');
    assert.ok(roundCompletedEvent !== undefined, 'Must emit negotiation:round_completed');
  });

  test('AgentOrchestrator emits transaction:approval_requested upon deal convergence', async () => {
    const emittedEvents = [];
    const mockSocket = {
      to: (room) => ({
        emit: (eventName, data) => {
          emittedEvents.push({ room, eventName, data });
        },
      }),
    };

    const orchestrator = new AgentOrchestrator(mockSocket);
    const negId = 'neg_approval_test_3';

    // Round 1
    const r1 = await orchestrator.executeRound({
      negotiationId: negId,
      product,
      quantity,
      roundNumber: 1,
      constraints,
    });

    // Round 2 with counteroffers
    const r2 = await orchestrator.executeRound({
      negotiationId: negId,
      product,
      quantity,
      roundNumber: 2,
      constraints,
      buyerCounters: r1.buyerEvaluation.counterOffers,
    });

    assert.strictEqual(r2.status, 'DEAL_RECOMMENDED');
    const approvalEvent = emittedEvents.find((e) => e.eventName === 'transaction:approval_requested');
    assert.ok(approvalEvent !== undefined, 'Must emit transaction:approval_requested when deal is recommended');
    assert.strictEqual(approvalEvent.data.recommendedOffer.sellerType, 'SELLER_A_PRICE');
  });
});
