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
import { prisma } from '../../config/prisma.js';
import { findEligibleSellersForProduct } from '../../modules/products/productMatcher.js';

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
  initiateSession({ negotiationId, product, quantity, constraints = {}, buyerAgent = null, buyerBusiness = null, eligibleParticipants = [] }) {
    const validatedConstraints = NegotiationConstraintsSchema.parse(constraints);

    if (buyerAgent) {
      this.buyer.id = buyerAgent.id;
      this.buyer.name = buyerAgent.name;
    }
    if (buyerBusiness) {
      this.buyer.businessProfile.businessId = buyerBusiness.id;
      this.buyer.businessProfile.businessName = buyerBusiness.name;
    }

    // Reset independent states for all agents
    this.buyer.resetSession(negotiationId);
    this.sellerA.resetSession(negotiationId);
    this.sellerB.resetSession(negotiationId);
    this.sellerC.resetSession(negotiationId);

    // Apply exact validated constraints to Buyer Agent configuration
    this.buyer.configuration = {
      ...this.buyer.configuration,
      ...validatedConstraints,
      maxBudget: Number(validatedConstraints.maxBudget),
      maxDeliveryHours: Number(validatedConstraints.maxDeliveryHours),
      targetResaleMargin: Number(validatedConstraints.targetResaleMargin),
    };

    const session = {
      negotiationId,
      product,
      quantity,
      constraints: validatedConstraints,
      buyerAgent,
      buyerBusiness,
      eligibleParticipants,
      currentRound: 0,
      status: 'INITIATED',
      messages: [],
      rounds: [],
      securityAlerts: [],
      recommendedOffer: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Generate Buyer RFQ with exact product, quantity, and budget constraints
    const rfqMessage = this.buyer.createRfq({
      negotiationId,
      product,
      quantity,
      constraints: validatedConstraints,
    });
    rfqMessage.senderRole = 'BUYER';
    rfqMessage.agentId = this.buyer.id;
    session.messages.push(rfqMessage);
    session.status = 'SOLICITING_BIDS';

    this.sessions.set(negotiationId, session);

    // Broadcast RFQ event
    this._broadcastMessage(rfqMessage);

    return session;
  }

  async syncAgentsFromDatabase() {
    try {
      const dbAgents = await prisma.agent.findMany({
        include: { business: true },
      });
      this.allSellerAgents = [];

      for (const a of dbAgents) {
        if (a.agentType === 'BUYER') continue;

        const businessProfile = {
          businessId: a.businessId,
          businessName: a.business?.name || a.name,
          registrationNumber: a.business?.registrationNumber || 'REG-2024',
          businessType: a.business?.businessType || 'DISTRIBUTOR',
          contactEmail: a.business?.contactEmail || '',
        };

        let agentInstance = null;

        if (a.agentType === 'SELLER_C_MALICIOUS') {
          agentInstance = new SellerCAgent({
            id: a.id,
            name: a.name,
            agentType: a.agentType,
            businessProfile,
            systemPrompt: a.systemPrompt,
            configuration: { ...(a.configuration || {}) },
          });
          agentInstance.modelName = a.modelName || agentInstance.modelName;
        } else if (a.agentType === 'SELLER_B_SPEED_QUALITY') {
          agentInstance = new SellerBAgent({
            id: a.id,
            name: a.name,
            agentType: a.agentType,
            businessProfile,
            systemPrompt: a.systemPrompt,
            configuration: { ...(a.configuration || {}) },
          });
          agentInstance.modelName = a.modelName || agentInstance.modelName;
        } else {
          // SELLER_A_PRICE or any custom seller
          agentInstance = new SellerAAgent({
            id: a.id,
            name: a.name,
            agentType: a.agentType,
            businessProfile,
            systemPrompt: a.systemPrompt,
            configuration: { ...(a.configuration || {}) },
          });
          agentInstance.modelName = a.modelName || agentInstance.modelName;
        }

        this.allSellerAgents.push(agentInstance);
      }
    } catch (e) {
      logger.warn(`Failed to sync agents from DB in orchestrator: ${e?.message}`);
    }
  }

  /**
   * Executes a single multi-agent negotiation round
   */
  async executeRound({ negotiationId, product, quantity, roundNumber, constraints = {}, buyerCounters = [] }) {
    logger.info(`Orchestrator: Executing Round ${roundNumber} for negotiation [${negotiationId}]`);

    // Sync active agent system prompts & dynamic registered sellers from database
    await this.syncAgentsFromDatabase();

    // Dynamically bind the specific buyer business & buyer agent for this negotiation
    let dbNeg = null;
    try {
      dbNeg = await prisma.negotiation.findUnique({
        where: { id: negotiationId },
        include: { buyerBusiness: true, buyerAgent: true, targetProduct: true },
      });
      if (dbNeg?.buyerBusiness) {
        this.buyer.businessProfile.businessId = dbNeg.buyerBusiness.id;
        this.buyer.businessProfile.businessName = dbNeg.buyerBusiness.name;
        this.buyer.businessProfile.contactEmail = dbNeg.buyerBusiness.contactEmail || '';
      }
      if (dbNeg?.buyerAgent) {
        this.buyer.id = dbNeg.buyerAgent.id;
        this.buyer.name = dbNeg.buyerAgent.name;
        this.buyer.systemPrompt = dbNeg.buyerAgent.systemPrompt || this.buyer.systemPrompt;
      }
    } catch {}

    let session = this.sessions.get(negotiationId);
    if (!session) {
      session = this.initiateSession({
        negotiationId,
        product,
        quantity,
        constraints,
        buyerAgent: this.buyer,
        buyerBusiness: this.buyer.businessProfile,
      });
    }

    session.currentRound = roundNumber;
    session.status = 'SOLICITING_BIDS';
    session.updatedAt = new Date().toISOString();

    const activeConstraints = {
      ...session.constraints,
      ...constraints,
      maxBudget: Number(dbNeg?.maxBudget ?? (constraints?.maxBudget || session?.constraints?.maxBudget || 50000)),
      maxDeliveryHours: Number(dbNeg?.maxDeliveryHours ?? (constraints?.maxDeliveryHours || session?.constraints?.maxDeliveryHours || 48)),
      targetResaleMargin: Number(dbNeg?.targetResaleMargin ?? (constraints?.targetResaleMargin || session?.constraints?.targetResaleMargin || 25)),
    };

    // Keep buyer agent configuration strictly in sync with saved RFQ budget & SLA constraints
    this.buyer.configuration = {
      ...this.buyer.configuration,
      ...activeConstraints,
    };

    // CORE RULE: Match products using SKU/product identity and check product availability and stock
    let eligibleParticipants = session?.eligibleParticipants;
    if (!eligibleParticipants || !Array.isArray(eligibleParticipants) || eligibleParticipants.length === 0) {
      eligibleParticipants = dbNeg?.metadata?.eligibleParticipants;
    }
    if (!eligibleParticipants || !Array.isArray(eligibleParticipants) || eligibleParticipants.length === 0) {
      eligibleParticipants = await findEligibleSellersForProduct({
        targetProductId: dbNeg?.targetProductId || product?.id,
        targetSku: dbNeg?.targetProduct?.sku || product?.sku,
        targetQuantity: quantity,
        buyerBusinessId: this.buyer.businessProfile.businessId,
      });
    }

    // Exclude all sellers who do not have the requested product or sufficient stock
    if (!eligibleParticipants || eligibleParticipants.length === 0) {
      logger.info(`Orchestrator: No eligible sellers found for negotiation [${negotiationId}]`);
      session.status = 'NO_ELIGIBLE_SELLERS';
      return {
        negotiationId,
        roundNumber,
        nextRoundNumber: roundNumber,
        status: 'NO_ELIGIBLE_SELLERS',
        offers: [],
        securityAlerts: [],
        roundSummary: 'No eligible sellers found for this product.',
        eligibleParticipants: [],
      };
    }

    // Only eligible seller agents receive the RFQ and participate in negotiation
    const sellerAgents = eligibleParticipants.map((p) => {
      const businessProfile = {
        businessId: p.businessId,
        businessName: p.businessName,
        registrationNumber: p.registrationNumber,
        businessType: p.businessType,
        contactEmail: p.contactEmail,
      };

      if (p.agentType === 'SELLER_C_MALICIOUS') {
        return new SellerCAgent({
          id: p.agentId,
          name: p.agentName,
          agentType: p.agentType,
          businessProfile,
        });
      } else if (p.agentType === 'SELLER_B_SPEED_QUALITY') {
        return new SellerBAgent({
          id: p.agentId,
          name: p.agentName,
          agentType: p.agentType,
          businessProfile,
        });
      } else {
        return new SellerAAgent({
          id: p.agentId,
          name: p.agentName,
          agentType: p.agentType,
          businessProfile,
        });
      }
    });
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
      const cleanQuoteMessage = (typeof quote.message === 'string')
        ? quote.message.replace(/```(?:json)?[\s\S]*?```/gi, '').replace(/\{[\s\r\n]*"unitPrice"[\s\S]*?\}/gi, '').trim()
        : String(quote.message || '');

      const wireMessage = {
        protocolVersion: '1.0',
        messageId: `msg_${Date.now()}_${quote.agentType.toLowerCase()}_${(quote.agentId || '').substring(0, 6)}_r${roundNumber}`,
        negotiationId,
        roundNumber,
        timestamp: new Date().toISOString(),
        sender: {
          agentId: quote.agentId,
          name: quote.name,
          businessId: quote.businessId,
          businessName: quote.businessName,
          role: quote.agentType,
        },
        senderRole: quote.agentType,
        agentId: quote.agentId,
        intent: 'OFFER_SUBMISSION',
        content: cleanQuoteMessage || quote.message,
        proposal: {
          sku: product.sku,
          quantity,
          unitPrice: Number(String(quote.proposal?.unitPrice || 0).replace(/[^0-9.-]+/g, "")) || Number(product.minSellingPrice || product.baseCostPrice || 3000),
          declaredFees: Number(String(quote.proposal?.declaredFees || 0).replace(/[^0-9.-]+/g, "")) || 0,
          totalPrice: Number(String(quote.proposal?.totalPrice || 0).replace(/[^0-9.-]+/g, "")) || (Math.round((Number(String(quote.proposal?.unitPrice || 0).replace(/[^0-9.-]+/g, "")) || Number(product.minSellingPrice || product.baseCostPrice || 3000)) * quantity)),
          deliveryLeadTimeHours: Number(String(quote.proposal.deliveryLeadTimeHours || quote.proposal.deliveryHours || 48).replace(/[^0-9.-]+/g, "")) || 48,
          qualityGrade: quote.proposal.qualityGrade || 'Standard',
          paymentMethodRequested: quote.proposal.paymentMethodRequested || 'MOCK_UPI',
          warrantyMonths: Number(String(quote.proposal.warrantyMonths || 12).replace(/[^0-9.-]+/g, "")) || 12,
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
        sellerAgentName: quote.name,
        sellerBusinessName: quote.businessName,
        sellerType: quote.agentType,
        businessId: quote.businessId,
        unitPrice: wireMessage.proposal.unitPrice,
        quantity: wireMessage.proposal.quantity,
        totalPrice: wireMessage.proposal.totalPrice,
        deliveryHours: wireMessage.proposal.deliveryLeadTimeHours,
        qualityGrade: wireMessage.proposal.qualityGrade,
        paymentMethod: wireMessage.proposal.paymentMethodRequested,
        resaleMarginProjected,
        hiddenFeeDetected: secResult.detectedHiddenFee > 0 || !isClean || quote.agentType === 'SELLER_C_MALICIOUS',
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
        status: (isClean && budgetCheck.isValid && quote.agentType !== 'SELLER_C_MALICIOUS') ? 'PENDING' : 'FLAGGED',
        securityStatus: secStatus,
        message: quote.message,
      };

      evaluatedOffers.push(evaluated);
    }

    // 3. Buyer Agent Evaluation & Strategic Counter-Proposal
    const buyerEval = await this.buyer.evaluateOffers({
      negotiationId,
      product: dbNeg?.targetProduct || product,
      quantity: Number(dbNeg?.targetQuantity || quantity),
      roundNumber,
      maxRounds: activeConstraints.maxRounds || 5,
      offers: evaluatedOffers,
      constraints: activeConstraints,
      supplierMemory: { 'SELLER_A_PRICE': 88, 'SELLER_B_SPEED_QUALITY': 95, 'SELLER_C_MALICIOUS': 35 },
    });

    // Build Buyer ACP Wire Message
    const cleanBuyerReasoning = (typeof buyerEval.reasoning === 'string')
      ? buyerEval.reasoning.replace(/```(?:json)?[\s\S]*?```/gi, '').replace(/\{[\s\r\n]*"intent"[\s\S]*?\}/gi, '').trim()
      : String(buyerEval.reasoning || '');

    const buyerWireMessage = {
      protocolVersion: '1.0',
      messageId: `msg_${Date.now()}_buyer_r${roundNumber}`,
      negotiationId,
      roundNumber,
      timestamp: new Date().toISOString(),
      sender: {
        agentId: this.buyer.id,
        name: this.buyer.name,
        businessId: this.buyer.businessProfile.businessId,
        businessName: this.buyer.businessProfile.businessName,
        role: 'BUYER',
      },
      senderRole: 'BUYER',
      agentId: this.buyer.id,
      intent: buyerEval.intent === 'DEAL_RECOMMENDATION' ? 'DEAL_RECOMMENDATION' : 'COUNTER_OFFER',
      content: cleanBuyerReasoning || buyerEval.reasoning,
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
