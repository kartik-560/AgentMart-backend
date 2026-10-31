import { Router } from 'express';
import authRoutes from './auth.routes.js';
import healthRoutes from './health.routes.js';
import businessRoutes from './business.routes.js';
import productsRoutes from './products.routes.js';
import agentsRoutes from './agents.routes.js';
import negotiationsRoutes from './negotiations.routes.js';
import transactionsRoutes from './transactions.routes.js';
import securityRoutes from './security.routes.js';
import auditRoutes from './audit.routes.js';

const apiRouter = Router();

apiRouter.use('/auth', authRoutes);
apiRouter.use('/health', healthRoutes);
apiRouter.use('/business', businessRoutes);
apiRouter.use('/products', productsRoutes);
apiRouter.use('/agents', agentsRoutes);
apiRouter.use('/negotiations', negotiationsRoutes);
apiRouter.use('/transactions', transactionsRoutes);
apiRouter.use('/security', securityRoutes);
apiRouter.use('/audit', auditRoutes);

export default apiRouter;
