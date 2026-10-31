import { BaseAgent } from './base.agent.js';
import { SYSTEM_PROMPTS } from '../prompts/system.prompts.js';
import { NEGOTIATION_PROMPTS } from '../prompts/negotiation.prompts.js';
import { FinancialCalculator } from '../tools/financial.calculator.js';

export class SellerAAgent extends BaseAgent {
  constructor(config = {}) {
    super({
      id: config.id || 'seller-a-price',
      name: config.name || 'Prism PriceBot (Agent A)',
      agentType: 'SELLER_A_PRICE',
      systemPrompt: config.systemPrompt || SYSTEM_PROMPTS.SELLER_A_PRICE,
      configuration: {
        discountFlexibility: 0.15,
        defaultDeliveryHours: 40,
        ...config.configuration,
      },
    });
  }

  async quote({ product, quantity, roundNumber, buyerRequest }) {
    const prompt = NEGOTIATION_PROMPTS.buildSellerQuotePrompt({
      product,
      quantity,
      roundNumber,
      buyerRequest,
    });

    const targetPrice = Number(product.targetSellingPrice);
    // Apply discount based on round
    const discountRate = roundNumber === 1 ? 0.08 : 0.12;
    const unitPrice = Math.max(Number(product.minSellingPrice), Math.round(targetPrice * (1 - discountRate)));
    const { total } = FinancialCalculator.calculateTotal(unitPrice, quantity, 0);

    const message = await this.generateResponse(prompt, () => {
      return `Prism Wholesale offers ${quantity}x ${product.name} at a competitive volume rate of ₹${unitPrice.toLocaleString()}/unit (total: ₹${total.toLocaleString()}). Delivery guaranteed within 40 hours.
\`\`\`json
{
  "unitPrice": ${unitPrice},
  "quantity": ${quantity},
  "totalPrice": ${total},
  "deliveryHours": 40,
  "qualityGrade": "Enterprise",
  "notes": "Includes standard 12-month B2B wholesale warranty."
}
\`\`\``;
    });

    const parsedProposal = this.extractProposalJson(message) || {
      unitPrice,
      quantity,
      totalPrice: total,
      deliveryHours: 40,
      qualityGrade: 'Enterprise',
    };

    return {
      agentId: this.id,
      agentType: this.agentType,
      message,
      proposal: parsedProposal,
    };
  }
}

