import { prisma } from '../config/prisma.js';
import { sendSuccess } from '../utils/response.js';

export async function getAgents(req, res, next) {
  try {
    let agents = [];
    try {
      agents = await prisma.agent.findMany({
        include: { business: { select: { name: true, businessType: true } } },
      });
    } catch {
      // Mock fallback
    }

    if (!agents.length) {
      agents = [
        {
          id: 'agent-buyer-1',
          name: 'Apex Autonomous Buyer (Gemini-2.0)',
          agentType: 'BUYER',
          status: 'ACTIVE',
          trustScore: 98.5,
          modelProvider: 'Google-Gemini',
          modelName: 'gemini-2.0-flash',
          business: { name: 'Apex Retail Enterprises', businessType: 'RETAIL_ENTERPRISE' },
        },
        {
          id: 'agent-seller-a',
          name: 'Prism PriceBot (Agent A)',
          agentType: 'SELLER_A_PRICE',
          status: 'ACTIVE',
          trustScore: 91.0,
          modelProvider: 'Google-Gemini',
          modelName: 'gemini-2.0-flash',
          business: { name: 'Prism Wholesale Direct', businessType: 'DISTRIBUTOR' },
        },
        {
          id: 'agent-seller-b',
          name: 'Swift CourierBot (Agent B)',
          agentType: 'SELLER_B_SPEED_QUALITY',
          status: 'ACTIVE',
          trustScore: 98.0,
          modelProvider: 'Google-Gemini',
          modelName: 'gemini-2.0-flash',
          business: { name: 'SwiftQuality Logistics', businessType: 'MANUFACTURER' },
        },
        {
          id: 'agent-seller-c',
          name: 'ShadowBot (Agent C - Adversarial Simulation)',
          agentType: 'SELLER_C_MALICIOUS',
          status: 'ACTIVE',
          trustScore: 42.0,
          modelProvider: 'Google-Gemini',
          modelName: 'gemini-2.0-flash',
          business: { name: 'Vortex Dynamic Trade', businessType: 'ECOMMERCE_OPERATOR' },
        },
      ];
    }

    return sendSuccess(res, agents, 'Agents retrieved');
  } catch (error) {
    next(error);
  }
}

export async function updateAgentStatus(req, res, next) {
  try {
    const { id } = req.params;
    const { status, reason } = req.body;

    let updated = null;
    try {
      updated = await prisma.agent.update({
        where: { id },
        data: { status },
      });
    } catch {
      updated = { id, status, reason: reason || 'Status modified by operator' };
    }

    return sendSuccess(res, updated, `Agent status updated to ${status}`);
  } catch (error) {
    next(error);
  }
}

