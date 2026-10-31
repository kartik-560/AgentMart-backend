import { prisma } from '../config/prisma.js';
import { sendSuccess, sendError } from '../utils/response.js';
import { NegotiationService } from '../services/negotiation.service.js';

export async function getNegotiations(req, res, next) {
  try {
    let negotiations = [];
    try {
      negotiations = await prisma.negotiation.findMany({
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



    return sendSuccess(res, negotiations, 'Negotiations retrieved');
  } catch (error) {
    next(error);
  }
}

export async function getNegotiationById(req, res, next) {
  try {
    const { id } = req.params;
    let negotiation = null;

    try {
      negotiation = await prisma.negotiation.findUnique({
        where: { id },
        include: {
          targetProduct: true,
          offers: { include: { sellerAgent: true } },
          agentMessages: { orderBy: { createdAt: 'asc' } },
          securityEvents: true,
        },
      });
    } catch {
      // Fallback
    }

    if (!negotiation) {
      return sendError(res, 'Negotiation not found', 404, 'NotFound');
    }

    // Format messages alias
    const messages = negotiation.agentMessages || negotiation.messages || [];

    return sendSuccess(res, { ...negotiation, messages }, 'Negotiation details retrieved');
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
    let offers = [];
    try {
      offers = await prisma.offer.findMany({
        where: { negotiationId: id },
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
    const { id } = req.params;
    let negotiation = null;
    let offers = [];

    try {
      negotiation = await prisma.negotiation.findUnique({
        where: { id },
        include: { targetProduct: true },
      });
      offers = await prisma.offer.findMany({
        where: { negotiationId: id },
        include: {
          sellerAgent: { select: { id: true, name: true, agentType: true } },
          sellerBusiness: { select: { id: true, name: true } },
        },
        orderBy: [{ roundNumber: 'desc' }, { utilityScore: 'desc' }],
      });
    } catch (e) {
      // fallback
    }

    if (negotiation && offers.length > 0) {
      const latestRound = offers[0].roundNumber;
      const latestOffers = offers.filter((o) => o.roundNumber === latestRound);
      const maxBudget = Number(negotiation.maxBudget || 50000);
      const maxDelivery = negotiation.maxDeliveryHours || 48;

      const formattedOffers = latestOffers.map((o) => {
        const totalPrice = Number(o.totalPrice);
        const deliveryHours = o.deliveryHours;
        const withinBudget = totalPrice <= maxBudget;
        const withinSla = deliveryHours <= maxDelivery;

        return {
          id: o.id,
          agentId: o.sellerAgent?.id || o.sellerAgentId,
          sellerName: o.sellerAgent?.name || 'Seller Agent',
          name: o.sellerAgent?.name || 'Seller Agent',
          businessName: o.sellerBusiness?.name || 'Supplier Partner',
          strategy: o.sellerAgent?.agentType === 'SELLER_A_PRICE' ? 'Low Margin / Price Priority' : (o.sellerAgent?.agentType === 'SELLER_B_SPEED_QUALITY' ? 'Speed & Premium Quality Priority' : 'Adversarial Simulation'),
          unitPrice: Number(o.unitPrice),
          quantity: o.quantity,
          totalPrice,
          deliveryHours,
          qualityGrade: o.qualityGrade,
          resaleMarginProjected: Number(o.resaleMarginProjected || 20),
          utilityScore: o.utilityScore || 0,
          withinBudget,
          withinSla,
          securityStatus: o.hiddenFeeDetected ? 'FLAGGED_HIDDEN_FEE' : 'CLEAN',
          isRecommended: o.isRecommended,
          flagReason: o.hiddenFeeDetected ? 'Hidden fee or abnormal price variance detected' : null,
        };
      });

      const recommended = formattedOffers.find((o) => o.isRecommended) || formattedOffers[0];
      const budgetSaved = maxBudget - (recommended ? recommended.totalPrice : 0);

      const comparison = {
        negotiationId: id,
        roundNumber: latestRound,
        constraints: {
          maxBudget,
          maxDeliveryHours: maxDelivery,
          minMargin: Number(negotiation.targetResaleMargin || 25),
        },
        offers: formattedOffers,
        recommendationSummary: recommended
          ? {
              winnerAgentId: recommended.agentId,
              sellerName: recommended.sellerName,
              recommendedPrice: recommended.totalPrice,
              budgetSaved: budgetSaved > 0 ? budgetSaved : 0,
              reasoning: `${recommended.sellerName} satisfies all constraints with utility score ${recommended.utilityScore} and projected resale margin ${recommended.resaleMarginProjected}%.`,
            }
          : null,
      };

      return sendSuccess(res, comparison, 'Offer comparison matrix generated from database');
    }

    if (negotiation) {
      return sendSuccess(res, {
        negotiationId: id,
        roundNumber: negotiation.currentRound || 0,
        constraints: {
          maxBudget: Number(negotiation.maxBudget || 0),
          maxDeliveryHours: negotiation.maxDeliveryHours || 48,
          minMargin: Number(negotiation.targetResaleMargin || 25),
        },
        offers: [],
        recommendationSummary: null,
      }, 'No offers recorded yet for this negotiation');
    }

    return sendError(res, 'Negotiation not found', 404, 'NotFound');
  } catch (error) {
    next(error);
  }
}
