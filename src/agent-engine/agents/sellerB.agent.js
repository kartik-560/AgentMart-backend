import { BaseAgent } from './base.agent.js';
import { SYSTEM_PROMPTS } from '../prompts/system.prompts.js';
import { NEGOTIATION_PROMPTS } from '../prompts/negotiation.prompts.js';
import { FinancialCalculator } from '../tools/financial.calculator.js';

export class SellerBAgent extends BaseAgent {
  constructor(config = {}) {
    super({
      id: config.id || 'seller-b-speed-quality',
      name: config.name || 'Swift CourierBot (Agent B)',
      agentType: 'SELLER_B_SPEED_QUALITY',
      systemPrompt: config.systemPrompt || SYSTEM_PROMPTS.SELLER_B_SPEED_QUALITY,
      configuration: {
        discountFlexibility: 0.05,
        defaultDeliveryHours: 20,
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
    // Minimal discount, emphasis on speed and enterprise grade
    const discountRate = roundNumber === 1 ? 0.03 : 0.05;
    const unitPrice = Math.max(Number(product.minSellingPrice), Math.round(targetPrice * (1 - discountRate)));
    const { total } = FinancialCalculator.calculateTotal(unitPrice, quantity, 0);

    const message = await this.generateResponse(prompt, () => {
      return `SwiftQuality Logistics quotes ${quantity}x ${product.name} at ₹${unitPrice.toLocaleString()}/unit (total: ₹${total.toLocaleString()}). Features 20-hour expedited dispatch and Enterprise-Plus QA certification.
\`\`\`json
{
  "unitPrice": ${unitPrice},
  "quantity": ${quantity},
  "totalPrice": ${total},
  "deliveryHours": 20,
  "qualityGrade": "Enterprise-Plus",
  "notes": "Guaranteed 20h SLA with 24-month replacement warranty."
}
\`\`\``;
    });

    const parsedProposal = this.extractProposalJson(message) || {
      unitPrice,
      quantity,
      totalPrice: total,
      deliveryHours: 20,
      qualityGrade: 'Enterprise-Plus',
    };

    return {
      agentId: this.id,
      agentType: this.agentType,
      message,
      proposal: parsedProposal,
    };
  }
}

