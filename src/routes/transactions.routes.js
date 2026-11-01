import { Router } from 'express';
import {
  getTransactions,
  getTransactionById,
  approveTransaction,
  rejectTransaction,
  createTransaction,
} from '../controllers/transactions.controller.js';
import { validateRequest } from '../middleware/validateRequest.js';
import { approveTransactionSchema, rejectTransactionSchema } from '../modules/transactions/transactions.schema.js';
import { authenticateToken, requireRole } from '../middleware/auth.middleware.js';

const router = Router();

// Require JWT authentication on all transactions endpoints
router.use(authenticateToken);

router.get('/', getTransactions);
router.post('/', requireRole('BUYER', 'BUYER_OFFICER'), createTransaction);
router.get('/:id', getTransactionById);
router.post('/:id/approve', requireRole('BUYER', 'BUYER_OFFICER'), validateRequest({ body: approveTransactionSchema }), approveTransaction);
router.post('/:id/reject', requireRole('BUYER', 'BUYER_OFFICER'), validateRequest({ body: rejectTransactionSchema }), rejectTransaction);

export default router;
