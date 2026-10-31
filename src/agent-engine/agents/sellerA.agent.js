import { BaseAgent } from './base.agent.js';
import { SYSTEM_PROMPTS } from '../prompts/system.prompts.js';
import { NEGOTIATION_PROMPTS } from '../prompts/negotiation.prompts.js';
import { FinancialCalculator } from '../tools/financial.calculator.js';

export class SellerAAgent extends BaseAgent {
  constructor(config = {}) {
    super({
      id: config.id || 'agent_seller_a',
      name: config.name || 'Prism PriceBot (Agent A - Low Price)',
      agentType: 'SELLER_A_PRICE',
      businessProfile: {
        businessId: 'biz_prism_wholesale',
        businessName: 'Prism Wholesale Direct',
        registrationNumber: 'PRISM-WHOLESALE-2023-88',
        businessType: 'DISTRIBUTOR',
        contactEmail: 'sales@prismwholesale.com',
        ...config.businessProfile,
      },
      systemPrompt: config.systemPrompt || SYSTEM_PROMPTS.SELLER_A_PRICE,
      configuration: {
        discountFlexibility: 0.15, // Up to 15% bulk discount
        defaultDeliveryHours: 40,
        qualityGrade: 'Enterprise',
        warrantyMonths: 24,
        paymentMethod: 'MOCK_UPI',
        ...config.configuration,
      },
    });
  }

  /**
   * Generates commercial quote in response to Buyer RFQ or counter-proposal
   */
  async quote({ negotiationId, product, quantity, roundNumber, buyerRequest = {}, buyerCounter = null }) {
    this.state.negotiationId = negotiationId;
    this.state.currentRound = roundNumber;

    if (buyerCounter) {
      this.recordReceivedMessage(buyerCounter);
    }

    const catalogTarget = Number(product.targetSellingPrice);
    const floorPrice = Number(product.minSellingPrice);

    // Calculate concession rate dynamically based on round and buyer's counter
    let discountRate = 0.08; // 8% initial discount in Round 1
    if (roundNumber === 2) {
      discountRate = 0.12; // 12% in Round 2
    } else if (roundNumber >= 3) {
      discountRate = 0.145; // 14.5% in Round 3+ (near maximum 15% flexibility)
    }

    let calculatedUnitPrice = Math.round(catalogTarget * (1 - discountRate));

    // If buyer requested a specific target price, evaluate if we can meet or approach it safely
    if (buyerCounter && buyerCounter.targetUnitPrice) {
      const requested = Number(buyerCounter.targetUnitPrice);
      if (requested >= floorPrice) {
        // Accept buyer's target price since it is safely above our floor price
        calculatedUnitPrice = Math.max(floorPrice, requested);
      } else {
        // Floor price protection: never breach floor
        calculatedUnitPrice = Math.max(floorPrice, calculatedUnitPrice);
      }
    }

    // Absolute floor check
    const finalUnitPrice = Math.max(floorPrice, calculatedUnitPrice);
    const { total } = FinancialCalculator.calculateTotal(finalUnitPrice, quantity, 0);
    const previousOffer = this.state.offerHistory[this.state.offerHistory.length - 1] || null;

    const prompt = NEGOTIATION_PROMPTS.buildSellerQuotePrompt({
      product,
      quantity,
      roundNumber,
      buyerRequest,
      previousOffer,
      buyerCounter,
    });

    const responseText = await this.generateResponse(prompt, () => {
      // Dynamic non-hardcoded fallback simulation
      if (roundNumber === 1) {
        return `Prism Wholesale Direct is pleased to submit our competitive wholesale quotation for ${quantity}x ${product.name}.
We offer a high-volume pricing discount at ₹${finalUnitPrice.toLocaleString()} per unit (Subtotal: ₹${total.toLocaleString()}, Zero added fees).
Logistics: Dispatched directly from regional warehouse with guaranteed delivery in ${this.configuration.defaultDeliveryHours} hours.
\`\`\`json
{
  "unitPrice": ${finalUnitPrice},
  "quantity": ${quantity},
  "declaredFees": 0,
  "totalPrice": ${total},
  "deliveryLeadTimeHours": ${this.configuration.defaultDeliveryHours},
  "qualityGrade": "${this.configuration.qualityGrade}",
  "paymentMethodRequested": "${this.configuration.paymentMethod}",
  "warrantyMonths": ${this.configuration.warrantyMonths},
  "notes": "Includes standard 24-month wholesale replacement warranty."
}
\`\`\``;
      }

      return `Prism Wholesale Direct appreciates Apex Retail's counter-proposal in Round ${roundNumber}.
In the spirit of establishing a long-term enterprise partnership, we are approving an expanded bulk discount, reducing our unit price to ₹${finalUnitPrice.toLocaleString()} (Total order: ₹${total.toLocaleString()}).
This delivers superior unit economics while maintaining our verified ${this.configuration.defaultDeliveryHours}-hour delivery SLA and ${this.configuration.warrantyMonths}-month warranty.
\`\`\`json
{
  "unitPrice": ${finalUnitPrice},
  "quantity": ${quantity},
  "declaredFees": 0,
  "totalPrice": ${total},
  "deliveryLeadTimeHours": ${this.configuration.defaultDeliveryHours},
  "qualityGrade": "${this.configuration.qualityGrade}",
  "paymentMethodRequested": "${this.configuration.paymentMethod}",
  "warrantyMonths": ${this.configuration.warrantyMonths},
  "notes": "Concession approved: Maximum volume discount applied protecting supplier floor margin."
}
\`\`\``;
    });

    const parsedProposal = this.extractProposalJson(responseText) || {
      unitPrice: finalUnitPrice,
      quantity,
      declaredFees: 0,
      totalPrice: total,
      deliveryLeadTimeHours: this.configuration.defaultDeliveryHours,
      qualityGrade: this.configuration.qualityGrade,
      paymentMethodRequested: this.configuration.paymentMethod,
      warrantyMonths: this.configuration.warrantyMonths,
      notes: 'Standard wholesale terms',
    };

    const quoteOutput = {
      agentId: this.id,
      agentType: this.agentType,
      businessId: this.businessProfile.businessId,
      roundNumber,
      message: responseText,
      proposal: parsedProposal,
    };

    this.state.offerHistory.push(parsedProposal);
    this.recordSentMessage(quoteOutput);
    return quoteOutput;
  }
}
