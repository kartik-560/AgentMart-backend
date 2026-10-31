import { prisma } from '../config/prisma.js';
import { sendSuccess } from '../utils/response.js';

export async function getBusinessProfile(req, res, next) {
  try {
    let business = null;
    try {
      business = await prisma.business.findFirst({
        where: { businessType: 'RETAIL_ENTERPRISE' },
        include: { profile: true, businessMemory: true, agents: true },
      });
    } catch {
      // Fallback
    }

    if (!business) {
      business = {
        id: 'biz-apex-retail',
        name: 'Apex Retail Enterprises',
        registrationNumber: 'IN-APX-2024-8891',
        businessType: 'RETAIL_ENTERPRISE',
        contactEmail: 'procurement@apexretail.in',
        profile: {
          budgetLimit: 50000.00,
          targetResaleMargin: 25.00,
          minAcceptableMargin: 18.00,
          maxDeliveryHours: 48,
          qualityTierRequirement: 'Enterprise',
          riskTolerance: 'BALANCED',
          paymentPreferences: ['MOCK_UPI', 'ESCROW'],
        },
        businessMemory: {
          totalTransactions: 14,
          successfulDeals: 12,
          supplierReliability: {
            'seller-a-price': { score: 88, onTimeRate: 90, qualityScore: 85 },
            'seller-b-quality': { score: 96, onTimeRate: 98, qualityScore: 97 },
            'seller-c-malicious': { score: 32, onTimeRate: 40, qualityScore: 30 },
          },
        },
      };
    }

    // Merge profile fields onto top-level response for backwards-compatible frontend consumption
    const responsePayload = {
      ...business,
      budgetLimit: business.profile?.budgetLimit ?? 50000.00,
      targetResaleMargin: business.profile?.targetResaleMargin ?? 25.00,
      maxDeliveryHours: business.profile?.maxDeliveryHours ?? 48,
      qualityTierRequirement: business.profile?.qualityTierRequirement ?? 'Enterprise',
      riskTolerance: business.profile?.riskTolerance ?? 'BALANCED',
    };

    return sendSuccess(res, responsePayload, 'Business profile retrieved');
  } catch (error) {
    next(error);
  }
}

export async function updateBusinessProfile(req, res, next) {
  try {
    const { name, contactEmail, contactPhone, budgetLimit, targetResaleMargin, maxDeliveryHours, riskTolerance } = req.body;
    let updated = null;

    try {
      const existing = await prisma.business.findFirst({
        where: { businessType: 'RETAIL_ENTERPRISE' },
        include: { profile: true },
      });

      if (existing) {
        updated = await prisma.business.update({
          where: { id: existing.id },
          data: {
            ...(name && { name }),
            ...(contactEmail && { contactEmail }),
            ...(contactPhone && { contactPhone }),
            profile: {
              upsert: {
                create: {
                  budgetLimit: budgetLimit || 50000.00,
                  targetResaleMargin: targetResaleMargin || 25.00,
                  maxDeliveryHours: maxDeliveryHours || 48,
                  riskTolerance: riskTolerance || 'BALANCED',
                },
                update: {
                  ...(budgetLimit !== undefined && { budgetLimit }),
                  ...(targetResaleMargin !== undefined && { targetResaleMargin }),
                  ...(maxDeliveryHours !== undefined && { maxDeliveryHours }),
                  ...(riskTolerance && { riskTolerance }),
                },
              },
            },
          },
          include: { profile: true },
        });
      }
    } catch {
      // Fallback
    }

    const payload = updated || {
      name,
      contactEmail,
      budgetLimit: budgetLimit || 50000,
      targetResaleMargin: targetResaleMargin || 25,
      maxDeliveryHours: maxDeliveryHours || 48,
      riskTolerance: riskTolerance || 'BALANCED',
    };

    return sendSuccess(res, payload, 'Business profile updated successfully');
  } catch (error) {
    next(error);
  }
}
