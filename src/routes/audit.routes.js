import { Router } from 'express';
import { getAuditLogs } from '../controllers/audit.controller.js';
import { validateRequest } from '../middleware/validateRequest.js';
import { auditQuerySchema } from '../modules/audit/audit.schema.js';

const router = Router();
router.get('/logs', validateRequest({ query: auditQuerySchema }), getAuditLogs);

export default router;

