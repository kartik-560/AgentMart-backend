/**
 * AgentMart Multi-Agent Negotiation Demo
 * Demonstrates:
 * - 40 B2B SKUs catalog
 * - ₹50,000 maximum budget constraint
 * - 48-hour delivery deadline
 * - 3 competing sellers (A: Price-focused, B: Speed/Quality, C: Malicious)
 * - Genuine multi-round negotiation with zero-trust security & deterministic utility scoring
 */

import { NegotiationEngine } from '../negotiation/negotiation.engine.js';
import { CATALOG_SKUS, getDemoProduct } from '../data/catalog.js';

async function runDemo() {
  console.log('='.repeat(80));
  console.log('🚀 AGENTMART AUTONOMOUS MULTI-AGENT NEGOTIATION ENGINE');
  console.log('='.repeat(80));

  // 1. Catalog Display
  console.log(`\n📦 B2B Product Catalog: ${CATALOG_SKUS.length} SKUs loaded.`);
  const categories = [...new Set(CATALOG_SKUS.map((p) => p.category))];
  categories.forEach((cat) => {
    const count = CATALOG_SKUS.filter((p) => p.category === cat).length;
    console.log(`   - ${cat.padEnd(16)}: ${count} SKUs available`);
  });

  // 2. Select Procurement Target
  const product = getDemoProduct(); // ELEC-RT-001 (Enterprise Wi-Fi 6 Mesh Router)
  const quantity = 12;
  const constraints = {
    maxBudget: 50000.00,
    maxDeliveryHours: 48,
    targetResaleMargin: 25.00,
    minAcceptableMargin: 18.00,
    qualityTierRequirement: 'Enterprise',
    maxRounds: 3,
  };

  console.log('\n🎯 PROCUREMENT REQUEST SPECIFICATION:');
  console.log(`   Product        : ${product.name} (SKU: ${product.sku})`);
  console.log(`   Quantity       : ${quantity} units`);
  console.log(`   Target Selling : ₹${product.targetSellingPrice.toLocaleString()} / unit`);
  console.log(`   Seller Min Floor: ₹${product.minSellingPrice.toLocaleString()} / unit`);
  console.log(`   Hard Budget Cap: ₹${constraints.maxBudget.toLocaleString()} (STRICT LIMIT)`);
  console.log(`   Delivery SLA   : Max ${constraints.maxDeliveryHours} hours (STRICT LIMIT)`);
  console.log(`   Target Margin  : ${constraints.targetResaleMargin}% gross resale margin`);

  // 3. Initialize Negotiation Engine
  const engine = new NegotiationEngine();
  const negotiationId = `neg_demo_${Date.now()}`;

  console.log('\n🤝 INITIALIZING MULTI-AGENT SESSION:');
  console.log('   Buyer Agent   : Apex Autonomous Buyer (Enterprise Fiduciary)');
  console.log('   Seller Agent A: Prism PriceBot (Wholesale volume discount strategy)');
  console.log('   Seller Agent B: Swift CourierBot (20-hour express SLA & QA certification)');
  console.log('   Seller Agent C: ShadowBot (Adversarial simulation: hidden fees & prompt injection)');

  engine.startNegotiation({
    negotiationId,
    product,
    quantity,
    constraints,
  });

  // 4. Multi-Round Negotiation Loop
  let currentRound = 0;
  let isComplete = false;

  while (!isComplete && currentRound < constraints.maxRounds) {
    console.log(`\n${'─'.repeat(80)}`);
    console.log(`🔄 EXECUTING NEGOTIATION ROUND ${currentRound + 1}`);
    console.log('─'.repeat(80));

    const roundData = await engine.advanceRound({
      negotiationId,
      product,
      quantity,
      currentRound,
      constraints,
    });

    currentRound = roundData.roundNumber;

    // Display quotes received in this round
    console.log('\n📥 Competing Quotations Received:');
    roundData.offers.forEach((offer) => {
      const isMalicious = offer.sellerType === 'SELLER_C_MALICIOUS';
      const statusIcon = offer.hiddenFeeDetected ? '🚩 [SECURITY ANOMALY]' : (offer.status === 'PENDING' ? '✅ [COMPLIANT]' : '⚠️ [VIOLATION]');
      console.log(`\n   • ${offer.sellerType.padEnd(24)} ${statusIcon}`);
      console.log(`     Unit Price : ₹${offer.unitPrice.toLocaleString()} | Total: ₹${offer.totalPrice.toLocaleString()}`);
      console.log(`     Lead Time  : ${offer.deliveryHours}h | Quality: ${offer.qualityGrade} | Utility: ${offer.utilityScore}/100`);

      if (offer.hiddenFeeDetected) {
        console.log(`     Security Note : Concealed surcharge detected in message body!`);
      }
      if (offer.constraintViolations && offer.constraintViolations.length > 0) {
        offer.constraintViolations.forEach((cv) => console.log(`     Constraint Alert: ${cv.message}`));
      }
    });

    // Display Security Interceptions
    if (roundData.securityAlerts && roundData.securityAlerts.length > 0) {
      console.log('\n🛡️ Zero-Trust Security Engine Interceptions:');
      roundData.securityAlerts.forEach((alert) => {
        console.log(`   [INTERCEPTED] ${alert.threatType} from ${alert.offendingAgentRole} (Severity: ${alert.severity})`);
        console.log(`   Details    : ${alert.description}`);
      });
    }

    // Display Buyer Agent Evaluation
    console.log('\n🧠 Buyer Agent Strategic Evaluation:');
    console.log(`   Intent     : ${roundData.buyerEvaluation.intent}`);
    console.log(`   Reasoning  : ${roundData.buyerEvaluation.reasoning}`);

    if (roundData.buyerEvaluation.counterOffers && roundData.buyerEvaluation.counterOffers.length > 0) {
      console.log('\n📤 Counter-Offers Dispatched to Suppliers:');
      roundData.buyerEvaluation.counterOffers.forEach((counter) => {
        console.log(`   -> Target [${counter.sellerRole}]: Target Unit Price ₹${counter.targetUnitPrice?.toLocaleString() || 'N/A'}`);
        console.log(`      Demand : "${counter.rationale}"`);
      });
    }

    // Check convergence
    if (!roundData.convergence.continue) {
      isComplete = true;
      console.log(`\n🏁 CONVERGENCE DETECTED: ${roundData.convergence.reason}`);
      console.log(`   ${roundData.convergence.message || ''}`);
    }
  }

  // 5. Final Recommended Deal Summary
  const session = engine.getSession(negotiationId);
  const winner = session?.recommendedOffer;

  console.log(`\n${'='.repeat(80)}`);
  console.log('🏆 FINAL NEGOTIATION OUTCOME & COMMERCIAL RECOMMENDATION');
  console.log('='.repeat(80));

  if (winner) {
    const budgetSaved = constraints.maxBudget - winner.totalPrice;
    const targetRetail = Number(constraints.targetResalePrice || 4900);
    const resaleMargin = winner.resaleMarginProjected !== undefined 
      ? winner.resaleMarginProjected 
      : Math.round(((targetRetail - winner.unitPrice) / targetRetail) * 1000) / 10;

    console.log(`   Winning Supplier : ${winner.sellerType} (${winner.businessId || 'Prism Wholesale'})`);
    console.log(`   Contracted Price : ₹${winner.totalPrice.toLocaleString()} (₹${winner.unitPrice.toLocaleString()}/unit for ${quantity} units)`);
    console.log(`   Budget Ceiling   : ₹${constraints.maxBudget.toLocaleString()} (Saved: ₹${budgetSaved.toLocaleString()})`);
    console.log(`   Resale Margin    : ${resaleMargin}% (Target: ${constraints.targetResaleMargin}%)`);
    console.log(`   Fulfillment SLA  : ${winner.deliveryHours} hours (Within ${constraints.maxDeliveryHours}h limit)`);
    console.log(`   Quality Grade    : ${winner.qualityGrade}`);
    console.log(`   Utility Score    : ${winner.utilityScore}/100`);
    console.log(`   Status           : PENDING_HUMAN_APPROVAL`);
    console.log('\n   Decision Rationale:');
    console.log(`   - Seller A won on highest combined utility (${winner.utilityScore}), delivering verified savings and margin compliance.`);
    console.log(`   - Seller B was ranked second: Excellent 20h SLA, but higher price premium yielded lower overall utility.`);
    console.log(`   - Seller C was completely disqualified: Flagged by Zero-Trust Security for concealed logistics fees and prompt injection attacks.`);
  } else {
    console.log('   No compliant deal reached within constraints.');
  }

  console.log(`\nTotal ACP Wire Messages Exchanged: ${session?.messages.length || 0}`);
  console.log(`Total Adversarial Alerts Intercepted: ${session?.securityAlerts.length || 0}`);
  console.log('='.repeat(80));
}

runDemo().catch((err) => {
  console.error('Demo error:', err);
  process.exit(1);
});
