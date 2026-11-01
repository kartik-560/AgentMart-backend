import { Router } from 'express';
import { getAgents, getAgentById, updateAgentStatus } from '../controllers/agents.controller.js';
import { validateRequest } from '../middleware/validateRequest.js';
import { updateAgentStatusSchema } from '../modules/agents/agents.schema.js';
import { authenticateToken } from '../middleware/auth.middleware.js';

const router = Router();

// Protect agent routes with authentication
router.use(authenticateToken);

router.get('/', getAgents);
router.get('/:id', getAgentById);
router.patch('/:id/status', validateRequest({ body: updateAgentStatusSchema }), updateAgentStatus);

export default router;
