/**
 * Negotiation Round Prompt Templates
 * Standardizes structured output expectations for Gemini API calls.
 */

export const NEGOTIATION_PROMPTS = {
  buildSellerQuotePrompt({ product, quantity, roundNumber, buyerRequest }) {
    return `Negotiation Round ${roundNumber}.
Target Product: ${product.name} (SKU: ${product.sku})
Quantity Requested: ${quantity} units
Buyer RFQ Details: ${JSON.stringify(buyerRequest)}

Formulate your commercial quote based on your assigned strategy persona.
Provide:
1. Natural language pitch / response to the buyer.
2. A strict JSON proposal block enclosed between \`\`\`json and \`\`\` with fields:
{
  "unitPrice": number,
  "quantity": ${quantity},
  "totalPrice": number,
  "deliveryHours": number,
  "qualityGrade": string,
  "notes": string
}`;
  },

  buildBuyerCounterPrompt({ product, quantity, roundNumber, competingOffers, constraints }) {
    return `Negotiation Round ${roundNumber} Evaluation.
Product: ${product.name}
Quantity: ${quantity}
Hard Constraints: Max Budget ₹${constraints.maxBudget}, Max Delivery ${constraints.maxDeliveryHours} hours.

Current Competing Offers:
${JSON.stringify(competingOffers, null, 2)}

Evaluate these offers. Formulate your strategic counter-position or deal recommendation, explaining your commercial reasoning.`;
  },
};

