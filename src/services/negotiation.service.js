import { prisma } from '../config/prisma.js';
import { findEligibleSellersForProduct } from '../modules/products/productMatcher.js';
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
    const { targetProductId, targetQuantity, maxBudget, maxDeliveryHours, targetResaleMargin, targetSku } = data;

    let product = null;
    let buyerBusiness = null;
    let buyerAgent = null;

    try {
      if (targetProductId) {
        product = await prisma.product.findUnique({
          where: { id: targetProductId },
          include: { inventory: true, business: true },
        });
      }

      if (!product && (targetSku || data.sku)) {
        product = await prisma.product.findFirst({
          where: { sku: { equals: targetSku || data.sku, mode: 'insensitive' } },
          include: { inventory: true, business: true },
        });
      }

      if (user?.businessId) {
        buyerBusiness = await prisma.business.findUnique({
          where: { id: user.businessId },
          include: { agents: { where: { agentType: 'BUYER' } } },
        });
      }

      if (!buyerBusiness) {
        buyerBusiness = await prisma.business.findFirst({
          where: { businessType: 'RETAIL_ENTERPRISE' },
          include: { agents: { where: { agentType: 'BUYER' } } },
        });
      }

      if (buyerBusiness?.agents?.length) {
        buyerAgent = buyerBusiness.agents[0];
      }

      if (buyerBusiness && !buyerAgent) {
        try {
          buyerAgent = await prisma.agent.create({
            data: {
              businessId: buyerBusiness.id,
              name: `${buyerBusiness.name} Autonomous Agent`,
              agentType: 'BUYER',
              status: 'ACTIVE',
              modelProvider: 'Google-Gemini',
              modelName: 'gemini-2.0-flash',
              trustScore: 98.5,
              systemPrompt: `You are the autonomous procurement agent representing ${buyerBusiness.name}. Your objective is to negotiate optimal wholesale prices, strictly enforce delivery deadlines, reject hidden fees, and ensure human approval for settlements.`,
            },
          });
        } catch {}
      }
    } catch {}

    const unitCost = Number(product?.baseCostPrice || product?.minSellingPrice || product?.targetSellingPrice || 0);
    const parsedQuantity = Number(targetQuantity || 1);
    const estimatedTotalCost = Math.round(unitCost * parsedQuantity);
    const parsedMaxBudget = Number(maxBudget || (estimatedTotalCost > 0 ? Math.round(estimatedTotalCost * 1.1) : 50000));
    const parsedDeliveryHours = Number(maxDeliveryHours || 48);
    const parsedResaleMargin = Number(targetResaleMargin || 25);

    const title = `Procurement: ${parsedQuantity}x ${product?.name || 'Enterprise Items'}`;

    // CORE RULE: Search all registered sellers' active product catalogues.
    // Match products using exact SKU/product identity, and check product availability & stock >= targetQuantity
    const eligibleSellers = await findEligibleSellersForProduct({
      targetProductId: product?.id || targetProductId,
      targetSku: product?.sku || targetSku,
      targetQuantity: parsedQuantity,
      buyerBusinessId: buyerBusiness?.id,
    });

    const isEligibleFound = eligibleSellers.length > 0;
    const initialStatus = isEligibleFound ? 'INITIATED' : 'NO_ELIGIBLE_SELLERS';
    const initialSummary = isEligibleFound
      ? `Procurement RFQ solicited to ${eligibleSellers.length} eligible supplier(s) with confirmed stock for SKU [${product?.sku || targetSku}].`
      : `No eligible sellers found for this product: No registered supplier has [${product?.name || 'item'}] (SKU: ${product?.sku || targetSku}) with at least ${parsedQuantity} units in stock.`;

    const metadata = {
      targetProductId: product?.id || targetProductId,
      targetSku: product?.sku || targetSku,
      productName: product?.name,
      unitWholesaleCost: unitCost,
      estimatedTotalCost,
      maxBudget: parsedMaxBudget,
      targetQuantity: parsedQuantity,
      maxDeliveryHours: parsedDeliveryHours,
      targetResaleMargin: parsedResaleMargin,
      eligibleParticipants: eligibleSellers,
      noEligibleSellers: !isEligibleFound,
    };

    let negotiation = null;

    try {
      negotiation = await prisma.negotiation.create({
        data: {
          title,
          targetProductId: product?.id || targetProductId,
          buyerBusinessId: buyerBusiness?.id || user?.businessId,
          buyerAgentId: buyerAgent?.id,
          status: initialStatus,
          summary: initialSummary,
          maxBudget: parsedMaxBudget,
          maxDeliveryHours: parsedDeliveryHours,
          targetQuantity: parsedQuantity,
          targetResaleMargin: parsedResaleMargin,
          currentRound: isEligibleFound ? 1 : 0,
          metadata,
        },
        include: { targetProduct: true, buyerBusiness: true, buyerAgent: true },
      });

      // Record audit
      await prisma.auditLog.create({
        data: {
          entityType: 'NEGOTIATION',
          entityId: negotiation.id,
          action: isEligibleFound ? 'INITIATED' : 'NO_ELIGIBLE_SELLERS',
          actorType: user?.role ? 'HUMAN' : 'SYSTEM',
          actorId: user?.id || 'system-orchestrator',
          newState: { maxBudget: parsedMaxBudget, maxDeliveryHours: parsedDeliveryHours, targetQuantity: parsedQuantity, eligibleSellers: eligibleSellers.length },
          tamperProofHash: crypto.createHash('sha256').update(`${negotiation.id}-${initialStatus}-${Date.now()}`).digest('hex'),
        },
      });

      // If no eligible sellers found, do not broadcast RFQ or initiate rounds
      if (!isEligibleFound) {
        if (io) {
          io.emit('negotiation:created', { ...negotiation, eligibleParticipants: [] });
        }
        return { ...negotiation, eligibleParticipants: [] };
      }

      // Reserve inventory on target product
      if (product?.inventory) {
        await prisma.inventory.update({
          where: { id: product.inventory.id },
          data: { reservedQuantity: { increment: parsedQuantity } },
        });
      }

      // Initialize Multi-Agent Engine Session & Save Round 0 RFQ message ONLY for eligible sellers
      try {
        const engine = getNegotiationEngine(io);
        await engine.orchestrator.syncAgentsFromDatabase();
        const activeProd = {
          ...(product || {}),
          id: product?.id || targetProductId,
          name: product?.name || 'Enterprise Items',
          sku: product?.sku || targetSku || 'ELEC-GEN',
          baseCostPrice: unitCost,
          minSellingPrice: Number(product?.minSellingPrice || unitCost),
          targetSellingPrice: Number(product?.targetSellingPrice || (unitCost > 0 ? unitCost * 1.3 : parsedMaxBudget / parsedQuantity)),
        };
        const session = engine.orchestrator.initiateSession({
          negotiationId: negotiation.id,
          product: activeProd,
          quantity: parsedQuantity,
          constraints: {
            maxBudget: parsedMaxBudget,
            maxDeliveryHours: parsedDeliveryHours,
            targetResaleMargin: parsedResaleMargin,
          },
          buyerAgent: buyerAgent || { id: negotiation.buyerAgentId, name: `${buyerBusiness?.name || 'Enterprise'} Buyer Agent` },
          buyerBusiness: buyerBusiness || { id: negotiation.buyerBusinessId, name: buyerBusiness?.name || 'Enterprise Buyer' },
          eligibleParticipants: eligibleSellers,
        });

        // Save RFQ Message to database as Round 0
        if (session.messages?.length > 0) {
          const rfqMsg = session.messages[0];
          await prisma.agentMessage.create({
            data: {
              negotiationId: negotiation.id,
              agentId: buyerAgent?.id || negotiation.buyerAgentId,
              roundNumber: 0,
              senderRole: 'BUYER',
              content: rfqMsg.content,
              structuredProposal: rfqMsg.proposal || null,
              securityStatus: 'VERIFIED',
            },
          });
        }
      } catch (engineErr) {
        logger.warn(`Could not initialize engine session on RFQ creation: ${engineErr?.message}`);
      }
    } catch (err) {
      negotiation = {
        id: `neg-${Date.now()}`,
        title,
        targetProductId,
        targetQuantity: parsedQuantity,
        maxBudget: parsedMaxBudget,
        maxDeliveryHours: parsedDeliveryHours,
        targetResaleMargin: parsedResaleMargin,
        currentRound: isEligibleFound ? 1 : 0,
        status: initialStatus,
        summary: initialSummary,
        metadata,
        createdAt: new Date().toISOString(),
      };
    }

    if (io) {
      io.emit('negotiation:created', { ...negotiation, eligibleParticipants: eligibleSellers });
    }

    return { ...negotiation, eligibleParticipants: eligibleSellers };
  }

  static async advanceRound(negotiationId, currentRoundNumber = null, user = null, io = null) {
    const engine = getNegotiationEngine(io);

    let negotiation = null;
    try {
      negotiation = await prisma.negotiation.findUnique({
        where: { id: negotiationId },
        include: { targetProduct: true, buyerBusiness: true },
      });
    } catch {}

    if (negotiation && (negotiation.status === 'APPROVED' || negotiation.status === 'SETTLED')) {
      const err = new Error(`Negotiation room [${negotiationId}] is closed because the transaction has already been approved and settled.`);
      err.statusCode = 400;
      throw err;
    }

    const product = negotiation?.targetProduct || {
      id: 'prod-mock-1',
      sku: 'ELEC-RT-001',
      name: 'Enterprise Wi-Fi 6 Mesh Router',
      baseCostPrice: 3200,
      minSellingPrice: 3500,
      targetSellingPrice: 4200,
    };

    const quantity = Number(negotiation?.targetQuantity || 1);
    const constraints = {
      maxBudget: Number(negotiation?.maxBudget),
      maxDeliveryHours: Number(negotiation?.maxDeliveryHours || 48),
      targetResaleMargin: Number(negotiation?.targetResaleMargin || 25),
    };

    // Determine current completed round dynamically from database
    let lastCompletedRound = 0;
    try {
      const maxRound = await prisma.agentMessage.aggregate({
        where: { negotiationId, roundNumber: { gt: 0 } },
        _max: { roundNumber: true },
      });
      lastCompletedRound = maxRound?._max?.roundNumber || 0;
    } catch {}

    const roundToPass = (currentRoundNumber !== null && currentRoundNumber !== undefined && currentRoundNumber > 0)
      ? Math.max(0, currentRoundNumber - 1)
      : lastCompletedRound;

    // Execute through multi-agent engine
    const roundResult = await engine.advanceRound({
      negotiationId,
      product,
      quantity,
      currentRound: roundToPass,
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
        const msgRound = msg.roundNumber ?? nextRound;
        const role = msg.sender?.role || 'BUYER';
        const senderAgentId = msg.sender?.agentId || msg.agentId;
        const sender = (senderAgentId && (agentMap[senderAgentId] || dbAgents.find((a) => a.id === senderAgentId))) ||
          (role === 'BUYER' ? (negotiation?.buyerAgentId ? agentMap[negotiation.buyerAgentId] : agentMap['BUYER']) : agentMap[role]) ||
          dbAgents[0];

        if (sender) {
          const existing = await prisma.agentMessage.findFirst({
            where: {
              negotiationId,
              roundNumber: msgRound,
              agentId: sender.id,
            },
          });
          if (!existing) {
            let cleanContent = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
            cleanContent = cleanContent
              .replace(/```(?:json)?[\s\S]*?```/gi, '')
              .replace(/\{[\s\r\n]*"unitPrice"[\s\S]*?\}/gi, '')
              .replace(/\{[\s\r\n]*"intent"[\s\S]*?\}/gi, '')
              .replace(/\n{3,}/g, '\n\n')
              .trim();

            await prisma.agentMessage.create({
              data: {
                negotiationId,
                agentId: sender.id,
                roundNumber: msgRound,
                senderRole: role,
                content: cleanContent || (typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)),
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
        const seller = (offer.sellerAgentId && (agentMap[offer.sellerAgentId] || dbAgents.find((a) => a.id === offer.sellerAgentId))) ||
          agentMap[offer.sellerType] ||
          dbAgents[1];
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

      // If no offer was explicitly marked recommended yet convergence reached, pick highest utility clean offer strictly under budget
      if (!recommendedDbOffer && persistedOffers.length > 0) {
        const cleanOffers = persistedOffers.filter(
          (o) => !o.hiddenFeeDetected && o.status === 'PENDING' && o.sellerType !== 'SELLER_C_MALICIOUS' && o.totalPrice <= Number(negotiation.maxBudget)
        );
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
      const isConcluded = nextRound >= 3 || (!roundResult.convergence.continue && recommendedDbOffer);
      await prisma.negotiation.update({
        where: { id: negotiationId },
        data: {
          currentRound: nextRound,
          status: isConcluded ? 'PENDING_HUMAN_APPROVAL' : 'IN_PROGRESS',
          recommendedOfferId: recommendedDbOffer ? recommendedDbOffer.id : null,
        },
      });

      // Attach all messages from DB with agent-to-business relations to roundResult
      try {
        const allDbMessages = await prisma.agentMessage.findMany({
          where: { negotiationId },
          include: { agent: { include: { business: true } } },
          orderBy: { createdAt: 'asc' },
        });
        roundResult.messages = allDbMessages.map((m) => {
          const isBuyerMsg = m.senderRole === 'BUYER';
          return {
            ...m,
            sender: {
              agentId: m.agentId,
              role: m.senderRole,
              name: m.agent?.name || (isBuyerMsg ? negotiation?.buyerAgent?.name : null),
              businessId: m.agent?.businessId || (isBuyerMsg ? negotiation?.buyerBusinessId : null),
              businessName: m.agent?.business?.name || (isBuyerMsg ? negotiation?.buyerBusiness?.name : null),
            },
            proposal: m.structuredProposal || m.proposal,
          };
        });
      } catch {}

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
            mockUpiVpa: `${(seller?.business?.name || seller?.name || 'supplier').toLowerCase().replace(/[^a-z0-9]/g, '')}@icici`,
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

