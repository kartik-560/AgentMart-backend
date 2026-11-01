import { prisma } from '../config/prisma.js';
import { sendSuccess, sendError } from '../utils/response.js';

export async function getSellerDashboard(req, res, next) {
  try {
    const businessId = req.user?.businessId;
    if (!businessId) {
      return sendError(res, 'No business associated with this seller account', 400, 'InvalidAccountState');
    }

    let business = null;
    let agent = null;
    let products = [];
    let offers = [];
    let transactions = [];

    try {
      [business, agent, products, offers, transactions] = await Promise.all([
        prisma.business.findUnique({
          where: { id: businessId },
          include: { profile: true },
        }),
        prisma.agent.findFirst({
          where: { businessId },
        }),
        prisma.product.findMany({
          where: { businessId },
          include: { inventory: true },
          orderBy: { sku: 'asc' },
        }),
        prisma.offer.findMany({
          where: { sellerBusinessId: businessId },
          include: {
            negotiation: {
              include: { targetProduct: true, buyerBusiness: { select: { name: true } } },
            },
            product: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 30,
        }),
        prisma.transaction.findMany({
          where: { sellerBusinessId: businessId },
          include: {
            offer: { include: { product: true } },
            negotiation: { select: { id: true, title: true } },
            buyerBusiness: { select: { name: true } },
            approvedBy: { select: { name: true } },
          },
          orderBy: { createdAt: 'desc' },
        }),
      ]);
    } catch (dbErr) {
      console.warn('Seller dashboard DB fetch notice:', dbErr?.message);
    }

    const settledTx = transactions.filter((t) => t.settlementStatus === 'SETTLED');
    const pendingTx = transactions.filter((t) => t.settlementStatus === 'PENDING_APPROVAL');

    const totalRevenue = settledTx.reduce((acc, t) => acc + Number(t.settlementAmount || 0), 0);
    const totalInventoryUnits = products.reduce((acc, p) => acc + Number(p.inventory?.stockQuantity || 0), 0);
    const totalInventoryValue = products.reduce(
      (acc, p) => acc + Number(p.baseCostPrice || 0) * Number(p.inventory?.stockQuantity || 0),
      0
    );

    const metrics = {
      totalRevenue,
      settledDealsCount: settledTx.length,
      pendingDealsCount: pendingTx.length,
      totalOffersCount: offers.length,
      activeSkusCount: products.length,
      totalInventoryUnits,
      totalInventoryValue,
      trustScore: agent?.trustScore ? Number(agent.trustScore) : 95.0,
      leadTimeHours: business?.profile?.maxDeliveryHours || 24,
    };

    return sendSuccess(
      res,
      {
        business: business || { id: businessId, name: req.user.name },
        agent,
        metrics,
        recentOffers: offers,
        transactions,
        products,
      },
      'Seller dashboard telemetry retrieved'
    );
  } catch (error) {
    next(error);
  }
}

export async function getSellerInventory(req, res, next) {
  try {
    const businessId = req.user?.businessId;
    if (!businessId) {
      return sendError(res, 'No business associated with this seller account', 400, 'InvalidAccountState');
    }

    const products = await prisma.product.findMany({
      where: { businessId },
      include: { inventory: true },
      orderBy: { sku: 'asc' },
    });

    return sendSuccess(res, products, 'Seller inventory items retrieved');
  } catch (error) {
    next(error);
  }
}

export async function updateSellerStock(req, res, next) {
  try {
    const businessId = req.user?.businessId;
    const { productId } = req.params;
    const { stockQuantity, minThreshold } = req.body;

    const product = await prisma.product.findFirst({
      where: { id: productId, businessId },
      include: { inventory: true },
    });

    if (!product) {
      return sendError(res, 'Product not found or not owned by your business', 404, 'NotFound');
    }

    if (!product.inventory) {
      const newInv = await prisma.inventory.create({
        data: {
          productId: product.id,
          stockQuantity: Number(stockQuantity || 100),
          warehouseLocation: 'Zone A - Primary Distribution',
          minThreshold: Number(minThreshold || 15),
        },
      });
      return sendSuccess(res, newInv, 'Inventory stock initialized');
    }

    const updated = await prisma.inventory.update({
      where: { id: product.inventory.id },
      data: {
        ...(stockQuantity !== undefined && { stockQuantity: Number(stockQuantity) }),
        ...(minThreshold !== undefined && { minThreshold: Number(minThreshold) }),
      },
    });

    return sendSuccess(res, updated, 'Inventory stock level updated successfully');
  } catch (error) {
    next(error);
  }
}

export async function getSellerSettings(req, res, next) {
  try {
    const businessId = req.user?.businessId;
    if (!businessId) {
      return sendError(res, 'No business associated with this seller account', 400, 'InvalidAccountState');
    }

    const [business, agent, products] = await Promise.all([
      prisma.business.findUnique({
        where: { id: businessId },
        include: { profile: true },
      }),
      prisma.agent.findFirst({
        where: { businessId },
      }),
      prisma.product.findMany({
        where: { businessId },
        include: { inventory: true },
        orderBy: { sku: 'asc' },
      }),
    ]);

    if (!business) {
      return sendError(res, 'Business record not found', 404, 'NotFound');
    }

    const metadata = business.profile?.metadata || {};
    const agentConfig = agent?.configuration || {};
    const isAdversarial = agent?.agentType === 'SELLER_C_MALICIOUS';

    const businessSettings = {
      id: business.id,
      name: business.name,
      registrationNumber: business.registrationNumber,
      businessType: business.businessType,
      contactEmail: business.contactEmail,
      contactPhone: business.contactPhone || '',
      description: metadata.description || 'Enterprise supplier delivering verified goods through autonomous multi-agent procurement protocols.',
      maxDeliveryHours: business.profile?.maxDeliveryHours || 24,
      businessPolicies: metadata.businessPolicies || {
        returnPolicyDays: 7,
        warrantyPolicy: '1 Year Manufacturer Warranty',
        cancellationTerms: 'Free cancellation prior to warehouse fulfillment. Restocking fees apply thereafter.',
        paymentTerms: 'MOCK_UPI',
      },
    };

    const agentSettings = {
      id: agent?.id,
      name: agent?.name || 'Autonomous Selling Agent',
      agentType: agent?.agentType,
      modelProvider: agent?.modelProvider || 'Google-Gemini',
      modelName: agent?.modelName || 'gemini-2.0-flash',
      trustScore: agent?.trustScore ? Number(agent.trustScore) : 95.0,
      description: agentConfig.description || 'Autonomous quote negotiation agent powered by Gemini 2.0 Flash.',
      systemPrompt: agent?.systemPrompt || '',
      strategy: agentConfig.strategy || (agent?.agentType === 'SELLER_A_PRICE' ? 'AGGRESSIVE_DISCOUNT' : (agent?.agentType === 'SELLER_B_SPEED_QUALITY' ? 'PREMIUM_QUALITY' : 'ADVERSARIAL_SIMULATOR')),
      minProfitMargin: Number(agentConfig.minProfitMargin || 12.0),
      discountFlexibility: Number(agentConfig.discountFlexibility || 0.15),
      defaultDeliveryHours: Number(agentConfig.defaultDeliveryHours || 24),
      negotiationPreferences: agentConfig.negotiationPreferences || {
        autoCounter: true,
        targetPaymentMethod: 'MOCK_UPI',
        maxConcessionRounds: 3,
        prioritizeMarginOverVolume: false,
      },
      // Adversarial parameters (configured for Seller C)
      isAdversarial,
      hiddenFeeAmount: Number(agentConfig.hiddenFeeAmount ?? 12000),
      enablePromptInjection: agentConfig.enablePromptInjection ?? true,
      enableHiddenCharges: agentConfig.enableHiddenCharges ?? true,
      adversarialAttackType: agentConfig.adversarialAttackType || 'HIDDEN_LOGISTICS_SURCHARGE',
      customAdversarialNote: agentConfig.customAdversarialNote || 'Mandatory logistics handling fee applicable for rapid release.',
    };

    return sendSuccess(
      res,
      {
        business: businessSettings,
        agent: agentSettings,
        products,
        isAdversarial,
      },
      'Seller settings retrieved'
    );
  } catch (error) {
    next(error);
  }
}

export async function updateBusinessSettings(req, res, next) {
  try {
    const businessId = req.user?.businessId;
    if (!businessId) {
      return sendError(res, 'No business associated with this seller account', 400, 'InvalidAccountState');
    }

    const { name, contactPhone, description, maxDeliveryHours, businessPolicies } = req.body;

    if (name && name.trim().length < 2) {
      return sendError(res, 'Company name must be at least 2 characters', 400, 'ValidationError');
    }

    const existing = await prisma.business.findUnique({
      where: { id: businessId },
      include: { profile: true },
    });

    if (!existing) {
      return sendError(res, 'Business not found', 404, 'NotFound');
    }

    const currentMeta = (existing.profile?.metadata && typeof existing.profile.metadata === 'object')
      ? existing.profile.metadata
      : {};

    const updatedMeta = {
      ...currentMeta,
      ...(description !== undefined && { description }),
      ...(businessPolicies !== undefined && { businessPolicies }),
    };

    const updatedBusiness = await prisma.business.update({
      where: { id: businessId },
      data: {
        ...(name && { name: name.trim() }),
        ...(contactPhone !== undefined && { contactPhone: contactPhone.trim() }),
      },
    });

    const updatedProfile = await prisma.businessProfile.upsert({
      where: { businessId },
      create: {
        businessId,
        maxDeliveryHours: maxDeliveryHours ? Number(maxDeliveryHours) : 24,
        metadata: updatedMeta,
      },
      update: {
        ...(maxDeliveryHours !== undefined && { maxDeliveryHours: Number(maxDeliveryHours) }),
        metadata: updatedMeta,
      },
    });

    return sendSuccess(
      res,
      {
        ...updatedBusiness,
        profile: updatedProfile,
      },
      'Business configuration updated successfully'
    );
  } catch (error) {
    next(error);
  }
}

export async function updateAgentSettings(req, res, next) {
  try {
    const businessId = req.user?.businessId;
    if (!businessId) {
      return sendError(res, 'No business associated with this seller account', 400, 'InvalidAccountState');
    }

    const agent = await prisma.agent.findFirst({
      where: { businessId },
    });

    if (!agent) {
      return sendError(res, 'AI Agent not found for this seller business', 404, 'NotFound');
    }

    const {
      name,
      modelName,
      systemPrompt,
      description,
      strategy,
      minProfitMargin,
      negotiationPreferences,
      hiddenFeeAmount,
      enablePromptInjection,
      enableHiddenCharges,
      adversarialAttackType,
      customAdversarialNote,
    } = req.body;

    if (name && name.trim().length < 2) {
      return sendError(res, 'Agent name must be at least 2 characters', 400, 'ValidationError');
    }

    const currentConfig = (agent.configuration && typeof agent.configuration === 'object')
      ? agent.configuration
      : {};

    const updatedConfig = {
      ...currentConfig,
      ...(description !== undefined && { description }),
      ...(strategy !== undefined && { strategy }),
      ...(minProfitMargin !== undefined && { minProfitMargin: Number(minProfitMargin) }),
      ...(negotiationPreferences !== undefined && { negotiationPreferences }),
    };

    // If this is Seller C (adversarial simulator), record adversarial attack parameters
    if (agent.agentType === 'SELLER_C_MALICIOUS') {
      if (hiddenFeeAmount !== undefined) updatedConfig.hiddenFeeAmount = Number(hiddenFeeAmount);
      if (enablePromptInjection !== undefined) updatedConfig.enablePromptInjection = Boolean(enablePromptInjection);
      if (enableHiddenCharges !== undefined) updatedConfig.enableHiddenCharges = Boolean(enableHiddenCharges);
      if (adversarialAttackType !== undefined) updatedConfig.adversarialAttackType = adversarialAttackType;
      if (customAdversarialNote !== undefined) updatedConfig.customAdversarialNote = customAdversarialNote;
    }

    const updatedAgent = await prisma.agent.update({
      where: { id: agent.id },
      data: {
        ...(name && { name: name.trim() }),
        ...(modelName && { modelName }),
        ...(systemPrompt !== undefined && { systemPrompt }),
        configuration: updatedConfig,
      },
    });

    return sendSuccess(res, updatedAgent, 'AI Agent configuration updated successfully');
  } catch (error) {
    next(error);
  }
}

export async function updateProductPricing(req, res, next) {
  try {
    const businessId = req.user?.businessId;
    const { productId } = req.params;
    const { baseCostPrice, minSellingPrice, targetSellingPrice, typicalLeadTimeHours, description } = req.body;

    const product = await prisma.product.findFirst({
      where: { id: productId, businessId },
    });

    if (!product) {
      return sendError(res, 'Product not found or not owned by your business', 404, 'NotFound');
    }

    if (minSellingPrice !== undefined && targetSellingPrice !== undefined) {
      if (Number(minSellingPrice) > Number(targetSellingPrice)) {
        return sendError(res, 'Minimum acceptable price floor cannot exceed target wholesale selling price', 400, 'ValidationError');
      }
    }

    const updated = await prisma.product.update({
      where: { id: productId },
      data: {
        ...(baseCostPrice !== undefined && { baseCostPrice: Number(baseCostPrice) }),
        ...(minSellingPrice !== undefined && { minSellingPrice: Number(minSellingPrice) }),
        ...(targetSellingPrice !== undefined && { targetSellingPrice: Number(targetSellingPrice) }),
        ...(typicalLeadTimeHours !== undefined && { typicalLeadTimeHours: Number(typicalLeadTimeHours) }),
        ...(description !== undefined && { description }),
      },
      include: { inventory: true },
    });

    return sendSuccess(res, updated, 'Product pricing and SLA specifications updated successfully');
  } catch (error) {
    next(error);
  }
}
