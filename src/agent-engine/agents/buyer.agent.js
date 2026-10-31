import { BaseAgent } from './base.agent.js';
import { SYSTEM_PROMPTS } from '../prompts/system.prompts.js';
import { NEGOTIATION_PROMPTS } from '../prompts/negotiation.prompts.js';

export class BuyerAgent extends BaseAgent {
  constructor(config = {}) {
    super({
      id: config.id || 'buyer-agent-apex',
      name: config.name || 'Apex Autonomous Buyer (Gemini-2.0)',
      agentType: 'BUYER',
      systemPrompt: config.systemPrompt || SYSTEM_PROMPTS.BUYER,
      configuration: {
        maxBudget: 50000,
        maxDeliveryHours: 48,
        targetResaleMargin: 25,
        minAcceptableMargin: 18,
        ...config.configuration,
      },
    });
  }

  async evaluateOffers({ product, quantity, roundNumber, offers }) {
    const prompt = NEGOTIATION_PROMPTS.buildBuyerCounterPrompt({
      product,
      quantity,
      roundNumber,
      competingOffers: offers,
      constraints: this.configuration,
    });

    const response = await this.generateResponse(prompt, () => {
      // Deterministic reasoning fallback
      const validOffers = offers.filter(o => !o.hiddenFeeDetected && o.totalPrice <= this.configuration.maxBudget);
      if (validOffers.length === 0) {
        return `All current supplier bids either breach our hard ₹50,000 budget or have critical security anomalies. Countering with strict demand for compliance.`;
      }
      const best = validOffers[0];
      return `Evaluated ${offers.length} supplier proposals for ${quantity}x ${product.name}. Seller A provides the strongest margin-to-delivery utility. Proposing deal recommendation for Seller A at ₹${best.totalPrice.toLocaleString()}.`;
    });

    return {
      agentId: this.id,
      role: 'BUYER',
      reasoning: response,
    };
  }
}

