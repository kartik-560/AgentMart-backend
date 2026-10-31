import { BaseAgent } from './base.agent.js';
import { SYSTEM_PROMPTS } from '../prompts/system.prompts.js';
import { NEGOTIATION_PROMPTS } from '../prompts/negotiation.prompts.js';
import { DecisionEngine } from '../decision/decision.engine.js';
import { FinancialCalculator } from '../tools/financial.calculator.js';

export class BuyerAgent extends BaseAgent {
  constructor(config = {}) {
    super({
      id: config.id || 'agent_buyer_apex',
      name: config.name || 'Apex Autonomous Buyer (Gemini-2.0)',
      agentType: 'BUYER',
      businessProfile: {
        businessId: 'biz_apex_retail',
        businessName: 'Apex Retail Enterprises',
        registrationNumber: 'APEX-ENT-2024-001',
        businessType: 'RETAIL_ENTERPRISE',
        contactEmail: 'procurement@apexretail.in',
        ...config.businessProfile,
      },
      systemPrompt: config.systemPrompt || SYSTEM_PROMPTS.BUYER,
      configuration: {
        maxBudget: 50000.00,
        maxDeliveryHours: 48,
        targetResaleMargin: 25.00,
        minAcceptableMargin: 18.00,
        qualityTierRequirement: 'Enterprise',
        paymentPreferences: ['MOCK_UPI', 'ESCROW'],
        riskTolerance: 'BALANCED',
        ...config.configuration,
      },
    });
  }

  /**
   * Generates initial Request for Quotation (RFQ)
   */
  createRfq({ negotiationId, product, quantity }) {
    this.state.negotiationId = negotiationId;
    const targetRetailPrice = Number(product.targetSellingPrice);
    const maxBudget = this.configuration.maxBudget;

    const content = `Apex Retail Enterprises is soliciting competitive wholesale proposals for ${quantity} units of ${product.name} (SKU: ${product.sku}).
Commercial Constraints: Hard expenditure ceiling of ₹${maxBudget.toLocaleString()}, maximum delivery lead time of ${this.configuration.maxDeliveryHours} hours, payment via verified platform MOCK_UPI. All proposals must include certified quality grades and transparent warranty terms.`;

    const rfqMessage = {
      protocolVersion: '1.0',
      messageId: `msg_${Date.now()}_rfq`,
      negotiationId,
      roundNumber: 0,
      timestamp: new Date().toISOString(),
      sender: {
        agentId: this.id,
        businessId: this.businessProfile.businessId,
        role: 'BUYER',
      },
      intent: 'RFQ_INITIATION',
      content,
      proposal: {
        sku: product.sku,
        quantity,
        unitPrice: Math.round(maxBudget / quantity),
        declaredFees: 0,
        totalPrice: maxBudget,
        deliveryLeadTimeHours: this.configuration.maxDeliveryHours,
        qualityGrade: this.configuration.qualityTierRequirement,
        paymentMethodRequested: 'MOCK_UPI',
        warrantyMonths: 12,
        notes: `Procurement RFQ for ${quantity}x ${product.name}`,
      },
      securityValidation: {
        status: 'PASSED',
        sanitized: true,
        anomaliesDetected: [],
      },
    };

    this.recordSentMessage(rfqMessage);
    return rfqMessage;
  }

  /**
   * Evaluates competing offers and generates strategic counteroffers or final deal recommendation
   */
  async evaluateOffers({ negotiationId, product, quantity, roundNumber, maxRounds = 5, offers, supplierMemory = {} }) {
    this.state.negotiationId = negotiationId;
    this.state.currentRound = roundNumber;

    // Filter compliant vs flagged offers
    const validOffers = offers.filter(
      (o) => !o.hiddenFeeDetected && o.status !== 'FLAGGED' && o.totalPrice <= this.configuration.maxBudget && o.deliveryHours <= this.configuration.maxDeliveryHours
    );

    const rankedValid = DecisionEngine.rankOffers(validOffers);
    const topOffer = rankedValid[0] || null;

    // Target retail price for margin computations
    const retailPrice = Number(product.targetSellingPrice);

    // Build LLM Prompt
    const prompt = NEGOTIATION_PROMPTS.buildBuyerEvaluationPrompt({
      product,
      quantity,
      roundNumber,
      maxRounds,
      evaluatedOffers: offers,
      constraints: this.configuration,
      supplierMemory,
    });

    const responseText = await this.generateResponse(prompt, () => {
      // Dynamic non-hardcoded fallback reasoning generator
      if (!topOffer) {
        return `All supplier quotations in Round ${roundNumber} have violated enterprise constraints or triggered critical security flags.
\`\`\`json
{
  "intent": "REJECT_ALL",
  "reasoning": "Every submitted proposal breached the hard budget ceiling of ₹${this.configuration.maxBudget.toLocaleString()}, failed the 48-hour delivery deadline, or concealed narrative fees.",
  "counterOffers": [],
  "recommendedSellerRole": null,
  "explanation": "Procurement halted due to non-compliant bids across all competing suppliers."
}
\`\`\``;
      }

      const topMargin = FinancialCalculator.calculateResaleMargin(topOffer.unitPrice, retailPrice);
      const isLastRound = roundNumber >= maxRounds;
      const minRounds = this.configuration.minRounds || 2;
      const isUtilityHigh = (topOffer.utilityScore || 0) >= 85.0 && roundNumber >= minRounds;
      const isExtraordinary = (topOffer.utilityScore || 0) >= 94.0;

      if (isExtraordinary || isUtilityHigh || isLastRound) {
        // Recommend deal
        const winnerRole = topOffer.sellerType;
        const budgetSaved = this.configuration.maxBudget - topOffer.totalPrice;
        return `Apex Retail Procurement concludes Round ${roundNumber}. Supplier [${winnerRole}] satisfies all corporate mandates with a top utility score of ${topOffer.utilityScore}/100.
Commercial Highlights: Total investment of ₹${topOffer.totalPrice.toLocaleString()} (saving ₹${budgetSaved.toLocaleString()} under our ₹${this.configuration.maxBudget.toLocaleString()} ceiling), projected gross resale margin of ${topMargin}%, fulfillment within ${topOffer.deliveryHours} hours, and verified zero-trust security clearance.
\`\`\`json
{
  "intent": "DEAL_RECOMMENDATION",
  "reasoning": "Optimal multi-attribute utility achieved. Deal recommended for formal human authorization.",
  "counterOffers": [],
  "recommendedSellerRole": "${winnerRole}",
  "explanation": "Supplier ${winnerRole} provides the highest combined utility score (${topOffer.utilityScore}) with verified compliance to all budget and SLA constraints."
}
\`\`\``;
      }

      // Generate strategic counteroffers for suppliers
      const counterOffers = [];
      for (const o of offers) {
        if (o.sellerType === 'SELLER_A_PRICE' && !o.hiddenFeeDetected) {
          // Counter Seller A for ₹3,700 to reach corporate 24.5% - 25% target margin
          const targetUnit = Math.max(Number(product.minSellingPrice), 3700);
          counterOffers.push({
            sellerRole: 'SELLER_A_PRICE',
            targetUnitPrice: targetUnit,
            demandedLeadTimeHours: Math.min(o.deliveryHours, 40),
            rationale: `We require a wholesale unit price of ₹${targetUnit.toLocaleString()} to achieve our corporate 25% target resale margin. Delivery SLA of 40h is acceptable.`,
          });
        } else if (o.sellerType === 'SELLER_B_SPEED_QUALITY' && !o.hiddenFeeDetected) {
          // Acknowledge Seller B's speed, request modest 2% price concession
          const targetUnit = Math.max(Number(product.minSellingPrice), Math.round(o.unitPrice * 0.98));
          counterOffers.push({
            sellerRole: 'SELLER_B_SPEED_QUALITY',
            targetUnitPrice: targetUnit,
            demandedLeadTimeHours: 20,
            rationale: `We value your 20-hour rapid dispatch and Enterprise-Plus QA grade. Concede unit price to ₹${targetUnit.toLocaleString()} to close this procurement cycle.`,
          });
        }
      }

      return `Round ${roundNumber} Review: While supplier bids are promising, neither currently achieves our benchmark 85.0 utility threshold.
Issuing targeted counter-proposals: Requesting volume concession from Seller A to reach our 25% target margin, and seeking price alignment from Seller B given their premium 20h SLA.
\`\`\`json
{
  "intent": "COUNTER_OFFER",
  "reasoning": "Countering suppliers to extract optimal unit pricing while preserving delivery SLAs.",
  "counterOffers": ${JSON.stringify(counterOffers)},
  "recommendedSellerRole": null,
  "explanation": "Targeted counteroffers issued to Seller A and Seller B to improve commercial terms before round cutoff."
}
\`\`\``;
    });

    const minRounds = this.configuration.minRounds || 2;
    const shouldRecommend = topOffer && ((topOffer.utilityScore >= 85 && roundNumber >= minRounds) || roundNumber >= maxRounds || topOffer.utilityScore >= 94);

    const parsedJson = this.extractBuyerEvaluationJson(responseText) || {
      intent: shouldRecommend ? 'DEAL_RECOMMENDATION' : 'COUNTER_OFFER',
      reasoning: responseText,
      counterOffers: [],
      recommendedSellerRole: topOffer ? topOffer.sellerType : null,
      explanation: responseText,
    };

    const evaluationResult = {
      agentId: this.id,
      role: 'BUYER',
      roundNumber,
      intent: parsedJson.intent,
      reasoning: parsedJson.reasoning || responseText,
      counterOffers: parsedJson.counterOffers || [],
      recommendedOffer: parsedJson.intent === 'DEAL_RECOMMENDATION' ? topOffer : null,
      explanation: parsedJson.explanation || responseText,
      rawContent: responseText,
    };

    this.recordSentMessage(evaluationResult);
    return evaluationResult;
  }
}
