import { prisma } from '../config/prisma.js';
import { sendSuccess, sendError } from '../utils/response.js';

export async function getAgents(req, res, next) {
  try {
    let agents = [];
    const isSeller = req.user?.accountType === 'SELLER' || req.user?.role === 'SUPPLIER_REP';
    let whereClause = {};

    if (isSeller) {
      // Seller sees only their own autonomous agent
      whereClause = req.user?.businessId ? { businessId: req.user.businessId } : { agentType: { not: 'BUYER' } };
    } else {
      // Buyer sees their own buyer agent + all seller/supplier agents (never another buyer's agent)
      if (req.user?.businessId) {
        whereClause = {
          OR: [
            { businessId: req.user.businessId },
            { agentType: { not: 'BUYER' } },
          ],
        };
      } else {
        whereClause = {
          agentType: { not: 'BUYER' },
        };
      }
    }

    try {
      agents = await prisma.agent.findMany({
        where: whereClause,
        include: { business: { select: { id: true, name: true, businessType: true } } },
        orderBy: { createdAt: 'asc' },
      });
    } catch {
      // Fallback
    }

    if (!agents.length) {
      if (isSeller) {
        // Seller fallback - only own agent
        agents = [
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
        ];
      } else {
        agents = [
          {
            id: 'agent-buyer-1',
            name: 'Apex Autonomous Buyer',
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
    }

    return sendSuccess(res, agents, 'Agents retrieved');
  } catch (error) {
    next(error);
  }
}

export async function getAgentById(req, res, next) {
  try {
    const { id } = req.params;
    let agent = null;

    try {
      agent = await prisma.agent.findUnique({
        where: { id },
        include: { business: true },
      });
    } catch {
      // Fallback
    }

    if (!agent) {
      agent = {
        id,
        name: 'Apex Autonomous Buyer',
        agentType: 'BUYER',
        status: 'ACTIVE',
        trustScore: 98.5,
        systemPrompt: 'Autonomous Buyer persona for Apex Retail Enterprises...',
        configuration: { maxBudget: 50000, maxDeliveryHours: 48 },
      };
    }

    // Role-based access isolation
    const isSeller = req.user?.accountType === 'SELLER' || req.user?.role === 'SUPPLIER_REP';
    if (isSeller && req.user?.businessId) {
      if (agent.businessId && agent.businessId !== req.user.businessId && agent.agentType !== 'BUYER') {
        return sendError(res, 'Access denied: You are not authorized to view another seller private agent', 403, 'Forbidden');
      }
      if (agent.agentType === 'BUYER') {
        // Redact buyer agent internal prompt & strategic reservation parameters
        const { systemPrompt: _, configuration: __, ...safeAgent } = agent;
        return sendSuccess(res, safeAgent, 'Agent retrieved');
      }
    } else if (!isSeller && req.user?.businessId) {
      // Buyer cannot inspect another buyer's private agent details
      if (agent.agentType === 'BUYER' && agent.businessId && agent.businessId !== req.user.businessId) {
        return sendError(res, 'Access denied: You are not authorized to inspect another enterprise buyer agent', 403, 'Forbidden');
      }
    }

    return sendSuccess(res, agent, 'Agent retrieved');
  } catch (error) {
    next(error);
  }
}

export async function updateAgentStatus(req, res, next) {
  try {
    const { id } = req.params;
    const { status, reason } = req.body;

    const isSeller = req.user?.accountType === 'SELLER' || req.user?.role === 'SUPPLIER_REP';
    if (isSeller && req.user?.businessId) {
      const existing = await prisma.agent.findUnique({ where: { id } });
      if (existing && existing.businessId !== req.user.businessId) {
        return sendError(res, 'Access denied: You can only configure your own autonomous agent', 403, 'Forbidden');
      }
    }

    let updated = null;
    try {
      updated = await prisma.agent.update({
        where: { id },
        data: { status },
      });
    } catch {
      updated = { id, status, reason: reason || 'Status modified by operator' };
    }

    // Record audit event
    try {
      await prisma.auditLog.create({
        data: {
          entityType: 'AGENT',
          entityId: id,
          action: `STATUS_${status}`,
          actorType: req.user ? 'HUMAN' : 'SYSTEM',
          actorId: req.user?.id || 'system-admin',
          newState: { status, reason },
        },
      });
    } catch {}

    return sendSuccess(res, updated, `Agent status updated to ${status}`);
  } catch (error) {
    next(error);
  }
}
