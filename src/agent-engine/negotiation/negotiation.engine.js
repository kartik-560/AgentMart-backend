import { AgentOrchestrator } from '../orchestrator/agent.orchestrator.js';
import { RoundManager } from './round.manager.js';
import { logger } from '../../utils/logger.js';

export class NegotiationEngine {
  constructor(socketIo = null) {
    this.orchestrator = new AgentOrchestrator(socketIo);
  }

  setSocketIo(io) {
    this.orchestrator.setSocketIo(io);
  }

  /**
   * Advances the negotiation session by one round
   */
  async advanceRound({ negotiationId, product, quantity, currentRound, constraints }) {
    const nextRoundNumber = currentRound + 1;
    logger.info(`NegotiationEngine: Advancing negotiation ${negotiationId} to Round ${nextRoundNumber}`);

    const result = await this.orchestrator.executeRound({
      negotiationId,
      product,
      quantity,
      roundNumber: nextRoundNumber,
      constraints,
    });

    const convergence = RoundManager.shouldContinueNegotiation(nextRoundNumber, result.offers);

    return {
      ...result,
      nextRoundNumber,
      convergence,
    };
  }
}

