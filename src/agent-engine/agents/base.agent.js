import { geminiClient } from '../../config/gemini.js';
import { logger } from '../../utils/logger.js';

export class BaseAgent {
  constructor({ id, name, agentType, systemPrompt, configuration = {} }) {
    this.id = id;
    this.name = name;
    this.agentType = agentType;
    this.systemPrompt = systemPrompt;
    this.configuration = configuration;
    this.modelName = configuration.modelName || 'gemini-2.0-flash';
  }

  /**
   * Generates AI reasoning or falls back to strategy simulation
   */
  async generateResponse(userPrompt, fallbackGenerator) {
    if (geminiClient) {
      try {
        const response = await geminiClient.models.generateContent({
          model: this.modelName,
          contents: [
            { role: 'user', parts: [{ text: `${this.systemPrompt}\n\nTask:\n${userPrompt}` }] },
          ],
        });

        const text = response?.text ? response.text.trim() : null;
        if (text) return text;
      } catch (err) {
        logger.warn(`Gemini generation error for agent [${this.name}]: ${err.message}. Invoking strategy fallback.`);
      }
    }

    // High-fidelity deterministic fallback simulation
    return fallbackGenerator();
  }

  /**
   * Helper to extract JSON proposal blocks from LLM markdown output
   */
  extractProposalJson(text) {
    try {
      const match = text.match(/```json([\s\S]*?)```/) || text.match(/{[\s\S]*?}/);
      if (match) {
        const rawJson = match[1] || match[0];
        return JSON.parse(rawJson.trim());
      }
    } catch (e) {
      logger.debug(`Failed to extract structured JSON from agent message: ${e.message}`);
    }
    return null;
  }
}

