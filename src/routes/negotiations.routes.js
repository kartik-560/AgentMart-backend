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

const router = Router();
router.get('/', getNegotiations);
router.post('/', validateRequest({ body: createNegotiationSchema }), createNegotiation);
router.get('/:id', getNegotiationById);
router.get('/:id/offers', getOffersByNegotiationId);
router.post('/:id/advance-round', validateRequest({ body: advanceRoundSchema }), advanceNegotiationRound);
router.get('/:id/comparison', getOfferComparison);

export default router;
