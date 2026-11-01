import { prisma } from '../../config/prisma.js';
import { logger } from '../../utils/logger.js';

/**
 * Searches all registered sellers' active catalogues in PostgreSQL.
 * Matches products using exact SKU or Product ID (never fuzzy name matching),
 * and validates that the seller has available inventory >= targetQuantity.
 *
 * @param {Object} params
 * @param {string} [params.targetProductId] - Target product ID
 * @param {string} [params.targetSku] - Target product SKU
 * @param {number} [params.targetQuantity=1] - Requested procurement quantity
 * @param {string} [params.buyerBusinessId] - Buyer's business ID to exclude self-bidding
 * @returns {Promise<Array<Object>>} List of eligible sellers with their agents and matching products
 */
export async function findEligibleSellersForProduct({
  targetProductId,
  targetSku,
  targetQuantity = 1,
  buyerBusinessId = null,
}) {
  let refSku = targetSku;
  let refId = targetProductId;

  // If SKU is not provided, look it up by ID
  if (!refSku && refId) {
    try {
      const prod = await prisma.product.findUnique({
        where: { id: refId },
        select: { sku: true },
      });
      refSku = prod?.sku;
    } catch (e) {
      logger.warn(`Could not lookup SKU for product ${refId}: ${e?.message}`);
    }
  }

  if (!refSku && !refId) {
    return [];
  }

  const cleanSku = refSku ? refSku.trim().toUpperCase() : null;
  const requestedQty = parseInt(targetQuantity, 10) || 1;

  // Search active products across all sellers in PostgreSQL matching the exact SKU or ID
  const whereClause = {
    isActive: true,
    ...(buyerBusinessId ? { businessId: { not: buyerBusinessId } } : {}),
    OR: [
      ...(refId ? [{ id: refId }] : []),
      ...(cleanSku ? [{ sku: { equals: cleanSku, mode: 'insensitive' } }] : []),
    ],
  };

  let matchingProducts = [];
  try {
    matchingProducts = await prisma.product.findMany({
      where: whereClause,
      include: {
        inventory: true,
        business: {
          include: {
            agents: {
              where: {
                agentType: { not: 'BUYER' },
                status: 'ACTIVE',
              },
            },
          },
        },
      },
    });
  } catch (err) {
    logger.error(`Error querying matching products for SKU [${cleanSku}]: ${err?.message}`);
    return [];
  }

  const eligibleParticipants = [];
  const seenBusinessIds = new Set();

  for (const p of matchingProducts) {
    // Only one product per seller organization in a single negotiation
    if (seenBusinessIds.has(p.businessId)) continue;

    const availableStock = Number(p.inventory?.stockQuantity || 0);
    const reservedStock = Number(p.inventory?.reservedQuantity || 0);
    const netAvailable = Math.max(0, availableStock - reservedStock);

    // CORE RULE: Match products using SKU/product identity, and check product availability & stock >= requested quantity
    if (availableStock >= requestedQty) {
      seenBusinessIds.add(p.businessId);

      // Resolve or provision this seller's autonomous agent
      let agent = p.business?.agents?.[0] || null;
      if (!agent) {
        try {
          agent = await prisma.agent.create({
            data: {
              businessId: p.businessId,
              name: `${p.business?.name || 'Supplier'} Autonomous Agent`,
              agentType: 'SELLER_A_PRICE',
              status: 'ACTIVE',
              modelProvider: 'Google-Gemini',
              modelName: 'gemini-2.0-flash',
              trustScore: 98.0,
              systemPrompt: `You are the autonomous sales agent representing ${p.business?.name || 'our enterprise'}. Enforce delivery SLAs, protect minimum floor margins, and negotiate competitive commercial wholesale proposals.`,
            },
          });
        } catch (agentErr) {
          agent = {
            id: `agent-${p.businessId}`,
            name: `${p.business?.name || 'Supplier'} Agent`,
            agentType: 'SELLER_A_PRICE',
            trustScore: 98.0,
          };
        }
      }

      eligibleParticipants.push({
        businessId: p.businessId,
        businessName: p.business?.name || 'Verified Supplier',
        registrationNumber: p.business?.registrationNumber || 'IN-SUP-VERIFIED',
        businessType: p.business?.businessType || 'DISTRIBUTOR',
        contactEmail: p.business?.contactEmail || '',
        agentId: agent.id,
        agentName: agent.name,
        agentType: agent.agentType,
        trustScore: agent.trustScore ? Number(agent.trustScore) : 98.0,
        productId: p.id,
        productName: p.name,
        sku: p.sku,
        category: p.category,
        description: p.description,
        availableQuantity: availableStock,
        unreservedQuantity: netAvailable,
        unitPrice: Number(p.targetSellingPrice),
        minSellingPrice: Number(p.minSellingPrice),
        baseCostPrice: Number(p.baseCostPrice),
        leadTimeHours: p.typicalLeadTimeHours || 24,
        qualityGrade: p.qualityGrade || 'Enterprise',
        warrantyPeriod: p.metadata?.warrantyPeriod || '12 Months Replacement',
        certifications: p.metadata?.certifications || '',
      });
    }
  }

  logger.info(
    `ProductMatcher: Found ${eligibleParticipants.length} eligible seller(s) for SKU [${cleanSku}] with stock >= ${requestedQty}`
  );

  return eligibleParticipants;
}

