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

const router = Router();
router.get('/', getTransactions);
router.post('/', createTransaction);
router.get('/:id', getTransactionById);
router.post('/:id/approve', validateRequest({ body: approveTransactionSchema }), approveTransaction);
router.post('/:id/reject', validateRequest({ body: rejectTransactionSchema }), rejectTransaction);

export default router;
