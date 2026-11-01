import { prisma } from '../config/prisma.js';
import { sendSuccess, sendError } from '../utils/response.js';
import { NegotiationService } from '../services/negotiation.service.js';

export async function getNegotiations(req, res, next) {
  try {
    let negotiations = [];
    const user = req.user;
    let whereClause = {};

    if (user) {
      if (user.accountType === 'SELLER' || user.role === 'SUPPLIER_REP') {
        whereClause = {}; // Filter dynamically in post-query for metadata.eligibleParticipants
      } else if ((user.accountType === 'BUYER' || user.role === 'BUYER_OFFICER') && user.businessId) {
        whereClause = { buyerBusinessId: user.businessId };
      }
    }

    try {
      negotiations = await prisma.negotiation.findMany({
        where: whereClause,
        include: {
          targetProduct: true,
          buyerAgent: { select: { name: true, agentType: true } },
          offers: true,
        },
        orderBy: { createdAt: 'desc' },
      });
    } catch {
      // Fallback
    }

    if (user && (user.accountType === 'SELLER' || user.role === 'SUPPLIER_REP') && user.businessId) {
      negotiations = negotiations.filter((n) => {
        const hasOffer = n.offers?.some((o) => o.sellerBusinessId === user.businessId);
        const hasEligibility = n.metadata?.eligibleParticipants?.some((p) => p.businessId === user.businessId);
        return hasOffer || hasEligibility;
      });
    }

    return sendSuccess(res, negotiations, 'Negotiations retrieved');
  } catch (error) {
    next(error);
  }
}

export async function getNegotiationById(req, res, next) {
  try {
    const { id } = req.params;
    let negotiation = null;
    const isSeller = req.user?.accountType === 'SELLER' || req.user?.role === 'SUPPLIER_REP';
    const sellerBizId = req.user?.businessId;

    try {
      negotiation = await prisma.negotiation.findUnique({
        where: { id },
        include: {
          targetProduct: true,
          buyerBusiness: true,
          buyerAgent: true,
          offers: { include: { sellerAgent: true, sellerBusiness: true } },
          agentMessages: {
            include: { agent: { include: { business: true } } },
            orderBy: { createdAt: 'asc' },
          },
          securityEvents: true,
        },
      });
    } catch {
      // Fallback
    }

    if (!negotiation) {
      return sendError(res, 'Negotiation not found', 404, 'NotFound');
    }

    // Role-based data isolation: Seller can only see their own AI agent & conversation
    if (isSeller && sellerBizId) {
      let sellerAgent = null;
      try {
        sellerAgent = await prisma.agent.findFirst({
          where: { businessId: sellerBizId },
        });
      } catch {}

      const sellerRole = sellerAgent?.agentType;
      const sellerAgentId = sellerAgent?.id;

      // Filter offers: Seller ONLY sees their own offers
      negotiation.offers = (negotiation.offers || []).filter(
        (o) => o.sellerBusinessId === sellerBizId
      );

      // Filter messages: Seller ONLY sees Buyer RFQ / counters and messages between their own agent and Buyer
      // Competing sellers' messages are strictly stripped!
      negotiation.agentMessages = (negotiation.agentMessages || []).filter((m) => {
        if (m.senderRole === 'BUYER') {
          return true;
        }
        if (sellerAgentId && m.agentId === sellerAgentId) {
          return true;
        }
        if (sellerBizId && m.agent?.businessId === sellerBizId) {
          return true;
        }
        return false;
      });

      // Filter security events: Only show events regarding this seller's agent
      negotiation.securityEvents = (negotiation.securityEvents || []).filter(
        (e) => e.offendingAgentId === sellerAgentId
      );

      // Redact competitor recommendation
      if (negotiation.recommendedOfferId) {
        const isMine = negotiation.offers.some((o) => o.id === negotiation.recommendedOfferId);
        if (!isMine) {
          negotiation.recommendedOfferId = null;
          if (negotiation.status === 'DEAL_RECOMMENDED' || negotiation.status === 'PENDING_HUMAN_APPROVAL') {
            negotiation.summary = 'The procurement session concluded. Another supplier offer was recommended by the buyer agent.';
          }
        }
      }
    }

    // Format messages alias with rich sender profile
    const messages = (negotiation.agentMessages || []).map((m) => {
      const isBuyerMsg = m.senderRole === 'BUYER';
      const resolvedAgentName = m.agent?.name || (isBuyerMsg ? negotiation.buyerAgent?.name : null);
      const resolvedBizId = m.agent?.businessId || (isBuyerMsg ? negotiation.buyerBusinessId : null);
      const resolvedBizName = m.agent?.business?.name || (isBuyerMsg ? negotiation.buyerBusiness?.name : null);

      return {
        ...m,
        agentId: m.agentId,
        senderRole: m.senderRole,
        sender: {
          agentId: m.agentId,
          role: m.senderRole,
          name: resolvedAgentName,
          businessId: resolvedBizId,
          businessName: resolvedBizName,
        },
        proposal: m.structuredProposal || m.proposal,
      };
    });

    const eligibleParticipants = negotiation.metadata?.eligibleParticipants || [];
    let isEligible = true;
    let ineligibilityNotice = null;

    if (isSeller && sellerBizId) {
      isEligible = eligibleParticipants.some((p) => p.businessId === sellerBizId);
      if (!isEligible) {
        ineligibilityNotice = `Your organization is not eligible to participate in this negotiation: You do not have [${negotiation.targetProduct?.name || 'this product'}] (SKU: ${negotiation.targetProduct?.sku}) with at least ${negotiation.targetQuantity} available units in your product catalogue.`;
      }
    }

    return sendSuccess(
      res,
      { ...negotiation, messages, eligibleParticipants, isEligible, ineligibilityNotice },
      'Negotiation details retrieved'
    );
  } catch (error) {
    next(error);
  }
}

export async function createNegotiation(req, res, next) {
  try {
    const io = req.app.get('io');
    const result = await NegotiationService.createNegotiation(req.body, req.user, io);
    return sendSuccess(res, result, 'Negotiation session initialized', 201);
  } catch (error) {
    next(error);
  }
}

export async function advanceNegotiationRound(req, res, next) {
  try {
    const { id } = req.params;
    const { roundNumber } = req.body;
    const io = req.app.get('io');

    const result = await NegotiationService.advanceRound(id, roundNumber || 1, req.user, io);
    return sendSuccess(res, result, `Negotiation advanced to round ${result.nextRoundNumber}`);
  } catch (error) {
    next(error);
  }
}

export async function getOffersByNegotiationId(req, res, next) {
  try {
    const { id } = req.params;
    const isSeller = req.user?.accountType === 'SELLER' || req.user?.role === 'SUPPLIER_REP';
    const whereClause = { negotiationId: id };
    if (isSeller && req.user?.businessId) {
      whereClause.sellerBusinessId = req.user.businessId;
    }

    let offers = [];
    try {
      offers = await prisma.offer.findMany({
        where: whereClause,
        include: { sellerAgent: { select: { name: true, agentType: true } } },
        orderBy: { roundNumber: 'desc' },
      });
    } catch {}

    return sendSuccess(res, offers, 'Offers retrieved for negotiation');
  } catch (error) {
    next(error);
  }
}

export async function getOfferComparison(req, res, next) {
  try {
    const isSeller = req.user?.accountType === 'SELLER' || req.user?.role === 'SUPPLIER_REP';
    if (isSeller) {
      return sendError(
        res,
        'Access denied: Cross-supplier offer comparison is strictly restricted to authorized Buyer officers.',
        403,
        'Forbidden'
      );
    }

    const { id } = req.params;
    const offers = await prisma.offer.findMany({
      where: { negotiationId: id },
      include: {
        sellerAgent: { select: { name: true, agentType: true, trustScore: true } },
        product: true,
      },
      orderBy: { utilityScore: 'desc' },
    });

    return sendSuccess(res, offers, 'Offer comparison matrix retrieved');
  } catch (error) {
    next(error);
  }
}
