import { prisma } from '../config/prisma.js';
import { NegotiationEngine } from '../agent-engine/negotiation/negotiation.engine.js';
import { SecurityEngine } from '../agent-engine/security/security.engine.js';
import { logger } from '../utils/logger.js';
import crypto from 'crypto';

let negotiationEngineSingleton = null;

export function getNegotiationEngine(io = null) {
  if (!negotiationEngineSingleton) {
    negotiationEngineSingleton = new NegotiationEngine(io);
  } else if (io) {
    negotiationEngineSingleton.setSocketIo(io);
  }
  return negotiationEngineSingleton;
}

export class NegotiationService {
  /**
   * Initializes a new procurement negotiation session
   */
  static async createNegotiation(data, user, io = null) {
    const { targetProductId, targetQuantity, maxBudget, maxDeliveryHours, targetResaleMargin } = data;

    let product = null;
    let buyerBusiness = null;
    let buyerAgent = null;

    try {
      product = await prisma.product.findUnique({
        where: { id: targetProductId },
        include: { inventory: true },
      });
      buyerBusiness = await prisma.business.findFirst({
        where: { businessType: 'RETAIL_ENTERPRISE' },
        include: { agents: { where: { agentType: 'BUYER' } } },
      });
      if (buyerBusiness?.agents?.length) {
        buyerAgent = buyerBusiness.agents[0];
      }
    } catch {}

    const title = `Procurement: ${targetQuantity}x ${product?.name || 'Enterprise Items'}`;
    let negotiation = null;

    try {
      negotiation = await prisma.negotiation.create({
        data: {
          title,
          targetProductId: product?.id || targetProductId,
          buyerBusinessId: buyerBusiness?.id || 'biz-apex-retail',
          buyerAgentId: buyerAgent?.id || 'agent-buyer-1',
          status: 'INITIATED',
          maxBudget,
          maxDeliveryHours,
          targetQuantity,
          targetResaleMargin,
          currentRound: 1,
        },
        include: { targetProduct: true, buyerBusiness: true, buyerAgent: true },
      });

      // Reserve inventory
      if (product?.inventory) {
        await prisma.inventory.update({
          where: { id: product.inventory.id },
          data: { reservedQuantity: { increment: targetQuantity } },
        });
      }

      // Record audit
      await prisma.auditLog.create({
        data: {
          entityType: 'NEGOTIATION',
          entityId: negotiation.id,
          action: 'INITIATED',
          actorType: user?.role ? 'HUMAN' : 'SYSTEM',
          actorId: user?.id || 'system-orchestrator',
          newState: { maxBudget, maxDeliveryHours, targetQuantity },
          tamperProofHash: crypto.createHash('sha256').update(`${negotiation.id}-INITIATED-${Date.now()}`).digest('hex'),
        },
      });
    } catch (err) {
      // High-fidelity fallback for offline or unseeded DB
      negotiation = {
        id: `neg-${Date.now()}`,
        title,
        targetProductId,
        targetQuantity,
        maxBudget,
        maxDeliveryHours,
        targetResaleMargin,
        currentRound: 1,
        status: 'INITIATED',
        createdAt: new Date().toISOString(),
      };
    }

    if (io) {
      io.emit('negotiation:created', negotiation);
    }

    return negotiation;
  }

  /**
   * Advances negotiation round: coordinates multi-agent reasoning, security scanning, persistence, and Socket.IO
   */
  static async advanceRound(negotiationId, currentRoundNumber = 1, user = null, io = null) {
    const engine = getNegotiationEngine(io);

    let negotiation = null;
    try {
      negotiation = await prisma.negotiation.findUnique({
        where: { id: negotiationId },
        include: { targetProduct: true, buyerBusiness: true },
      });
    } catch {}

    const product = negotiation?.targetProduct || {
      id: 'prod-mock-1',
      sku: 'ELEC-RT-001',
      name: 'Enterprise Wi-Fi 6 Mesh Router',
      baseCostPrice: 3200,
      minSellingPrice: 3500,
      targetSellingPrice: 4200,
    };

    const quantity = negotiation?.targetQuantity || 12;
    const constraints = {
      maxBudget: Number(negotiation?.maxBudget || 50000),
      maxDeliveryHours: negotiation?.maxDeliveryHours || 48,
      targetResaleMargin: Number(negotiation?.targetResaleMargin || 25),
    };

    // Execute through multi-agent engine
    const roundResult = await engine.advanceRound({
      negotiationId,
      product,
      quantity,
      currentRound: currentRoundNumber,
      constraints,
    });

    const nextRound = roundResult.nextRoundNumber;

    // Persist messages, offers, and security events if DB available
    try {
      // 1. Persist security alerts
      for (const alert of roundResult.securityAlerts || []) {
        await prisma.securityEvent.create({
          data: {
            negotiationId,
            offendingAgentId: alert.offendingAgentId,
            threatType: alert.threatType,
            severity: alert.severity,
            description: alert.description,
            rawPayload: alert.rawPayload,
            mitigationAction: 'OFFER_REJECTED',
            resolved: false,
          },
        });
      }

      // 2. Persist offers
      for (const offer of roundResult.offers || []) {
        await prisma.offer.create({
          data: {
            negotiationId,
            sellerBusinessId: offer.sellerBusinessId || 'biz-seller',
            sellerAgentId: offer.sellerAgentId,
            productId: product.id,
            roundNumber: nextRound,
            unitPrice: offer.unitPrice,
            quantity: offer.quantity,
            totalPrice: offer.totalPrice,
            deliveryHours: offer.deliveryHours,
            qualityGrade: offer.qualityGrade,
            resaleMarginProjected: offer.breakdown?.resaleMargin || 22.0,
            utilityScore: offer.utilityScore,
            status: offer.status === 'PENDING' ? 'PENDING' : 'FLAGGED',
            hiddenFeeDetected: offer.hiddenFeeDetected,
            isRecommended: roundResult.recommendedOffer?.sellerAgentId === offer.sellerAgentId,
          },
        });
      }

      // 3. Update Negotiation state
      const isConcluded = !roundResult.convergence.continue && roundResult.recommendedOffer;
      await prisma.negotiation.update({
        where: { id: negotiationId },
        data: {
          currentRound: nextRound,
          status: isConcluded ? 'PENDING_HUMAN_APPROVAL' : 'IN_PROGRESS',
        },
      });

      // 4. Create pending transaction if deal reached
      if (isConcluded && roundResult.recommendedOffer) {
        const recommended = roundResult.recommendedOffer;
        const tx = await prisma.transaction.create({
          data: {
            negotiationId,
            offerId: recommended.id || `off-${Date.now()}`,
            buyerBusinessId: negotiation?.buyerBusinessId || 'biz-apex-retail',
            sellerBusinessId: recommended.sellerBusinessId || 'biz-prism-wholesale',
            settlementAmount: recommended.totalPrice,
            currency: 'INR',
            paymentMethod: 'MOCK_UPI',
            settlementStatus: 'PENDING_APPROVAL',
            humanApprovalRequired: true,
            mockUpiVpa: 'prismwholesale@icici',
          },
        });

        if (io) {
          io.to(negotiationId).emit('transaction:approval_requested', tx);
        }
      }
    } catch (err) {
      logger.debug(`Database persistence in advanceRound (using memory state): ${err.message}`);
    }

    // Broadcast round completed
    if (io) {
      io.to(negotiationId).emit('negotiation:round_completed', {
        negotiationId,
        round: nextRound,
        offers: roundResult.offers,
        recommendedOffer: roundResult.recommendedOffer,
      });
    }

    return roundResult;
  }
}

