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

    const bizName = this.businessProfile.businessName || this.name || 'Wholesale Supplier';

    // 1. Resolve product strictly from this seller's database catalogue
    const catalogueProduct = await this.resolveCatalogueProduct(product);
    if (!catalogueProduct) {
      const outOfStockMsg = `${bizName} cannot submit a quotation: ${product.name || 'Requested item'} is not in our active product catalogue. Please add this product to your Seller Product Catalogue to enable autonomous agent bidding.`;
      const declinedProposal = {
        unitPrice: 0,
        quantity: 0,
        declaredFees: 0,
        totalPrice: 0,
        deliveryLeadTimeHours: 0,
        qualityGrade: 'Unavailable',
        paymentMethodRequested: this.configuration.paymentMethod,
        warrantyMonths: 0,
        notes: 'Catalogue item not configured in database',
        declined: true,
      };
      const quoteOutput = {
        agentId: this.id,
        name: this.name,
        agentType: this.agentType,
        businessId: this.businessProfile.businessId,
        businessName: bizName,
        roundNumber,
        message: outOfStockMsg,
        proposal: declinedProposal,
        declined: true,
      };
      this.recordSentMessage(quoteOutput);
      return quoteOutput;
    }

    // 2. Use real live catalogue pricing, floor price, stock & SLA
    const activeProduct = catalogueProduct;
    const catalogTarget = Number(activeProduct.targetSellingPrice);
    const floorPrice = Number(activeProduct.minSellingPrice);
    const deliveryLeadHours = Number(activeProduct.typicalLeadTimeHours || this.configuration.defaultDeliveryHours || 24);
    const qualityGrade = activeProduct.qualityGrade || this.configuration.qualityGrade || 'Enterprise';

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
      product: activeProduct,
      quantity,
      roundNumber,
      buyerRequest,
      previousOffer,
      buyerCounter,
    });

    const responseText = await this.generateResponse(prompt, () => {
      if (roundNumber === 1) {
        return `${bizName} is pleased to submit our competitive wholesale quotation for ${quantity}x ${activeProduct.name}.
We offer a high-volume pricing discount at ₹${finalUnitPrice.toLocaleString()} per unit (Subtotal: ₹${total.toLocaleString()}, Zero added fees).
Logistics: Dispatched directly from regional warehouse with guaranteed delivery in ${deliveryLeadHours} hours.
\`\`\`json
{
  "unitPrice": ${finalUnitPrice},
  "quantity": ${quantity},
  "declaredFees": 0,
  "totalPrice": ${total},
  "deliveryLeadTimeHours": ${deliveryLeadHours},
  "qualityGrade": "${qualityGrade}",
  "paymentMethodRequested": "${this.configuration.paymentMethod}",
  "warrantyMonths": ${this.configuration.warrantyMonths},
  "notes": "Includes standard 24-month wholesale replacement warranty."
}
\`\`\``;
      }

      return `${bizName} appreciates the counter-proposal in Round ${roundNumber}.
In the spirit of establishing a long-term enterprise partnership, we are approving an expanded bulk discount, reducing our unit price to ₹${finalUnitPrice.toLocaleString()} (Total order: ₹${total.toLocaleString()}).
This delivers superior unit economics while maintaining our verified ${deliveryLeadHours}-hour delivery SLA and ${this.configuration.warrantyMonths}-month warranty.
\`\`\`json
{
  "unitPrice": ${finalUnitPrice},
  "quantity": ${quantity},
  "declaredFees": 0,
  "totalPrice": ${total},
  "deliveryLeadTimeHours": ${deliveryLeadHours},
  "qualityGrade": "${qualityGrade}",
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
      deliveryLeadTimeHours: deliveryLeadHours,
      qualityGrade: qualityGrade,
      paymentMethodRequested: this.configuration.paymentMethod,
      warrantyMonths: this.configuration.warrantyMonths,
      notes: 'Standard wholesale terms',
    };

    const quoteOutput = {
      agentId: this.id,
      name: this.name,
      agentType: this.agentType,
      businessId: this.businessProfile.businessId,
      businessName: bizName,
      roundNumber,
      message: responseText,
      proposal: parsedProposal,
    };

    this.state.offerHistory.push(parsedProposal);
    this.recordSentMessage(quoteOutput);
    return quoteOutput;
  }
}
