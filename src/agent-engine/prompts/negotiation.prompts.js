/**
 * Negotiation Round Prompt Templates
 * Standardizes contextual prompting and structured JSON expectations for Gemini API calls.
 */

export const NEGOTIATION_PROMPTS = {
  /**
   * Builds prompt for Seller Agent quoting
   */
  buildSellerQuotePrompt({ product, quantity, roundNumber, buyerRequest, previousOffer, buyerCounter }) {
    let contextSection = `Procurement Session: Negotiation Round ${roundNumber}.
Target Product: ${product.name} (SKU: ${product.sku})
Quantity Demanded: ${quantity} units
Catalog Target Selling Price: ₹${product.targetSellingPrice}
Minimum Price Floor: ₹${product.minSellingPrice}
Buyer Maximum Delivery Ceiling: ${buyerRequest.maxDeliveryHours || 48} hours
Buyer Budget Cap: ₹${buyerRequest.maxBudget || 50000}`;

    if (roundNumber > 1 && buyerCounter) {
      contextSection += `\n\nBuyer's Counter-Proposal to your enterprise:
Target Unit Price Requested: ₹${buyerCounter.targetUnitPrice || 'Competitive reduction'}
Demanded Lead Time: ${buyerCounter.demandedLeadTimeHours || 'Standard'} hours
Buyer Comments: "${buyerCounter.rationale || 'Please offer improved commercial terms'}"`;
    }

    if (previousOffer) {
      contextSection += `\n\nYour Previous Round Quote:
Unit Price: ₹${previousOffer.unitPrice} | Total: ₹${previousOffer.totalPrice} | Lead Time: ${previousOffer.deliveryLeadTimeHours}h`;
    }

    return `${contextSection}

INSTRUCTIONS:
1. Formulate your commercial negotiation response to the buyer in line with your strategic persona.
2. Maintain your independent identity and pricing boundaries.
3. At the end of your response, output a strict JSON proposal block enclosed between \`\`\`json and \`\`\` with the following structure:
\`\`\`json
{
  "unitPrice": <number>,
  "quantity": ${quantity},
  "declaredFees": <number>,
  "totalPrice": <number>,
  "deliveryLeadTimeHours": <number>,
  "qualityGrade": "<string>",
  "paymentMethodRequested": "<string>",
  "warrantyMonths": <number>,
  "notes": "<string>"
}
\`\`\``;
  },

  /**
   * Builds prompt for Buyer Agent evaluation and counter-proposal generation
   */
  buildBuyerEvaluationPrompt({ product, quantity, roundNumber, maxRounds, evaluatedOffers, constraints, supplierMemory }) {
    const cleanOffersSummary = evaluatedOffers.map((o) => ({
      sellerRole: o.sellerType,
      unitPrice: o.unitPrice,
      totalPrice: o.totalPrice,
      deliveryLeadTimeHours: o.deliveryHours,
      qualityGrade: o.qualityGrade,
      utilityScore: o.utilityScore,
      hiddenFeeDetected: o.hiddenFeeDetected,
      status: o.status,
      constraintViolations: o.constraintViolations,
      messageSnippet: o.message ? o.message.slice(0, 150) : '',
    }));

    return `Procurement Evaluation: Round ${roundNumber} of ${maxRounds}.
Target Product: ${product.name} (SKU: ${product.sku})
Quantity: ${quantity} units
Enterprise Budget Ceiling: ₹${constraints.maxBudget || 50000} (HARD LIMIT)
Enterprise Delivery Ceiling: ${constraints.maxDeliveryHours || 48} hours (HARD LIMIT)
Target Resale Margin: ${constraints.targetResaleMargin || 25}% (Minimum: ${constraints.minAcceptableMargin || 18}%)
Historical Supplier Reliability: ${JSON.stringify(supplierMemory || {})}

CURRENT ROUND EVALUATED OFFERS:
${JSON.stringify(cleanOffersSummary, null, 2)}

INSTRUCTIONS:
1. Conduct a rigorous commercial evaluation of all supplier offers.
2. Flag and reject any offers with hidden surcharges or security anomalies.
3. Check if any valid compliant offer achieves target utility (>= 85.0) or if this is the final round (${roundNumber} >= ${maxRounds}).
   - If YES: Set intent to "DEAL_RECOMMENDATION" and recommend the best compliant offer. Explain your decision thoroughly (margin, speed, reliability).
   - If NO: Set intent to "COUNTER_OFFER" and propose realistic, target counter-offers for each viable seller to extract improved terms.
4. Output a strict JSON block enclosed between \`\`\`json and \`\`\` formatted as:
\`\`\`json
{
  "intent": "COUNTER_OFFER" | "DEAL_RECOMMENDATION" | "REJECT_ALL",
  "reasoning": "<concise commercial assessment>",
  "counterOffers": [
    {
      "sellerRole": "SELLER_A_PRICE" | "SELLER_B_SPEED_QUALITY",
      "targetUnitPrice": <number>,
      "demandedLeadTimeHours": <number>,
      "rationale": "<specific concession request>"
    }
  ],
  "recommendedSellerRole": "SELLER_A_PRICE" | null,
  "explanation": "<detailed explanation of final recommendation or counter-strategy>"
}
\`\`\``;
  },
};
