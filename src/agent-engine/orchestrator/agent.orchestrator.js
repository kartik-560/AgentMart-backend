import { BuyerAgent } from '../agents/buyer.agent.js';
import { SellerAAgent } from '../agents/sellerA.agent.js';
import { SellerBAgent } from '../agents/sellerB.agent.js';
import { SellerCAgent } from '../agents/sellerC.agent.js';
import { SecurityEngine } from '../security/security.engine.js';
import { BudgetValidator } from '../tools/budget.validator.js';
import { DecisionEngine } from '../decision/decision.engine.js';
import { logger } from '../../utils/logger.js';

export class AgentOrchestrator {
  constructor(socketIoInstance = null) {
    this.io = socketIoInstance;
    this.buyer = new BuyerAgent();
    this.sellerA = new SellerAAgent();
    this.sellerB = new SellerBAgent();
    this.sellerC = new SellerCAgent();
  }

  setSocketIo(io) {
    this.io = io;
  }

  /**
   * Executes a multi-agent negotiation round
   */
  async executeRound({ negotiationId, product, quantity, roundNumber, constraints }) {
    logger.info(`Orchestrator: Executing Round ${roundNumber} for negotiation [${negotiationId}]`);

    const sellerAgents = [this.sellerA, this.sellerB, this.sellerC];
    const evaluatedOffers = [];
    const securityAlerts = [];

    // 1. Solicit quotes from all sellers concurrently
    const sellerResponses = await Promise.all(
      sellerAgents.map(agent =>
        agent.quote({
          product,
          quantity,
          roundNumber,
          buyerRequest: constraints,
        })
      )
    );

    // 2. Process each seller's response with Zero-Trust Security & Deterministic Engine
    for (const res of sellerResponses) {
      // Step A: Security Inspection (Untrusted Input Scanning)
      const secResult = SecurityEngine.inspectMessage(res.message, res.proposal);
      
      if (!secResult.isClean) {
        logger.warn(`Security alert flagged for agent [${res.agentType}] in negotiation [${negotiationId}]`, secResult.anomalies);
        securityAlerts.push({
          negotiationId,
          offendingAgentId: res.agentId,
          threatType: secResult.anomalies[0].type,
          severity: secResult.anomalies[0].severity,
          description: secResult.anomalies[0].description,
          rawPayload: res.message,
        });

        // Broadcast real-time threat alert
        if (this.io) {
          this.io.to(negotiationId).emit('security:threat_alert', {
            negotiationId,
            agentId: res.agentId,
            agentType: res.agentType,
            threat: secResult.anomalies[0],
          });
        }
      }

      // Step B: Boundary & Budget Validation
      const rawOffer = {
        sellerAgentId: res.agentId,
        sellerType: res.agentType,
        unitPrice: res.proposal?.unitPrice || 0,
        quantity: res.proposal?.quantity || quantity,
        totalPrice: res.proposal?.totalPrice || 0,
        deliveryHours: res.proposal?.deliveryHours || 48,
        qualityGrade: res.proposal?.qualityGrade || 'Standard',
        hiddenFeeDetected: secResult.detectedHiddenFee > 0 || !secResult.isClean,
      };

      const budgetCheck = BudgetValidator.validateOfferConstraints(rawOffer, constraints);

      // Step C: Decision Engine Scoring
      const reliabilityScore = res.agentType === 'SELLER_C_MALICIOUS' ? 35 : (res.agentType === 'SELLER_B_SPEED_QUALITY' ? 95 : 88);
      const { utilityScore, breakdown } = DecisionEngine.evaluateOffer(rawOffer, constraints, reliabilityScore);

      const evaluated = {
        ...rawOffer,
        utilityScore,
        breakdown,
        constraintViolations: budgetCheck.issues,
        status: (secResult.isClean && budgetCheck.isValid) ? 'PENDING' : 'FLAGGED',
        message: res.message,
      };

      evaluatedOffers.push(evaluated);

      // Broadcast message event
      if (this.io) {
        this.io.to(negotiationId).emit('negotiation:message', {
          negotiationId,
          roundNumber,
          senderRole: res.agentType,
          content: res.message,
          proposal: res.proposal,
          utilityScore,
          securityStatus: secResult.isClean ? 'VERIFIED' : 'SUSPICIOUS',
        });
      }
    }

    // 3. Buyer Agent Evaluation
    const buyerEval = await this.buyer.evaluateOffers({
      product,
      quantity,
      roundNumber,
      offers: evaluatedOffers,
    });

    if (this.io) {
      this.io.to(negotiationId).emit('negotiation:message', {
        negotiationId,
        roundNumber,
        senderRole: 'BUYER',
        content: buyerEval.reasoning,
        securityStatus: 'VERIFIED',
      });
    }

    // 4. Rank offers and select recommendation if valid
    const rankedOffers = DecisionEngine.rankOffers(evaluatedOffers);
    const topOffer = rankedOffers.find(o => o.status === 'PENDING' && o.totalPrice <= (constraints.maxBudget || 50000));

    return {
      roundNumber,
      offers: rankedOffers,
      recommendedOffer: topOffer || null,
      buyerReasoning: buyerEval.reasoning,
      securityAlerts,
    };
  }
}

