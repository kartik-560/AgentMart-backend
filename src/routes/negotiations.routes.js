import { Router } from 'express';
import {
  getNegotiations,
  getNegotiationById,
  createNegotiation,
  advanceNegotiationRound,
  getOfferComparison,
  getOffersByNegotiationId,
} from '../controllers/negotiations.controller.js';
import { validateRequest } from '../middleware/validateRequest.js';
import { createNegotiationSchema, advanceRoundSchema } from '../modules/negotiations/negotiations.schema.js';
import { authenticateToken, requireRole } from '../middleware/auth.middleware.js';

const router = Router();

// Protect all negotiation endpoints with JWT authentication
router.use(authenticateToken);

router.get('/', getNegotiations);
router.post('/', requireRole('BUYER', 'BUYER_OFFICER'), validateRequest({ body: createNegotiationSchema }), createNegotiation);
router.get('/:id', getNegotiationById);
router.get('/:id/offers', getOffersByNegotiationId);
router.post('/:id/advance-round', requireRole('BUYER', 'BUYER_OFFICER'), validateRequest({ body: advanceRoundSchema }), advanceNegotiationRound);
router.post('/:id/advance', requireRole('BUYER', 'BUYER_OFFICER'), validateRequest({ body: advanceRoundSchema }), advanceNegotiationRound);
router.get('/:id/comparison', getOfferComparison);

export default router;
