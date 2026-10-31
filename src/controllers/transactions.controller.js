import { prisma } from '../config/prisma.js';
import { sendSuccess, sendError } from '../utils/response.js';
import { BusinessMemoryEngine } from '../agent-engine/memory/business.memory.js';
import crypto from 'crypto';

export async function getTransactions(req, res, next) {
  try {
    let transactions = [];
    try {
      transactions = await prisma.transaction.findMany({
        include: {
          buyerBusiness: { select: { id: true, name: true, registrationNumber: true } },
          sellerBusiness: { select: { id: true, name: true, registrationNumber: true } },
          offer: {
            include: {
              product: true,
              sellerAgent: { select: { id: true, name: true, agentType: true } },
              sellerBusiness: true,
            },
          },
          negotiation: {
            include: {
              targetProduct: true,
              buyerBusiness: true,
              buyerAgent: { select: { id: true, name: true, agentType: true } },
            },
          },
          approvedBy: { select: { id: true, name: true, role: true } },
        },
        orderBy: { createdAt: 'desc' },
      });
    } catch {
      // Fallback
    }

    return sendSuccess(res, transactions, 'Transactions retrieved');
  } catch (error) {
    next(error);
  }
}

export async function getTransactionById(req, res, next) {
  try {
    const { id } = req.params;
    let tx = null;
    try {
      tx = await prisma.transaction.findUnique({
        where: { id },
        include: {
          offer: {
            include: {
              product: true,
              sellerAgent: { select: { id: true, name: true, agentType: true } },
              sellerBusiness: true,
            },
          },
          negotiation: {
            include: {
              targetProduct: true,
              buyerBusiness: true,
              buyerAgent: { select: { id: true, name: true, agentType: true } },
            },
          },
          buyerBusiness: true,
          sellerBusiness: true,
          approvedBy: { select: { id: true, name: true, role: true } },
        },
      });
    } catch {
      // Fallback
    }

    if (!tx) {
      return sendError(res, 'Transaction not found in database', 404, 'NotFound');
    }

    return sendSuccess(res, tx, 'Transaction retrieved');
  } catch (error) {
    next(error);
  }
}

export async function approveTransaction(req, res, next) {
  try {
    const { id } = req.params;
    const { approvedBy, approvalNotes, paymentMethod, payerVpa } = req.body;

    if (!approvedBy || approvedBy.trim().length < 2) {
      return sendError(res, 'Explicit human approval identifier is mandatory before settlement', 400, 'ApprovalRequired');
    }

    let existingTx = null;
    try {
      existingTx = await prisma.transaction.findUnique({
        where: { id },
        include: {
          offer: {
            include: {
              product: { include: { inventory: true } },
              sellerBusiness: true,
              sellerAgent: true,
            },
          },
          negotiation: {
            include: {
              targetProduct: true,
              buyerBusiness: true,
              buyerAgent: true,
            },
          },
          buyerBusiness: { include: { businessMemory: true } },
          sellerBusiness: true,
        },
      });
    } catch {}

    if (!existingTx) {
      return sendError(res, 'Transaction not found in database', 404, 'NotFound');
    }

    // Duplicate settlement protection
    if (existingTx.settlementStatus === 'SETTLED') {
      return sendError(res, 'Transaction is already settled. Duplicate settlement is strictly prohibited.', 409, 'DuplicateSettlementError');
    }

    if (existingTx.settlementStatus === 'REJECTED') {
      return sendError(res, 'Transaction was rejected and cannot be settled.', 400, 'InvalidTransactionState');
    }

    const mockUpiRef = `UPI-TXN-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const settledAt = new Date();
    const tamperProofHash = crypto
      .createHash('sha256')
      .update(`${id}-${mockUpiRef}-${settledAt.toISOString()}-${existingTx.settlementAmount}`)
      .digest('hex');

    const settledRecord = await prisma.transaction.update({
      where: { id },
      data: {
        settlementStatus: 'SETTLED',
        approverSignature: approvedBy,
        approvedAt: settledAt,
        approvalNotes: approvalNotes || 'Authorized within deterministic threshold',
        mockUpiReference: mockUpiRef,
        mockUpiVpa: payerVpa || existingTx.mockUpiVpa || 'apexenterprise@hdfcbank',
        settledAt,
        tamperProofHash,
      },
      include: {
        buyerBusiness: true,
        sellerBusiness: true,
        offer: {
          include: {
            product: true,
            sellerAgent: true,
            sellerBusiness: true,
          },
        },
        negotiation: {
          include: {
            targetProduct: true,
            buyerBusiness: true,
            buyerAgent: true,
          },
        },
      },
    });

    // Deduct inventory
    if (existingTx?.offer?.product?.inventory) {
      const inv = existingTx.offer.product.inventory;
      const qty = existingTx.offer.quantity;
      await prisma.inventory.update({
        where: { id: inv.id },
        data: {
          stockQuantity: Math.max(0, inv.stockQuantity - qty),
          reservedQuantity: Math.max(0, inv.reservedQuantity - qty),
        },
      });
    }

    // Update Negotiation status to APPROVED
    if (existingTx.negotiationId) {
      try {
        await prisma.negotiation.update({
          where: { id: existingTx.negotiationId },
          data: { status: 'APPROVED', recommendedOfferId: existingTx.offerId },
        });
      } catch {}
    }

    // Update Offer status to ACCEPTED
    if (existingTx.offerId) {
      try {
        await prisma.offer.update({
          where: { id: existingTx.offerId },
          data: { status: 'ACCEPTED' },
        });
      } catch {}
    }

    // Record Business Memory outcome
    if (existingTx?.buyerBusiness?.businessMemory) {
      const mem = existingTx.buyerBusiness.businessMemory;
      const updatedMem = BusinessMemoryEngine.recordTransactionOutcome(mem, {
        supplierKey: existingTx.offer?.sellerAgent?.agentType || 'seller-a-price',
        wasSuccessful: true,
        onTime: true,
        hiddenFeeDetected: false,
        actualMargin: Number(existingTx.offer?.resaleMarginProjected || 24.5),
      });

      await prisma.businessMemory.update({
        where: { id: mem.id },
        data: {
          totalTransactions: updatedMem.totalTransactions,
          successfulDeals: updatedMem.successfulDeals,
          supplierReliability: updatedMem.supplierReliability,
          recommendedPolicies: updatedMem.recommendedPolicies,
        },
      });
    }

    // Record immutable audit log
    await prisma.auditLog.create({
      data: {
        entityType: 'TRANSACTION',
        entityId: id,
        action: 'SETTLED',
        actorType: 'HUMAN',
        actorId: approvedBy,
        previousState: { status: 'PENDING_APPROVAL' },
        newState: {
          status: 'SETTLED',
          mockUpiReference: mockUpiRef,
          amount: Number(existingTx.settlementAmount),
          settledAt: settledAt.toISOString(),
        },
        tamperProofHash,
      },
    });

    // Emit live confirmation event via Socket.IO
    const io = req.app.get('io');
    if (io) {
      io.emit('transaction:settled', settledRecord);
    }

    return sendSuccess(res, settledRecord, 'Transaction successfully approved and settled via Mock UPI');
  } catch (error) {
    next(error);
  }
}

export async function rejectTransaction(req, res, next) {
  try {
    const { id } = req.params;
    const { rejectedBy, rejectionReason } = req.body;

    const existingTx = await prisma.transaction.findUnique({
      where: { id },
      include: {
        offer: { include: { product: { include: { inventory: true } } } },
      },
    });

    if (!existingTx) {
      return sendError(res, 'Transaction not found in database', 404, 'NotFound');
    }

    if (existingTx.settlementStatus === 'SETTLED') {
      return sendError(res, 'Cannot reject an already settled transaction', 400, 'InvalidTransactionState');
    }

    if (existingTx.settlementStatus === 'REJECTED') {
      return sendError(res, 'Transaction has already been rejected', 400, 'InvalidTransactionState');
    }

    const rejectedRecord = await prisma.transaction.update({
      where: { id },
      data: {
        settlementStatus: 'REJECTED',
        rejectionReason: rejectionReason || 'Rejected by human operator',
      },
      include: {
        buyerBusiness: true,
        sellerBusiness: true,
        offer: {
          include: {
            product: true,
            sellerAgent: true,
            sellerBusiness: true,
          },
        },
        negotiation: {
          include: {
            targetProduct: true,
            buyerBusiness: true,
            buyerAgent: true,
          },
        },
      },
    });

    // Release inventory if offer exists
    if (existingTx.offer?.product?.inventory) {
      await prisma.inventory.update({
        where: { id: existingTx.offer.product.inventory.id },
        data: {
          reservedQuantity: Math.max(0, existingTx.offer.product.inventory.reservedQuantity - existingTx.offer.quantity),
        },
      });
    }

    // Update Negotiation status to REJECTED
    if (existingTx.negotiationId) {
      try {
        await prisma.negotiation.update({
          where: { id: existingTx.negotiationId },
          data: { status: 'REJECTED' },
        });
      } catch {}
    }

    // Update Offer status to REJECTED
    if (existingTx.offerId) {
      try {
        await prisma.offer.update({
          where: { id: existingTx.offerId },
          data: { status: 'REJECTED', rejectionReason: rejectionReason || 'Rejected by human operator' },
        });
      } catch {}
    }

    await prisma.auditLog.create({
      data: {
        entityType: 'TRANSACTION',
        entityId: id,
        action: 'REJECTED',
        actorType: 'HUMAN',
        actorId: rejectedBy || 'operator',
        previousState: { status: existingTx.settlementStatus },
        newState: { status: 'REJECTED', reason: rejectionReason },
      },
    });

    const io = req.app.get('io');
    if (io) {
      io.emit('transaction:rejected', rejectedRecord);
    }

    return sendSuccess(res, rejectedRecord, 'Transaction rejected by human operator');
  } catch (error) {
    next(error);
  }
}

export async function createTransaction(req, res, next) {
  try {
    const { negotiationId, offerId } = req.body;
    if (!negotiationId && !offerId) {
      return sendError(res, 'Either negotiationId or offerId is required', 400, 'ValidationError');
    }

    let targetOffer = null;

    if (offerId) {
      targetOffer = await prisma.offer.findUnique({
        where: { id: offerId },
        include: {
          product: true,
          sellerBusiness: true,
          sellerAgent: true,
          negotiation: {
            include: {
              targetProduct: true,
              buyerBusiness: true,
              buyerAgent: true,
            },
          },
        },
      });
      if (!targetOffer) {
        return sendError(res, `Offer ${offerId} not found`, 404, 'OfferNotFound');
      }
    } else if (negotiationId) {
      // Find the winning/recommended offer or highest utility offer from the latest round
      targetOffer = await prisma.offer.findFirst({
        where: { negotiationId, isRecommended: true },
        orderBy: { roundNumber: 'desc' },
        include: {
          product: true,
          sellerBusiness: true,
          sellerAgent: true,
          negotiation: {
            include: {
              targetProduct: true,
              buyerBusiness: true,
              buyerAgent: true,
            },
          },
        },
      });

      if (!targetOffer) {
        targetOffer = await prisma.offer.findFirst({
          where: { negotiationId },
          orderBy: [{ roundNumber: 'desc' }, { utilityScore: 'desc' }],
          include: {
            product: true,
            sellerBusiness: true,
            sellerAgent: true,
            negotiation: {
              include: {
                targetProduct: true,
                buyerBusiness: true,
                buyerAgent: true,
              },
            },
          },
        });
      }

      if (!targetOffer) {
        return sendError(res, `No offers found for negotiation ${negotiationId}`, 404, 'OfferNotFound');
      }
    }

    // Check if a transaction ALREADY exists for this exact offerId
    let existingTx = await prisma.transaction.findUnique({
      where: { offerId: targetOffer.id },
      include: {
        buyerBusiness: true,
        sellerBusiness: true,
        offer: {
          include: {
            product: true,
            sellerAgent: true,
            sellerBusiness: true,
          },
        },
        negotiation: {
          include: {
            targetProduct: true,
            buyerBusiness: true,
            buyerAgent: true,
          },
        },
        approvedBy: { select: { id: true, name: true, role: true } },
      },
    });

    if (existingTx) {
      return sendSuccess(res, existingTx, 'Existing transaction retrieved for selected offer', 200);
    }

    const negotiation = targetOffer.negotiation;
    const buyerBusinessId = negotiation?.buyerBusinessId || targetOffer.sellerBusinessId;
    const sellerBusinessId = targetOffer.sellerBusinessId;
    const settlementAmount = targetOffer.totalPrice;

    // Build realistic seller VPA from seller details
    const sellerCleanName = (targetOffer.sellerBusiness?.name || 'supplier').toLowerCase().replace(/[^a-z0-9]/g, '');
    const destinationVpa = targetOffer.sellerBusiness?.contactEmail || `${sellerCleanName}@icici`;

    const newTx = await prisma.transaction.create({
      data: {
        negotiationId: targetOffer.negotiationId,
        offerId: targetOffer.id,
        buyerBusinessId,
        sellerBusinessId,
        settlementAmount,
        currency: 'INR',
        paymentMethod: targetOffer.paymentTerms || 'MOCK_UPI',
        settlementStatus: 'PENDING_APPROVAL',
        humanApprovalRequired: true,
        mockUpiVpa: destinationVpa,
      },
      include: {
        buyerBusiness: true,
        sellerBusiness: true,
        offer: {
          include: {
            product: true,
            sellerAgent: true,
            sellerBusiness: true,
          },
        },
        negotiation: {
          include: {
            targetProduct: true,
            buyerBusiness: true,
            buyerAgent: true,
          },
        },
      },
    });

    // Write audit log
    try {
      await prisma.auditLog.create({
        data: {
          entityType: 'TRANSACTION',
          entityId: newTx.id,
          action: 'CREATED',
          actorType: 'SYSTEM',
          actorId: targetOffer.sellerAgentId || 'system-orchestrator',
          newState: {
            transactionId: newTx.id,
            negotiationId: newTx.negotiationId,
            offerId: newTx.offerId,
            settlementAmount: Number(newTx.settlementAmount),
            settlementStatus: newTx.settlementStatus,
          },
          metadata: {
            sellerBusinessId: newTx.sellerBusinessId,
            buyerBusinessId: newTx.buyerBusinessId,
            offerTotalPrice: Number(targetOffer.totalPrice),
          },
        },
      });
    } catch (auditErr) {
      console.warn('AuditLog creation notice:', auditErr?.message);
    }

    const io = req.app.get('io');
    if (io) {
      io.emit('transaction:approval_requested', newTx);
    }

    return sendSuccess(res, newTx, 'Pending transaction created for human approval', 201);
  } catch (error) {
    next(error);
  }
}
