import { Router } from 'express';
import { getBusinessProfile, updateBusinessProfile } from '../controllers/business.controller.js';
import { validateRequest } from '../middleware/validateRequest.js';
import { updateBusinessProfileSchema } from '../modules/business/business.schema.js';

const router = Router();
router.get('/profile', getBusinessProfile);
router.put('/profile', validateRequest({ body: updateBusinessProfileSchema }), updateBusinessProfile);

export default router;

