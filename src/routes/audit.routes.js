import { Router } from 'express';
import { getAuditLogs, verifyLogIntegrity } from '../controllers/audit.controller.js';
import { validateRequest } from '../middleware/validateRequest.js';
import { auditQuerySchema } from '../modules/audit/audit.schema.js';

const router = Router();
router.get('/', validateRequest({ query: auditQuerySchema }), getAuditLogs);
router.get('/logs', validateRequest({ query: auditQuerySchema }), getAuditLogs);
router.get('/logs/:id/verify', verifyLogIntegrity);

export default router;
