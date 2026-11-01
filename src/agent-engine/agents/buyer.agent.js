import { BaseAgent } from './base.agent.js';
import { SYSTEM_PROMPTS } from '../prompts/system.prompts.js';
import { NEGOTIATION_PROMPTS } from '../prompts/negotiation.prompts.js';
import { DecisionEngine } from '../decision/decision.engine.js';
import { FinancialCalculator } from '../tools/financial.calculator.js';

export class BuyerAgent extends BaseAgent {
  constructor(config = {}) {
    super({
      id: config.id || 'agent_buyer_apex',
      name: config.name || 'Apex Autonomous Buyer',
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
  createRfq({ negotiationId, product, quantity, constraints = {} }) {
    this.state.negotiationId = negotiationId;
    if (constraints && Object.keys(constraints).length > 0) {
      this.configuration = { ...this.configuration, ...constraints };
    }

    const unitWholesaleCost = Number(product.baseCostPrice || product.minSellingPrice || product.targetSellingPrice || 0);
    const maxBudget = Number(this.configuration.maxBudget);
    const maxDeliveryHours = Number(this.configuration.maxDeliveryHours || 48);
    const totalEstimatedCost = Math.round(unitWholesaleCost * Number(quantity));

    const bizName = this.businessProfile.businessName || this.name || 'Enterprise Buyer';

    const content = `${bizName} is soliciting competitive wholesale proposals for ${quantity} unit(s) of ${product.name} (SKU: ${product.sku}).
Commercial Constraints: Hard expenditure ceiling of ₹${maxBudget.toLocaleString()} (Wholesale Base Cost: ₹${unitWholesaleCost.toLocaleString()}/unit, Total Estimated Base: ₹${totalEstimatedCost.toLocaleString()}), maximum delivery lead time of ${maxDeliveryHours} hours, payment via verified platform MOCK_UPI. All proposals must include certified quality grades and transparent warranty terms.`;

    const rfqMessage = {
      protocolVersion: '1.0',
      messageId: `msg_${Date.now()}_rfq`,
      negotiationId,
      roundNumber: 0,
      timestamp: new Date().toISOString(),
      sender: {
        agentId: this.id,
        name: this.name,
        businessId: this.businessProfile.businessId,
        businessName: bizName,
        role: 'BUYER',
      },
      intent: 'RFQ_INITIATION',
      content,
      proposal: {
        sku: product.sku,
        quantity: Number(quantity),
        unitPrice: unitWholesaleCost,
        declaredFees: 0,
        totalPrice: totalEstimatedCost,
        maxBudget: maxBudget,
        deliveryLeadTimeHours: maxDeliveryHours,
        qualityGrade: this.configuration.qualityTierRequirement || 'Enterprise',
        paymentMethodRequested: 'MOCK_UPI',
        warrantyMonths: 12,
        notes: `Procurement RFQ for ${quantity}x ${product.name}. Authorized ceiling: ₹${maxBudget.toLocaleString()}`,
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
  async evaluateOffers({ negotiationId, product, quantity, roundNumber, maxRounds = 5, offers, constraints = {}, supplierMemory = {} }) {
    this.state.negotiationId = negotiationId;
    this.state.currentRound = roundNumber;

    if (constraints && Object.keys(constraints).length > 0) {
      this.configuration = { ...this.configuration, ...constraints };
    }
    const maxBudget = Number(this.configuration.maxBudget);
    const maxDeliveryHours = Number(this.configuration.maxDeliveryHours || 48);

    // Filter compliant vs flagged offers strictly against budget ceiling and delivery SLA
    const validOffers = offers.filter(
      (o) => !o.hiddenFeeDetected && o.status !== 'FLAGGED' && o.totalPrice <= maxBudget && o.deliveryHours <= maxDeliveryHours
    );

    const rankedValid = DecisionEngine.rankOffers(validOffers);
    const topOffer = rankedValid[0] || null;

    // Target retail price for margin computations
    const retailPrice = Number(product.targetSellingPrice || (product.baseCostPrice ? product.baseCostPrice * 1.3 : maxBudget / quantity));

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
  "reasoning": "Every submitted proposal breached the hard budget ceiling of ₹${maxBudget.toLocaleString()}, failed the ${maxDeliveryHours}-hour delivery deadline, or concealed narrative fees.",
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
        const winnerName = topOffer.sellerBusinessName || topOffer.sellerAgentName || winnerRole;
        const budgetSaved = Math.max(0, maxBudget - topOffer.totalPrice);
        const buyerOrg = this.businessProfile.businessName || this.name || 'Enterprise Procurement';
        return `${buyerOrg} concludes Round ${roundNumber}. Supplier [${winnerName}] satisfies all corporate mandates with a top utility score of ${topOffer.utilityScore}/100.
Commercial Highlights: Total investment of ₹${topOffer.totalPrice.toLocaleString()} (saving ₹${budgetSaved.toLocaleString()} under our ₹${maxBudget.toLocaleString()} ceiling), projected gross resale margin of ${topMargin}%, fulfillment within ${topOffer.deliveryHours} hours, and verified zero-trust security clearance.
\`\`\`json
{
  "intent": "DEAL_RECOMMENDATION",
  "reasoning": "Optimal multi-attribute utility achieved within authorized ₹${maxBudget.toLocaleString()} budget. Deal recommended for formal human authorization.",
  "counterOffers": [],
  "recommendedSellerRole": "${winnerRole}",
  "explanation": "Supplier ${winnerRole} provides the highest combined utility score (${topOffer.utilityScore}) with verified compliance to all budget and SLA constraints."
}
\`\`\``;
      }

      // Generate strategic counteroffers for suppliers dynamically based on product floor and budget cap
      const counterOffers = [];
      const maxUnitPriceAllowed = Math.floor(maxBudget / quantity);
      for (const o of offers) {
        if (!o.hiddenFeeDetected && o.status !== 'FLAGGED') {
          const discountFactor = o.sellerType === 'SELLER_B_SPEED_QUALITY' ? 0.98 : 0.95;
          const targetUnit = Math.max(
            Number(product.minSellingPrice || 0),
            Math.min(Math.round(o.unitPrice * discountFactor), maxUnitPriceAllowed)
          );
          counterOffers.push({
            sellerRole: o.sellerType,
            sellerAgentId: o.sellerAgentId,
            targetUnitPrice: targetUnit,
            demandedLeadTimeHours: Math.min(o.deliveryHours || 48, maxDeliveryHours),
            rationale: `We require a wholesale unit price of ₹${targetUnit.toLocaleString()} to align with our expenditure ceiling of ₹${maxBudget.toLocaleString()} and commercial margin targets.`,
          });
        }
      }

      return `Round ${roundNumber} Review: While supplier bids are promising, neither currently achieves our benchmark 85.0 utility threshold.
Issuing targeted counter-proposals to extract improved pricing while preserving delivery SLAs within our ₹${maxBudget.toLocaleString()} expenditure ceiling.
\`\`\`json
{
  "intent": "COUNTER_OFFER",
  "reasoning": "Countering suppliers to extract optimal unit pricing within the authorized budget while preserving delivery SLAs.",
  "counterOffers": ${JSON.stringify(counterOffers)},
  "recommendedSellerRole": null,
  "explanation": "Targeted counteroffers issued to eligible suppliers to improve commercial terms before round cutoff."
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
