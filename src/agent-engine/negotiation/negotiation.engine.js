import { AgentOrchestrator } from '../orchestrator/agent.orchestrator.js';
import { RoundManager } from './round.manager.js';
import { logger } from '../../utils/logger.js';

/**
 * Negotiation Engine
 * Manages full multi-round negotiation lifecycle, convergence, and terminal states.
 */
export class NegotiationEngine {
  constructor(socketIo = null) {
    this.orchestrator = new AgentOrchestrator(socketIo);
  }

  setSocketIo(io) {
    this.orchestrator.setSocketIo(io);
  }

  /**
   * Starts a new negotiation session
   */
  startNegotiation({ negotiationId, product, quantity, constraints = {} }) {
    logger.info(`NegotiationEngine: Starting new negotiation session [${negotiationId}]`);
    return this.orchestrator.initiateSession({
      negotiationId,
      product,
      quantity,
      constraints,
    });
  }

  /**
   * Advances the negotiation by one round
   */
  async advanceRound({ negotiationId, product, quantity, currentRound = 0, constraints = {} }) {
    const nextRoundNumber = currentRound + 1;
    logger.info(`NegotiationEngine: Advancing negotiation [${negotiationId}] to Round ${nextRoundNumber}`);

    // Retrieve previous buyer counteroffers if any
    const session = this.orchestrator.getSession(negotiationId);
    let previousBuyerCounters = [];
    if (session && session.rounds.length > 0) {
      const lastRound = session.rounds[session.rounds.length - 1];
      previousBuyerCounters = lastRound.buyerEvaluation?.counterOffers || [];
    }

    // Execute multi-agent round via orchestrator
    const roundResult = await this.orchestrator.executeRound({
      negotiationId,
      product,
      quantity,
      roundNumber: nextRoundNumber,
      constraints,
      buyerCounters: previousBuyerCounters,
    });

    // Check convergence criteria via RoundManager
    const convergence = RoundManager.shouldContinueNegotiation(
      nextRoundNumber,
      roundResult.offers,
      {
        maxRounds: constraints.maxRounds || 5,
        targetUtility: constraints.targetUtility || 85.0,
        maxBudget: constraints.maxBudget || 50000,
        maxDeliveryHours: constraints.maxDeliveryHours || 48,
      }
    );

    // Update session status based on convergence
    if (!convergence.continue) {
      if (convergence.reason === 'DEAL_CONVERGENCE_ACHIEVED' || convergence.reason === 'MAX_ROUNDS_REACHED') {
        roundResult.status = 'DEAL_RECOMMENDED';
        roundResult.recommendedOffer = convergence.recommendedOffer;
      } else if (convergence.reason === 'CRITICAL_SECURITY_DEADLOCK') {
        roundResult.status = 'FLAGGED_SECURITY';
      } else {
        roundResult.status = 'FAILED_NO_DEAL';
      }

      if (session) {
        session.status = roundResult.status;
        session.recommendedOffer = roundResult.recommendedOffer;
      }
    }

    return {
      negotiationId,
      roundNumber: nextRoundNumber,
      nextRoundNumber,
      offers: roundResult.offers,
      buyerEvaluation: roundResult.buyerEvaluation,
      recommendedOffer: roundResult.recommendedOffer,
      securityAlerts: roundResult.securityAlerts,
      convergence,
      status: roundResult.status,
    };
  }

  /**
   * Runs an autonomous full negotiation until deal convergence or max rounds
   */
  async runFullNegotiation({ negotiationId, product, quantity, constraints = {}, maxRounds = 3 }) {
    logger.info(`NegotiationEngine: Executing full autonomous negotiation for [${negotiationId}] (Max rounds: ${maxRounds})`);

    const effectiveConstraints = { ...constraints, maxRounds };
    this.startNegotiation({ negotiationId, product, quantity, constraints: effectiveConstraints });

    let currentRound = 0;
    let finalRoundResult = null;
    const allRounds = [];

    while (currentRound < maxRounds) {
      const result = await this.advanceRound({
        negotiationId,
        product,
        quantity,
        currentRound,
        constraints: effectiveConstraints,
      });

      allRounds.push(result);
      finalRoundResult = result;
      currentRound = result.roundNumber;

      if (!result.convergence.continue) {
        logger.info(`NegotiationEngine: Converged at Round ${currentRound}. Reason: ${result.convergence.reason}`);
        break;
      }
    }

    const session = this.orchestrator.getSession(negotiationId);

    return {
      negotiationId,
      totalRoundsExecuted: currentRound,
      status: finalRoundResult.status,
      recommendedOffer: finalRoundResult.recommendedOffer,
      rounds: allRounds,
      securityAlerts: session ? session.securityAlerts : [],
      messagesCount: session ? session.messages.length : 0,
      buyerReasoning: finalRoundResult.buyerEvaluation?.reasoning || '',
    };
  }

  /**
   * Retrieves active session details
   */
  getSession(negotiationId) {
    return this.orchestrator.getSession(negotiationId);
  }

  /**
   * Generates comparative matrix across all competing offers
   */
  getOfferComparison(negotiationId) {
    const session = this.orchestrator.getSession(negotiationId);
    if (!session || session.rounds.length === 0) {
      return null;
    }

    const lastRound = session.rounds[session.rounds.length - 1];
    const constraints = session.constraints;

    return {
      negotiationId,
      currentRound: session.currentRound,
      constraints,
      offers: lastRound.offers.map((o) => ({
        agentId: o.sellerAgentId,
        sellerType: o.sellerType,
        unitPrice: o.unitPrice,
        quantity: o.quantity,
        totalPrice: o.totalPrice,
        deliveryHours: o.deliveryHours,
        qualityGrade: o.qualityGrade,
        utilityScore: o.utilityScore,
        breakdown: o.breakdown,
        hiddenFeeDetected: o.hiddenFeeDetected,
        securityStatus: o.securityStatus,
        status: o.status,
        constraintViolations: o.constraintViolations,
      })),
      recommendedOffer: session.recommendedOffer,
      securityAlertsCount: session.securityAlerts.length,
    };
  }
}
