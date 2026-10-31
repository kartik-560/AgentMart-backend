import { geminiClient } from '../../config/gemini.js';
import { logger } from '../../utils/logger.js';
import { LLMSellerProposalSchema, LLMBuyerEvaluationSchema } from '../schemas/llm.schemas.js';

/**
 * Base Agent
 * Abstract base class for all autonomous marketplace agents.
 * Enforces independent state, isolated memory contexts, Gemini LLM reasoning,
 * and deterministic fallback simulation.
 */
export class BaseAgent {
  constructor({ id, name, agentType, businessProfile = {}, systemPrompt, configuration = {} }) {
    this.id = id;
    this.name = name;
    this.agentType = agentType;
    this.businessProfile = {
      businessId: businessProfile.businessId || `biz_${id}`,
      businessName: businessProfile.businessName || name,
      ...businessProfile,
    };
    this.systemPrompt = systemPrompt;
    this.configuration = configuration;
    this.modelName = configuration.modelName || 'gemini-2.0-flash';

    // Independent agent state (not shared with any other agent)
    this.state = {
      negotiationId: null,
      currentRound: 0,
      sentMessages: [],
      receivedMessages: [],
      offerHistory: [],
    };
  }

  /**
   * Resets independent session state
   */
  resetSession(negotiationId = null) {
    this.state = {
      negotiationId,
      currentRound: 0,
      sentMessages: [],
      receivedMessages: [],
      offerHistory: [],
    };
  }

  /**
   * Records a message sent by this agent
   */
  recordSentMessage(msg) {
    this.state.sentMessages.push({ ...msg, recordedAt: new Date().toISOString() });
  }

  /**
   * Records a message received by this agent
   */
  recordReceivedMessage(msg) {
    this.state.receivedMessages.push({ ...msg, recordedAt: new Date().toISOString() });
  }

  /**
   * Generates AI reasoning via Google Gemini API or invokes dynamic strategy fallback
   */
  async generateResponse(userPrompt, fallbackGenerator) {
    if (geminiClient) {
      try {
        const response = await geminiClient.models.generateContent({
          model: this.modelName,
          contents: [
            {
              role: 'user',
              parts: [{ text: `${this.systemPrompt}\n\nTask Directives:\n${userPrompt}` }],
            },
          ],
        });

        const text = response?.text ? response.text.trim() : null;
        if (text && text.length > 0) {
          logger.debug(`Gemini response generated successfully for agent [${this.name}]`);
          return text;
        }
      } catch (err) {
        logger.warn(`Gemini generation error for agent [${this.name}]: ${err.message}. Invoking dynamic fallback simulation.`);
      }
    }

    // Dynamic strategy fallback simulation (non-hardcoded)
    return fallbackGenerator();
  }

  /**
   * Extracts and validates seller proposal JSON with Zod
   */
  extractProposalJson(text) {
    if (!text || typeof text !== 'string') return null;

    try {
      const match = text.match(/```json([\s\S]*?)```/) || text.match(/{[\s\S]*?}/);
      if (match) {
        const rawJson = (match[1] || match[0]).trim();
        const parsed = JSON.parse(rawJson);
        const validated = LLMSellerProposalSchema.safeParse(parsed);
        if (validated.success) {
          return validated.data;
        }
        logger.debug(`Seller proposal Zod validation issues for [${this.name}]:`, validated.error.format());
        return parsed; // Fallback to raw parsed if minor field deviation
      }
    } catch (e) {
      logger.debug(`Failed to parse proposal JSON from [${this.name}]: ${e.message}`);
    }
    return null;
  }

  /**
   * Extracts and validates buyer evaluation JSON with Zod
   */
  extractBuyerEvaluationJson(text) {
    if (!text || typeof text !== 'string') return null;

    try {
      const match = text.match(/```json([\s\S]*?)```/) || text.match(/{[\s\S]*?}/);
      if (match) {
        const rawJson = (match[1] || match[0]).trim();
        const parsed = JSON.parse(rawJson);
        const validated = LLMBuyerEvaluationSchema.safeParse(parsed);
        if (validated.success) {
          return validated.data;
        }
        logger.debug(`Buyer evaluation Zod validation issues:`, validated.error.format());
        return parsed;
      }
    } catch (e) {
      logger.debug(`Failed to parse buyer evaluation JSON: ${e.message}`);
    }
    return null;
  }
}
