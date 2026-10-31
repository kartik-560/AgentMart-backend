import { z } from 'zod';

export const approveTransactionSchema = z.object({
  approvedBy: z.string().min(2, 'Human approver identifier is required'),
  approvalNotes: z.string().optional(),
  paymentMethod: z.enum(['MOCK_UPI', 'ESCROW']).default('MOCK_UPI'),
  payerVpa: z.string().min(5).default('apexenterprise@hdfcbank'),
});

export const rejectTransactionSchema = z.object({
  rejectedBy: z.string().min(2),
  rejectionReason: z.string().min(5, 'Rejection reason is required'),
});

