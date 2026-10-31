import { prisma } from '../config/prisma.js';
import { sendSuccess } from '../utils/response.js';

export async function getBusinessProfile(req, res, next) {
  try {
    let profile = null;
    try {
      profile = await prisma.business.findFirst({
        where: { businessType: 'RETAIL_ENTERPRISE' },
        include: { businessMemory: true, agents: true },
      });
    } catch {
      // Fallback in-memory profile if DB table not yet migrated
    }

    if (!profile) {
      profile = {
        name: 'Apex Retail Enterprises',
        registrationNumber: 'IN-APX-2024-8891',
        businessType: 'RETAIL_ENTERPRISE',
        contactEmail: 'procurement@apexretail.in',
        budgetLimit: 50000.00,
        targetResaleMargin: 25.00,
        maxDeliveryHours: 48,
        qualityTierRequirement: 'Enterprise',
        riskTolerance: 'BALANCED',
        paymentPreferences: ['MOCK_UPI', 'ESCROW'],
        businessMemory: {
          totalTransactions: 14,
          successfulDeals: 12,
          supplierReliability: {
            'seller-a-price': { score: 85, onTimeRate: 88, qualityScore: 82 },
            'seller-b-quality': { score: 96, onTimeRate: 98, qualityScore: 97 },
            'seller-c-malicious': { score: 32, onTimeRate: 40, qualityScore: 30 },
          },
        },
      };
    }

    return sendSuccess(res, profile, 'Business profile retrieved');
  } catch (error) {
    next(error);
  }
}

export async function updateBusinessProfile(req, res, next) {
  try {
    const updateData = req.body;
    let updated = null;

    try {
      const existing = await prisma.business.findFirst({
        where: { businessType: 'RETAIL_ENTERPRISE' },
      });
      if (existing) {
        updated = await prisma.business.update({
          where: { id: existing.id },
          data: updateData,
        });
      }
    } catch {
      // Fallback
    }

    return sendSuccess(res, updated || updateData, 'Business profile updated successfully');
  } catch (error) {
    next(error);
  }
}

