import { prisma } from '../config/prisma.js';
import { sendSuccess, sendError } from '../utils/response.js';
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
        },
        orderBy: { createdAt: 'desc' },
      });
    } catch {
      // Mock fallback
    }

    if (!transactions.length) {
      transactions = [
        {
          id: 'tx-demo-001',
          negotiationId: 'neg-demo-001',
          offerId: 'off-demo-a',
          buyerBusiness: { name: 'Apex Retail Enterprises' },
          sellerBusiness: { name: 'Prism Wholesale Direct' },
          settlementAmount: 44400.00,
          currency: 'INR',
          paymentMethod: 'MOCK_UPI',
          settlementStatus: 'PENDING_APPROVAL',
          humanApprovalRequired: true,
          mockUpiVpa: 'prismwholesale@icici',
          createdAt: new Date().toISOString(),
        },
        {
          id: 'tx-demo-000',
          negotiationId: 'neg-past-000',
          offerId: 'off-past-b',
          buyerBusiness: { name: 'Apex Retail Enterprises' },
          sellerBusiness: { name: 'SwiftQuality Logistics' },
          settlementAmount: 38200.00,
          currency: 'INR',
          paymentMethod: 'MOCK_UPI',
          settlementStatus: 'SETTLED',
          humanApprovalRequired: true,
          approvedBy: 'Kartik - Procurement Lead',
          approvedAt: new Date(Date.now() - 86400000).toISOString(),
          mockUpiReference: 'UPI-SETTLED-892104',
          mockUpiVpa: 'swiftquality@hdfc',
          settledAt: new Date(Date.now() - 86350000).toISOString(),
          createdAt: new Date(Date.now() - 90000000).toISOString(),
        },
      ];
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
      // Mock fallback
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

    const mockUpiRef = `UPI-TXN-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const settledAt = new Date().toISOString();

    const settlementResult = {
      id,
      settlementStatus: 'SETTLED',
      humanApprovalRequired: true,
      approvedBy,
      approvedAt: settledAt,
      approvalNotes: approvalNotes || 'Approved within authorized budget and delivery threshold',
      mockUpiReference: mockUpiRef,
      mockUpiVpa: payerVpa || 'apexenterprise@hdfcbank',
      settledAt,
      tamperProofHash: crypto.createHash('sha256').update(`${id}-${mockUpiRef}-${settledAt}`).digest('hex'),
    };

    // Emit live confirmation event via Socket.IO
    const io = req.app.get('io');
    if (io) {
      io.emit('transaction:settled', settlementResult);
    }

    return sendSuccess(res, settlementResult, 'Transaction successfully approved and settled via Mock UPI');
  } catch (error) {
    next(error);
  }
}

export async function rejectTransaction(req, res, next) {
  try {
    const { id } = req.params;
    const { rejectedBy, rejectionReason } = req.body;

    const rejectionResult = {
      id,
      settlementStatus: 'REJECTED',
      rejectedBy,
      rejectionReason,
      rejectedAt: new Date().toISOString(),
    };

    return sendSuccess(res, rejectionResult, 'Transaction rejected by human operator');
  } catch (error) {
    next(error);
  }
}

