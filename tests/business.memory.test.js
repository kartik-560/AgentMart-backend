import { test, describe } from 'node:test';
import assert from 'node:assert';
import { BusinessMemoryEngine } from '../src/agent-engine/memory/business.memory.js';

describe('Business Memory Engine Tests', () => {
  test('Retrieves supplier reliability score with fallback', () => {
    const memory = {
      supplierReliability: {
        'seller-a-price': { score: 92 },
        'seller-b-quality': { score: 98 },
      },
    };

    assert.strictEqual(BusinessMemoryEngine.getSupplierScore(memory, 'seller-a-price'), 92);
    assert.strictEqual(BusinessMemoryEngine.getSupplierScore(memory, 'seller-b-quality'), 98);
    assert.strictEqual(BusinessMemoryEngine.getSupplierScore(memory, 'unknown-seller', 80), 80);
  });

  test('Updates supplier reliability and penalizes hidden fee incidents', () => {
    let memory = null;

    // Successful on-time transaction
    memory = BusinessMemoryEngine.recordTransactionOutcome(memory, {
      supplierKey: 'seller-a',
      supplierName: 'Prism Wholesale',
      wasSuccessful: true,
      onTime: true,
      totalAmount: 44400,
      actualMargin: 24.5,
    });

    assert.strictEqual(memory.totalTransactions, 1);
    assert.strictEqual(memory.successfulDeals, 1);
    assert.strictEqual(memory.supplierReliability['seller-a'].score, 83); // 80 + 3

    // Second transaction with hidden fee detected
    memory = BusinessMemoryEngine.recordTransactionOutcome(memory, {
      supplierKey: 'seller-c',
      supplierName: 'ShadowBot',
      wasSuccessful: false,
      onTime: false,
      hiddenFeeDetected: true,
      totalAmount: 50400,
    });

    assert.strictEqual(memory.totalTransactions, 2);
    assert.strictEqual(memory.successfulDeals, 1);
    assert.strictEqual(memory.supplierReliability['seller-c'].hiddenFeeIncidents, 1);
    assert.strictEqual(memory.supplierReliability['seller-c'].score, 55); // 80 - 25
  });

  test('Identifies preferred suppliers based on historical reliability benchmark', () => {
    let memory = null;

    // Record multiple successful deals for seller-b
    for (let i = 0; i < 3; i++) {
      memory = BusinessMemoryEngine.recordTransactionOutcome(memory, {
        supplierKey: 'seller-b',
        supplierName: 'Swift Quality',
        wasSuccessful: true,
        onTime: true,
        totalAmount: 47400,
        actualMargin: 22.0,
      });
    }

    const preferred = BusinessMemoryEngine.identifyPreferredSuppliers(memory);
    assert.ok(preferred.length > 0);
    assert.strictEqual(preferred[0].supplierKey, 'seller-b');
    assert.strictEqual(preferred[0].isPreferred, true);
    assert.strictEqual(preferred[0].onTimeRate, 100);
  });

  test('Tracks historical purchase prices and computes volume-weighted average price (VWAP)', () => {
    let memory = null;

    // Purchase 1: 10 units @ ₹3,800
    memory = BusinessMemoryEngine.recordTransactionOutcome(memory, {
      supplierKey: 'seller-a',
      sku: 'ELEC-RT-001',
      unitPrice: 3800,
      quantity: 10,
      totalAmount: 38000,
      wasSuccessful: true,
      onTime: true,
    });

    // Purchase 2: 15 units @ ₹3,600
    memory = BusinessMemoryEngine.recordTransactionOutcome(memory, {
      supplierKey: 'seller-a',
      sku: 'ELEC-RT-001',
      unitPrice: 3600,
      quantity: 15,
      totalAmount: 54000,
      wasSuccessful: true,
      onTime: true,
    });

    const priceAnalytics = BusinessMemoryEngine.getHistoricalPriceAnalytics(memory, 'ELEC-RT-001');
    assert.ok(priceAnalytics);
    assert.strictEqual(priceAnalytics.minPrice, 3600);
    assert.strictEqual(priceAnalytics.maxPrice, 3800);
    assert.strictEqual(priceAnalytics.totalUnitsPurchased, 25);
    // VWAP: (38000 + 54000) / 25 = 92000 / 25 = 3680
    assert.strictEqual(priceAnalytics.averagePrice, 3680);
    assert.strictEqual(priceAnalytics.priceTrend, 'FALLING');
  });

  test('Tracks profitable customers and payment reliability from seller perspective', () => {
    let memory = null;

    memory = BusinessMemoryEngine.recordTransactionOutcome(memory, {
      supplierKey: 'seller-a',
      buyerKey: 'buyer-enterprise-1',
      unitPrice: 3700,
      quantity: 12,
      totalAmount: 44400,
      actualMargin: 20, // 20% margin on 44400 = 8880 profit
      wasSuccessful: true,
      paymentReliable: true,
    });

    const customers = BusinessMemoryEngine.identifyProfitableCustomers(memory);
    assert.strictEqual(customers.length, 1);
    assert.strictEqual(customers[0].customerKey, 'buyer-enterprise-1');
    assert.strictEqual(customers[0].totalRevenue, 44400);
    assert.ok(customers[0].totalProfit > 0);
    assert.strictEqual(customers[0].paymentReliabilityScore, 100);
  });

  test('NON-NEGOTIABLE SAFETY: Never silently mutates business constraints; generates Pending Owner Policies', () => {
    let memory = null;

    // High margin transaction triggers margin policy recommendation
    memory = BusinessMemoryEngine.recordTransactionOutcome(memory, {
      supplierKey: 'seller-a',
      unitPrice: 3600,
      quantity: 12,
      totalAmount: 43200,
      actualMargin: 29.5, // > 28%
      wasSuccessful: true,
      onTime: true,
    });

    const pending = BusinessMemoryEngine.getPendingRecommendations(memory);
    assert.ok(pending.length > 0);
    const marginRec = pending.find(r => r.type === 'TARGET_MARGIN_INCREASE');
    assert.ok(marginRec);
    assert.strictEqual(marginRec.status, 'PENDING_OWNER_APPROVAL');
    assert.strictEqual(marginRec.requiresExplicitApproval, true);

    // Attempting to apply without owner authorization must throw error
    assert.throws(() => {
      BusinessMemoryEngine.applyPolicyRecommendation(memory, marginRec.id, null);
    }, /Mandatory owner authorization required/);

    // Applying with explicit owner approval succeeds and updates status
    const result = BusinessMemoryEngine.applyPolicyRecommendation(memory, marginRec.id, {
      approvedBy: 'Kartik - Senior Procurement Director',
      notes: 'Approved adjustment based on consistent 29.5% margin yield',
    });

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.appliedPolicy.status, 'APPROVED_BY_OWNER');
    assert.strictEqual(result.appliedPolicy.approvedBy, 'Kartik - Senior Procurement Director');
  });
});

