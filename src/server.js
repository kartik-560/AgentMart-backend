import http from 'http';
import { app } from './app.js';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import { initializeSockets } from './sockets/index.js';

// Create HTTP server wrapping Express app
const server = http.createServer(app);

// Initialize WebSockets and register on app
const io = initializeSockets(server);
app.set('io', io);

// Detect serverless execution environment (e.g. Vercel, AWS Lambda)
const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);

// Server startup - only bind port in persistent/standalone development or container environments
const PORT = env.PORT || 5000;

if (!isServerless && process.env.NODE_ENV !== 'test') {
  server.listen(PORT, () => {
    logger.info(`🚀 AgentMart Backend Server running on http://localhost:${PORT}`);
    logger.info(`🔌 Socket.IO Gateway active on ws://localhost:${PORT}`);
    logger.info(`🛡️ Zero-Trust Security Engine: ACTIVE`);
  });

  // Graceful shutdown handling for standalone server
  process.on('SIGTERM', () => {
    logger.info('SIGTERM received. Closing AgentMart server gracefully...');
    server.close(() => {
      logger.info('Process terminated.');
    });
  });
}

// Export default app for Vercel Serverless Function execution
export default app;

// Named exports for backward compatibility and tests
export { app, server, io };
