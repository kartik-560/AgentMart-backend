import express from 'express';
import http from 'http';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import { securityHeaders } from './middleware/securityHeaders.js';
import { auditLogger } from './middleware/auditLogger.js';
import { errorHandler } from './middleware/errorHandler.js';
import { initializeSockets } from './sockets/index.js';
import apiRouter from './routes/index.js';
import { getHealth } from './controllers/health.controller.js';

const app = express();
const server = http.createServer(app);

// Initialize WebSockets
const io = initializeSockets(server);
app.set('io', io);

// Global Middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin: [env.FRONTEND_URL, 'http://localhost:3000', 'http://127.0.0.1:3000'],
  credentials: true,
}));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan(env.NODE_ENV === 'development' ? 'dev' : 'combined'));
app.use(securityHeaders);
app.use(auditLogger);

// Health check endpoints (both root and /api/health)
app.get('/health', getHealth);
app.get('/api/health', getHealth);

// Canonical API routes
app.use('/api', apiRouter);

// 404 Route handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    statusCode: 404,
    error: 'NotFoundError',
    message: `Route [${req.method} ${req.url}] does not exist on AgentMart Server`,
    timestamp: new Date().toISOString(),
  });
});

// Global Error Handler
app.use(errorHandler);

// Server startup
const PORT = env.PORT || 5000;

if (process.env.NODE_ENV !== 'test') {
  server.listen(PORT, () => {
    logger.info(`🚀 AgentMart Backend Server running on http://localhost:${PORT}`);
    logger.info(`🔌 Socket.IO Gateway active on ws://localhost:${PORT}`);
    logger.info(`🛡️ Zero-Trust Security Engine: ACTIVE`);
  });
}

// Graceful shutdown handling
process.on('SIGTERM', () => {
  logger.info('SIGTERM received. Closing AgentMart server gracefully...');
  server.close(() => {
    logger.info('Process terminated.');
  });
});

export { app, server, io };

