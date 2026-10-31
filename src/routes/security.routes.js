import { Router } from 'express';
import { getSecurityAlerts, getThreatRadar, resolveAlert } from '../controllers/security.controller.js';
import { validateRequest } from '../middleware/validateRequest.js';
import { resolveAlertSchema } from '../modules/security/security.schema.js';

const router = Router();
router.get('/alerts', getSecurityAlerts);
router.get('/threat-radar', getThreatRadar);
router.post('/alerts/:id/resolve', validateRequest({ body: resolveAlertSchema }), resolveAlert);

export default router;

