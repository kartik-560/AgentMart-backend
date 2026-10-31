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

    // Persist messages, offers, and security events into PostgreSQL
    try {
      // 0. Lookup DB agents to guarantee foreign key integrity
      const dbAgents = await prisma.agent.findMany({
        select: { id: true, businessId: true, agentType: true },
      });
      const agentMap = {};
      for (const a of dbAgents) {
        agentMap[a.agentType] = a;
        agentMap[a.id] = a;
      }

      // 1. Persist security alerts
      for (const alert of roundResult.securityAlerts || []) {
        const offender = agentMap[alert.offendingAgentRole] || agentMap[alert.offendingAgentId] || agentMap['SELLER_C_MALICIOUS'];
        await prisma.securityEvent.create({
          data: {
            negotiationId,
            offendingAgentId: offender ? offender.id : null,
            threatType: alert.threatType || 'ANOMALY_DETECTED',
            severity: alert.severity || 'HIGH',
            description: alert.description || 'Security anomaly detected',
            rawPayload: alert.rawPayload ? (typeof alert.rawPayload === 'string' ? JSON.parse(alert.rawPayload) : alert.rawPayload) : null,
            mitigationAction: 'OFFER_REJECTED',
            resolved: false,
          },
        });
      }

      // 2. Persist agent messages from orchestrator discourse
      const session = engine.orchestrator.sessions.get(negotiationId);
      const sessionMessages = session?.messages || [];
      for (const msg of sessionMessages) {
        if (msg.roundNumber === nextRound || msg.roundNumber === currentRoundNumber) {
          const role = msg.sender?.role || 'BUYER';
          const sender = agentMap[role] || agentMap['BUYER'] || dbAgents[0];
          if (sender) {
            await prisma.agentMessage.create({
              data: {
                negotiationId,
                agentId: sender.id,
                roundNumber: msg.roundNumber || nextRound,
                senderRole: role,
                content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
                structuredProposal: msg.proposal || null,
                securityStatus: msg.securityValidation?.status === 'FLAGGED' ? 'SUSPICIOUS' : 'VERIFIED',
              },
            });
          }
        }
      }

      // 3. Persist offers and map back DB IDs
      let recommendedDbOffer = null;
      const persistedOffers = [];

      for (const offer of roundResult.offers || []) {
        const seller = agentMap[offer.sellerType] || agentMap[offer.sellerAgentId] || dbAgents.find((a) => a.id === offer.sellerAgentId) || agentMap['SELLER_A_PRICE'] || dbAgents[1];
        const isRec = Boolean(
          roundResult.recommendedOffer &&
          (roundResult.recommendedOffer.sellerAgentId === offer.sellerAgentId ||
           roundResult.recommendedOffer.sellerType === offer.sellerType ||
           roundResult.recommendedOffer.sellerAgentName === offer.sellerAgentName)
        );

        const savedOffer = await prisma.offer.create({
          data: {
            negotiationId,
            sellerBusinessId: seller?.businessId || negotiation?.buyerBusinessId,
            sellerAgentId: seller?.id,
            productId: product.id,
            roundNumber: nextRound,
            unitPrice: offer.unitPrice,
            quantity: offer.quantity,
            totalPrice: offer.totalPrice,
            deliveryHours: offer.deliveryHours,
            qualityGrade: offer.qualityGrade || 'Standard',
            resaleMarginProjected: offer.resaleMarginProjected || offer.breakdown?.resaleMargin || 22.0,
            utilityScore: offer.utilityScore || 0,
            status: offer.status === 'PENDING' ? 'PENDING' : 'FLAGGED',
            hiddenFeeDetected: Boolean(offer.hiddenFeeDetected),
            isRecommended: isRec,
          },
        });

        persistedOffers.push({
          ...offer,
          id: savedOffer.id,
          sellerBusinessId: savedOffer.sellerBusinessId,
          sellerAgentId: savedOffer.sellerAgentId,
        });

        if (isRec) {
          recommendedDbOffer = savedOffer;
        }
      }

      // If no offer was explicitly marked recommended yet convergence reached, pick highest utility clean offer
      if (!recommendedDbOffer && persistedOffers.length > 0) {
        const cleanOffers = persistedOffers.filter((o) => !o.hiddenFeeDetected && o.status === 'PENDING');
        if (cleanOffers.length > 0) {
          cleanOffers.sort((a, b) => (b.utilityScore || 0) - (a.utilityScore || 0));
          const best = cleanOffers[0];
          await prisma.offer.update({
            where: { id: best.id },
            data: { isRecommended: true },
          });
          recommendedDbOffer = best;
        }
      }

      roundResult.offers = persistedOffers;
      if (recommendedDbOffer) {
        roundResult.recommendedOffer = {
          ...roundResult.recommendedOffer,
          id: recommendedDbOffer.id,
          offerId: recommendedDbOffer.id,
          sellerBusinessId: recommendedDbOffer.sellerBusinessId,
          sellerAgentId: recommendedDbOffer.sellerAgentId,
          unitPrice: recommendedDbOffer.unitPrice,
          totalPrice: recommendedDbOffer.totalPrice,
          deliveryHours: recommendedDbOffer.deliveryHours,
        };
      }

      // 4. Update Negotiation state
      const isConcluded = !roundResult.convergence.continue && recommendedDbOffer;
      await prisma.negotiation.update({
        where: { id: negotiationId },
        data: {
          currentRound: nextRound,
          status: isConcluded ? 'PENDING_HUMAN_APPROVAL' : 'IN_PROGRESS',
          recommendedOfferId: recommendedDbOffer ? recommendedDbOffer.id : null,
        },
      });

      // 5. Create pending transaction if deal reached
      if (isConcluded && recommendedDbOffer) {
        const tx = await prisma.transaction.create({
          data: {
            negotiationId,
            offerId: recommendedDbOffer.id,
            buyerBusinessId: negotiation?.buyerBusinessId || dbAgents[0].businessId,
            sellerBusinessId: recommendedDbOffer.sellerBusinessId,
            settlementAmount: recommendedDbOffer.totalPrice,
            currency: 'INR',
            paymentMethod: 'MOCK_UPI',
            settlementStatus: 'PENDING_APPROVAL',
            humanApprovalRequired: true,
            mockUpiVpa: 'prismwholesale@icici',
          },
        });

        roundResult.transaction = tx;

        if (io) {
          io.to(negotiationId).emit('transaction:approval_requested', tx);
        }
      }

      // 6. Record Audit Log for Round Advancement
      await prisma.auditLog.create({
        data: {
          entityType: 'NEGOTIATION',
          entityId: negotiationId,
          action: 'ROUND_ADVANCED',
          actorType: 'SYSTEM',
          actorId: 'agent-orchestrator',
          newState: {
            round: nextRound,
            status: isConcluded ? 'PENDING_HUMAN_APPROVAL' : 'IN_PROGRESS',
            offersCount: persistedOffers.length,
            recommendedOfferId: recommendedDbOffer?.id || null,
          },
          tamperProofHash: crypto.createHash('sha256').update(negotiationId + '-ROUND-' + nextRound + '-' + Date.now()).digest('hex'),
        },
      });
    } catch (err) {
      logger.error(`Database persistence in advanceRound failed: ${err.message}`, { stack: err.stack });
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

