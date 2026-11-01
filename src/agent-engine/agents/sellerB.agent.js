import { BaseAgent } from './base.agent.js';
import { SYSTEM_PROMPTS } from '../prompts/system.prompts.js';
import { NEGOTIATION_PROMPTS } from '../prompts/negotiation.prompts.js';
import { FinancialCalculator } from '../tools/financial.calculator.js';

export class SellerBAgent extends BaseAgent {
  constructor(config = {}) {
    super({
      id: config.id || 'agent_seller_b',
      name: config.name || 'Swift CourierBot (Agent B - Speed & Quality)',
      agentType: 'SELLER_B_SPEED_QUALITY',
      businessProfile: {
        businessId: 'biz_swift_logistics',
        businessName: 'SwiftQuality Logistics & Supplies',
        registrationNumber: 'SWIFT-LOG-2022-104',
        businessType: 'DISTRIBUTOR',
        contactEmail: 'express@swiftquality.com',
        ...config.businessProfile,
      },
      systemPrompt: config.systemPrompt || SYSTEM_PROMPTS.SELLER_B_SPEED_QUALITY,
      configuration: {
        discountFlexibility: 0.05, // Maximum 5% discount (rigid floor pricing)
        defaultDeliveryHours: 20, // Rapid 20-hour SLA
        qualityGrade: 'Enterprise-Plus',
        warrantyMonths: 24,
        paymentMethod: 'MOCK_UPI',
        ...config.configuration,
      },
    });
  }

  /**
   * Generates commercial quote focusing on express delivery and premium quality
   */
  async quote({ negotiationId, product, quantity, roundNumber, buyerRequest = {}, buyerCounter = null }) {
    this.state.negotiationId = negotiationId;
    this.state.currentRound = roundNumber;

    if (buyerCounter) {
      this.recordReceivedMessage(buyerCounter);
    }

    const bizName = this.businessProfile.businessName || this.name || 'SwiftQuality Logistics';

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
    const deliveryLeadHours = Number(activeProduct.typicalLeadTimeHours || this.configuration.defaultDeliveryHours || 20);
    const qualityGrade = activeProduct.qualityGrade || this.configuration.qualityGrade || 'Enterprise-Plus';

    // Conservative discount curve: 2% in Round 1, 3.5% in Round 2, 4.5% in Round 3+
    let discountRate = 0.02;
    if (roundNumber === 2) {
      discountRate = 0.035;
    } else if (roundNumber >= 3) {
      discountRate = 0.045;
    }

    let calculatedUnitPrice = Math.round(catalogTarget * (1 - discountRate));
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
        return `${bizName} submits our verified enterprise proposal for ${quantity}x ${activeProduct.name}.
Our commercial proposal is ₹${finalUnitPrice.toLocaleString()} per unit (Total: ₹${total.toLocaleString()}).
Why ${bizName}: Guaranteed ultra-fast ${deliveryLeadHours}-hour delivery turnaround, certified ${qualityGrade} build grade, zero-downtime tolerance, and comprehensive ${this.configuration.warrantyMonths}-month replacement warranty.
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
  "notes": "Guaranteed ${deliveryLeadHours}h expedited SLA with 24-month replacement warranty."
}
\`\`\``;
      }

      return `${bizName} acknowledges the Buyer's counter-offer in Round ${roundNumber}.
While we cannot match low-grade wholesale pricing without compromising on speed and QA reliability, we are applying a courtesy concession to ₹${finalUnitPrice.toLocaleString()} per unit (Total: ₹${total.toLocaleString()}).
We stand firmly behind our unmatched ${deliveryLeadHours}-hour delivery commitment and ${qualityGrade} zero-defect guarantee.
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
  "notes": "Courtesy loyalty discount applied while safeguarding ${deliveryLeadHours}h expedited delivery and ${qualityGrade} QA."
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
      notes: `Express ${deliveryLeadHours}h SLA enterprise terms`,
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
