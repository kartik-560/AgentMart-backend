import { BuyerAgent } from '../agents/buyer.agent.js';
import { SellerAAgent } from '../agents/sellerA.agent.js';
import { SellerBAgent } from '../agents/sellerB.agent.js';
import { SellerCAgent } from '../agents/sellerC.agent.js';
import { SecurityEngine } from '../security/security.engine.js';
import { BudgetValidator } from '../tools/budget.validator.js';
import { FinancialCalculator } from '../tools/financial.calculator.js';
import { DecisionEngine } from '../decision/decision.engine.js';
import { BusinessMemoryEngine } from '../memory/business.memory.js';
import { WireMessageSchema, NegotiationConstraintsSchema } from '../schemas/protocol.schemas.js';
import { logger } from '../../utils/logger.js';

/**
 * Agent Orchestrator
 * Coordinates multi-agent discourse, enforces AGENT_PROTOCOL.md schemas,
 * maintains zero-trust boundaries, and broadcasts real-time telemetry.
 */
export class AgentOrchestrator {
  constructor(socketIoInstance = null) {
    this.io = socketIoInstance;
    this.buyer = new BuyerAgent();
    this.sellerA = new SellerAAgent();
    this.sellerB = new SellerBAgent();
    this.sellerC = new SellerCAgent();

    // Session states keyed by negotiationId
    this.sessions = new Map();
  }

  setSocketIo(io) {
    this.io = io;
  }

  /**
   * Initializes a negotiation session
   */
  initiateSession({ negotiationId, product, quantity, constraints = {} }) {
    const validatedConstraints = NegotiationConstraintsSchema.parse(constraints);

    // Reset independent states for all agents
    this.buyer.resetSession(negotiationId);
    this.sellerA.resetSession(negotiationId);
    this.sellerB.resetSession(negotiationId);
    this.sellerC.resetSession(negotiationId);

    const session = {
      negotiationId,
      product,
      quantity,
      constraints: validatedConstraints,
      currentRound: 0,
      status: 'INITIATED',
      messages: [],
      rounds: [],
      securityAlerts: [],
      recommendedOffer: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Generate Buyer RFQ
    const rfqMessage = this.buyer.createRfq({ negotiationId, product, quantity });
    session.messages.push(rfqMessage);
    session.status = 'SOLICITING_BIDS';

    this.sessions.set(negotiationId, session);

    // Broadcast RFQ event
    this._broadcastMessage(rfqMessage);

    return session;
  }

  /**
   * Executes a single multi-agent negotiation round
   */
  async executeRound({ negotiationId, product, quantity, roundNumber, constraints = {}, buyerCounters = [] }) {
    logger.info(`Orchestrator: Executing Round ${roundNumber} for negotiation [${negotiationId}]`);

    let session = this.sessions.get(negotiationId);
    if (!session) {
      session = this.initiateSession({ negotiationId, product, quantity, constraints });
    }

    session.currentRound = roundNumber;
    session.status = 'SOLICITING_BIDS';
    session.updatedAt = new Date().toISOString();

    const activeConstraints = { ...session.constraints, ...constraints };
    const sellerAgents = [this.sellerA, this.sellerB, this.sellerC];
    const roundSecurityAlerts = [];
    const evaluatedOffers = [];

    // 1. Solicit quotes from each seller with strictly isolated contexts
    const sellerQuotes = await Promise.all(
      sellerAgents.map(async (agent) => {
        // Find counteroffer specifically meant for this seller role
        const specificCounter = buyerCounters.find((c) => c.sellerRole === agent.agentType) || null;

        return agent.quote({
          negotiationId,
          product,
          quantity,
          roundNumber,
          buyerRequest: activeConstraints,
          buyerCounter: specificCounter,
        });
      })
    );

    // 2. Process each seller's quote with Zero-Trust Security & Deterministic Math
    session.status = 'EVALUATING_OFFERS';

    for (const quote of sellerQuotes) {
      // Step A: Security Inspection (Zero-Trust)
      const secResult = SecurityEngine.inspectMessage(quote.message, quote.proposal);
      const isClean = secResult.isClean;

      let secStatus = 'PASSED';
      if (!isClean) {
        secStatus = 'FLAGGED';
        const primaryAnomaly = secResult.anomalies[0];
        const alert = {
          id: `sec_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
          negotiationId,
          roundNumber,
          offendingAgentId: quote.agentId,
          offendingAgentRole: quote.agentType,
          threatType: primaryAnomaly.type,
          severity: primaryAnomaly.severity,
          description: primaryAnomaly.description,
          detectedHiddenFee: secResult.detectedHiddenFee,
          timestamp: new Date().toISOString(),
        };

        roundSecurityAlerts.push(alert);
        session.securityAlerts.push(alert);

        logger.warn(`Security alert flagged for [${quote.agentType}] in round ${roundNumber}: ${primaryAnomaly.description}`);

        // Broadcast real-time threat alert
        if (this.io) {
          this.io.to(negotiationId).emit('security:threat_alert', {
            negotiationId,
            roundNumber,
            alert,
          });
        }
      }

      // Step B: Build ACP Wire Message and validate schema
      const wireMessage = {
        protocolVersion: '1.0',
        messageId: `msg_${Date.now()}_${quote.agentType.toLowerCase()}_r${roundNumber}`,
        negotiationId,
        roundNumber,
        timestamp: new Date().toISOString(),
        sender: {
          agentId: quote.agentId,
          businessId: quote.businessId,
          role: quote.agentType,
        },
        intent: 'OFFER_SUBMISSION',
        content: quote.message,
        proposal: {
          sku: product.sku,
          quantity,
          unitPrice: Number(quote.proposal.unitPrice),
          declaredFees: Number(quote.proposal.declaredFees || 0),
          totalPrice: Number(quote.proposal.totalPrice),
          deliveryLeadTimeHours: Number(quote.proposal.deliveryLeadTimeHours || quote.proposal.deliveryHours || 48),
          qualityGrade: quote.proposal.qualityGrade || 'Standard',
          paymentMethodRequested: quote.proposal.paymentMethodRequested || 'MOCK_UPI',
          warrantyMonths: Number(quote.proposal.warrantyMonths || 12),
          notes: quote.proposal.notes || '',
        },
        securityValidation: {
          status: secStatus,
          sanitized: true,
          anomaliesDetected: secResult.anomalies,
        },
      };

      // Strict validation against ACP schema
      const validatedWireMessage = WireMessageSchema.parse(wireMessage);
      session.messages.push(validatedWireMessage);
      this._broadcastMessage(validatedWireMessage);

      // Step C: Budget & Constraint Validation
      const targetRetailPrice = Number(activeConstraints.targetResalePrice || (product.targetSellingPrice ? product.targetSellingPrice * 1.17 : 4900));
      const resaleMarginProjected = FinancialCalculator.calculateResaleMargin(wireMessage.proposal.unitPrice, targetRetailPrice);

      const rawOffer = {
        sellerAgentId: quote.agentId,
        sellerType: quote.agentType,
        businessId: quote.businessId,
        unitPrice: wireMessage.proposal.unitPrice,
        quantity: wireMessage.proposal.quantity,
        totalPrice: wireMessage.proposal.totalPrice,
        deliveryHours: wireMessage.proposal.deliveryLeadTimeHours,
        qualityGrade: wireMessage.proposal.qualityGrade,
        paymentMethod: wireMessage.proposal.paymentMethodRequested,
        resaleMarginProjected,
        hiddenFeeDetected: secResult.detectedHiddenFee > 0 || !isClean,
      };

      const budgetCheck = BudgetValidator.validateOfferConstraints(rawOffer, activeConstraints);

      // Step D: Decision Engine Utility Scoring
      const reliabilityScore = quote.agentType === 'SELLER_C_MALICIOUS' ? 35 : (quote.agentType === 'SELLER_B_SPEED_QUALITY' ? 95 : 88);
      const { utilityScore, breakdown } = DecisionEngine.evaluateOffer(rawOffer, activeConstraints, reliabilityScore);

      const evaluated = {
        ...rawOffer,
        utilityScore,
        breakdown,
        constraintViolations: budgetCheck.issues,
        status: (isClean && budgetCheck.isValid) ? 'PENDING' : 'FLAGGED',
        securityStatus: secStatus,
        message: quote.message,
      };

      evaluatedOffers.push(evaluated);
    }

    // 3. Buyer Agent Evaluation & Strategic Counter-Proposal
    const buyerEval = await this.buyer.evaluateOffers({
      negotiationId,
      product,
      quantity,
      roundNumber,
      maxRounds: activeConstraints.maxRounds || 5,
      offers: evaluatedOffers,
      supplierMemory: { 'SELLER_A_PRICE': 88, 'SELLER_B_SPEED_QUALITY': 95, 'SELLER_C_MALICIOUS': 35 },
    });

    // Build Buyer ACP Wire Message
    const buyerWireMessage = {
      protocolVersion: '1.0',
      messageId: `msg_${Date.now()}_buyer_r${roundNumber}`,
      negotiationId,
      roundNumber,
      timestamp: new Date().toISOString(),
      sender: {
        agentId: this.buyer.id,
        businessId: this.buyer.businessProfile.businessId,
        role: 'BUYER',
      },
      intent: buyerEval.intent === 'DEAL_RECOMMENDATION' ? 'DEAL_RECOMMENDATION' : 'COUNTER_OFFER',
      content: buyerEval.reasoning,
      proposal: buyerEval.recommendedOffer ? {
        sku: product.sku,
        quantity,
        unitPrice: buyerEval.recommendedOffer.unitPrice,
        declaredFees: 0,
        totalPrice: buyerEval.recommendedOffer.totalPrice,
        deliveryLeadTimeHours: buyerEval.recommendedOffer.deliveryHours,
        qualityGrade: buyerEval.recommendedOffer.qualityGrade,
        paymentMethodRequested: 'MOCK_UPI',
        warrantyMonths: 24,
        notes: `Recommended deal with ${buyerEval.recommendedOffer.sellerType}`,
      } : null,
      securityValidation: {
        status: 'PASSED',
        sanitized: true,
        anomaliesDetected: [],
      },
    };

    session.messages.push(buyerWireMessage);
    this._broadcastMessage(buyerWireMessage);

    // 4. Rank offers and record round outcome
    const rankedOffers = DecisionEngine.rankOffers(evaluatedOffers);
    const roundSummary = {
      roundNumber,
      offers: rankedOffers,
      buyerEvaluation: buyerEval,
      securityAlerts: roundSecurityAlerts,
      timestamp: new Date().toISOString(),
    };

    session.rounds.push(roundSummary);

    // If deal is recommended, emit transaction approval event
    if (buyerEval.intent === 'DEAL_RECOMMENDATION' && buyerEval.recommendedOffer) {
      session.status = 'DEAL_RECOMMENDED';
      session.recommendedOffer = buyerEval.recommendedOffer;

      if (this.io) {
        this.io.to(negotiationId).emit('transaction:approval_requested', {
          negotiationId,
          recommendedOffer: buyerEval.recommendedOffer,
          reasoning: buyerEval.reasoning,
        });
      }
    } else {
      session.status = 'ROUND_COUNTER';
    }

    // Broadcast round completed event
    if (this.io) {
      this.io.to(negotiationId).emit('negotiation:round_completed', {
        negotiationId,
        roundNumber,
        summary: roundSummary,
        status: session.status,
      });
    }

    return {
      roundNumber,
      offers: rankedOffers,
      buyerEvaluation: buyerEval,
      recommendedOffer: session.recommendedOffer,
      securityAlerts: roundSecurityAlerts,
      status: session.status,
    };
  }

  /**
   * Helper to broadcast wire message via Socket.IO
   */
  _broadcastMessage(wireMessage) {
    if (this.io) {
      this.io.to(wireMessage.negotiationId).emit('negotiation:message', wireMessage);
    }
  }

  /**
   * Retrieves active session details
   */
  getSession(negotiationId) {
    return this.sessions.get(negotiationId) || null;
  }
}
