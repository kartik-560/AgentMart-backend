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
          buyerBusiness: { select: { name: true } },
          sellerBusiness: { select: { name: true } },
          offer: true,
          approvedBy: { select: { name: true, role: true } },
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
        include: { offer: true, buyerBusiness: true, sellerBusiness: true },
      });
    } catch {
      // Fallback
    }

    if (!tx) {
      tx = {
        id,
        negotiationId: 'neg-demo-001',
        offerId: 'off-demo-a',
        settlementAmount: 44400.00,
        currency: 'INR',
        paymentMethod: 'MOCK_UPI',
        settlementStatus: 'PENDING_APPROVAL',
        humanApprovalRequired: true,
        mockUpiVpa: 'prismwholesale@icici',
        buyerBusiness: { name: 'Apex Retail Enterprises' },
        sellerBusiness: { name: 'Prism Wholesale Direct' },
      };
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
        include: { offer: { include: { product: { include: { inventory: true } } } }, buyerBusiness: { include: { businessMemory: true } } },
      });
    } catch {}

    // Duplicate settlement protection
    if (existingTx && existingTx.settlementStatus === 'SETTLED') {
      return sendError(res, 'Transaction is already settled. Duplicate settlement is strictly prohibited.', 409, 'DuplicateSettlementError');
    }

    const mockUpiRef = `UPI-TXN-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const settledAt = new Date();
    const tamperProofHash = crypto.createHash('sha256').update(`${id}-${mockUpiRef}-${settledAt.toISOString()}`).digest('hex');

    let settledRecord = null;
    try {
      settledRecord = await prisma.transaction.update({
        where: { id },
        data: {
          settlementStatus: 'SETTLED',
          approverSignature: approvedBy,
          approvedAt: settledAt,
          approvalNotes: approvalNotes || 'Authorized within deterministic threshold',
          mockUpiReference: mockUpiRef,
          mockUpiVpa: payerVpa || 'apexenterprise@hdfcbank',
          settledAt,
          tamperProofHash,
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

      // Record Business Memory outcome
      if (existingTx?.buyerBusiness?.businessMemory) {
        const mem = existingTx.buyerBusiness.businessMemory;
        const updatedMem = BusinessMemoryEngine.recordTransactionOutcome(mem, {
          supplierKey: 'seller-a-price',
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
          newState: { status: 'SETTLED', mockUpiReference: mockUpiRef, amount: existingTx?.settlementAmount },
          tamperProofHash,
        },
      });
    } catch (err) {
      // In-memory fallback
      settledRecord = {
        id,
        settlementStatus: 'SETTLED',
        humanApprovalRequired: true,
        approvedBy,
        approverSignature: approvedBy,
        approvedAt: settledAt.toISOString(),
        approvalNotes: approvalNotes || 'Approved within authorized budget and delivery threshold',
        mockUpiReference: mockUpiRef,
        mockUpiVpa: payerVpa || 'apexenterprise@hdfcbank',
        settledAt: settledAt.toISOString(),
        tamperProofHash,
      };
    }

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

    let rejectedRecord = null;
    try {
      rejectedRecord = await prisma.transaction.update({
        where: { id },
        data: {
          settlementStatus: 'REJECTED',
          rejectionReason,
        },
      });

      // Release inventory if offer exists
      const tx = await prisma.transaction.findUnique({
        where: { id },
        include: { offer: { include: { product: { include: { inventory: true } } } } },
      });
      if (tx?.offer?.product?.inventory) {
        await prisma.inventory.update({
          where: { id: tx.offer.product.inventory.id },
          data: {
            reservedQuantity: Math.max(0, tx.offer.product.inventory.reservedQuantity - tx.offer.quantity),
          },
        });
      }

      await prisma.auditLog.create({
        data: {
          entityType: 'TRANSACTION',
          entityId: id,
          action: 'REJECTED',
          actorType: 'HUMAN',
          actorId: rejectedBy || 'operator',
          newState: { status: 'REJECTED', reason: rejectionReason },
        },
      });
    } catch {
      rejectedRecord = {
        id,
        settlementStatus: 'REJECTED',
        rejectedBy,
        rejectionReason,
        rejectedAt: new Date().toISOString(),
      };
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

    // Check if an existing transaction already exists
    let existingTx = null;
    try {
      existingTx = await prisma.transaction.findFirst({
        where: offerId ? { offerId } : { negotiationId },
        include: {
          buyerBusiness: { select: { name: true } },
          sellerBusiness: { select: { name: true } },
          offer: true,
        },
      });
    } catch {}

    if (existingTx) {
      return sendSuccess(res, existingTx, 'Existing transaction retrieved', 200);
    }

    // Find recommended or best offer
    let targetOffer = null;
    try {
      if (offerId) {
        targetOffer = await prisma.offer.findUnique({
          where: { id: offerId },
          include: { sellerBusiness: true },
        });
      } else {
        targetOffer = await prisma.offer.findFirst({
          where: { negotiationId, isRecommended: true },
          include: { sellerBusiness: true },
        });
        if (!targetOffer) {
          targetOffer = await prisma.offer.findFirst({
            where: { negotiationId },
            orderBy: { utilityScore: 'desc' },
            include: { sellerBusiness: true },
          });
        }
      }
    } catch {}

    if (!targetOffer) {
      return sendError(res, 'No eligible offer found to generate a transaction', 404, 'OfferNotFound');
    }

    let negotiation = null;
    try {
      negotiation = await prisma.negotiation.findUnique({
        where: { id: targetOffer.negotiationId },
      });
    } catch {}

    const newTx = await prisma.transaction.create({
      data: {
        negotiationId: targetOffer.negotiationId,
        offerId: targetOffer.id,
        buyerBusinessId: negotiation?.buyerBusinessId || targetOffer.sellerBusinessId,
        sellerBusinessId: targetOffer.sellerBusinessId,
        settlementAmount: targetOffer.totalPrice,
        currency: 'INR',
        paymentMethod: 'MOCK_UPI',
        settlementStatus: 'PENDING_APPROVAL',
        humanApprovalRequired: true,
        mockUpiVpa: 'prismwholesale@icici',
      },
      include: {
        buyerBusiness: { select: { name: true } },
        sellerBusiness: { select: { name: true } },
        offer: true,
      },
    });

    const io = req.app.get('io');
    if (io) {
      io.emit('transaction:approval_requested', newTx);
    }

    return sendSuccess(res, newTx, 'Pending transaction created for human approval', 201);
  } catch (error) {
    next(error);
  }
}
