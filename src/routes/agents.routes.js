import { Router } from 'express';
import { getAgents, updateAgentStatus } from '../controllers/agents.controller.js';
import { validateRequest } from '../middleware/validateRequest.js';
import { updateAgentStatusSchema } from '../modules/agents/agents.schema.js';

const router = Router();
router.get('/', getAgents);
router.patch('/:id/status', validateRequest({ body: updateAgentStatusSchema }), updateAgentStatus);

export default router;

