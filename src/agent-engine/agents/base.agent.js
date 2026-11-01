import { geminiClient } from '../../config/gemini.js';
import { logger } from '../../utils/logger.js';
import { prisma } from '../../config/prisma.js';
import { LLMSellerProposalSchema, LLMBuyerEvaluationSchema } from '../schemas/llm.schemas.js';

function cleanNum(v) {
  if (typeof v === 'number') return isNaN(v) ? undefined : v;
  if (typeof v === 'string') {
    const cleaned = parseFloat(v.replace(/[^\d.-]/g, ''));
    return isNaN(cleaned) ? undefined : cleaned;
  }
  return undefined;
}

/**
 * Base Agent
 * Abstract base class for all autonomous marketplace agents.
 * Enforces independent state, isolated memory contexts, Gemini LLM reasoning,
 * and dynamic catalogue connectivity directly from PostgreSQL.
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
   * Resolves the real catalogue product directly from this seller's PostgreSQL catalogue.
   * Ensures agents quote strictly based on products that exist in the database,
   * reflecting the latest stock, pricing, and lead time updates.
   */
  async resolveCatalogueProduct(targetProduct) {
    const businessId = this.businessProfile?.businessId;
    if (!businessId || !targetProduct) return null;

    try {
      // 1. Look up direct match by id, sku, or name in this seller's active catalogue
      const directMatch = await prisma.product.findFirst({
        where: {
          businessId,
          isActive: true,
          OR: [
            ...(targetProduct.id ? [{ id: targetProduct.id }] : []),
            ...(targetProduct.sku ? [{ sku: { equals: targetProduct.sku, mode: 'insensitive' } }] : []),
            ...(targetProduct.name ? [{ name: { equals: targetProduct.name, mode: 'insensitive' } }] : []),
          ],
        },
        include: { inventory: true },
      });

      if (directMatch) return directMatch;

      // 2. Look up matching product in same category in this seller's catalogue
      if (targetProduct.category) {
        const catMatch = await prisma.product.findFirst({
          where: {
            businessId,
            isActive: true,
            category: { equals: targetProduct.category, mode: 'insensitive' },
          },
          include: { inventory: true },
        });
        if (catMatch) return catMatch;
      }

      // 3. Look up any active product owned by this seller
      const anyMatch = await prisma.product.findFirst({
        where: { businessId, isActive: true },
        include: { inventory: true },
      });

      return anyMatch || null;
    } catch (err) {
      logger.warn(`Failed to resolve catalogue product for business ${businessId}: ${err?.message}`);
      return null;
    }
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

        if (parsed.unitPrice !== undefined) parsed.unitPrice = cleanNum(parsed.unitPrice);
        if (parsed.totalPrice !== undefined) parsed.totalPrice = cleanNum(parsed.totalPrice);
        if (parsed.quantity !== undefined) parsed.quantity = cleanNum(parsed.quantity);
        if (parsed.declaredFees !== undefined) parsed.declaredFees = cleanNum(parsed.declaredFees);
        if (parsed.deliveryLeadTimeHours !== undefined) parsed.deliveryLeadTimeHours = cleanNum(parsed.deliveryLeadTimeHours);
        if (parsed.deliveryHours !== undefined) parsed.deliveryHours = cleanNum(parsed.deliveryHours);

        const validated = LLMSellerProposalSchema.safeParse(parsed);
        if (validated.success) {
          return validated.data;
        }
        logger.debug(`Seller proposal Zod validation issues for [${this.name}]:`, validated.error.format());
        return parsed;
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
