import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import { securityHeaders } from './middleware/securityHeaders.js';
import { auditLogger } from './middleware/auditLogger.js';
import { errorHandler } from './middleware/errorHandler.js';
import apiRouter from './routes/index.js';
import { getHealth } from './controllers/health.controller.js';

const app = express();

// Global Middleware
app.use(helmet({ contentSecurityPolicy: false }));

// Dynamic CORS configuration supporting local dev, custom domain, and Vercel preview domains
const allowedOrigins = [
  env.FRONTEND_URL,
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g., mobile apps, curl, server-to-server)
      if (!origin) return callback(null, true);
      if (
        allowedOrigins.includes(origin) ||
        /\.vercel\.app$/.test(origin) ||
        origin.includes('localhost') ||
        origin.includes('127.0.0.1')
      ) {
        return callback(null, true);
      }
      return callback(null, true);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  })
);

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan(env.NODE_ENV === 'development' ? 'dev' : 'combined'));
app.use(securityHeaders);
app.use(auditLogger);

// Root informational endpoint
app.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    statusCode: 200,
    service: 'AgentMart Autonomous Marketplace API',
    version: '1.0.0',
    status: 'ONLINE',
    runtime: process.env.VERCEL ? 'vercel-serverless' : 'node-standalone',
    documentation: '/api',
    healthCheck: '/health',
    timestamp: new Date().toISOString(),
  });
});

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

export { app };
export default app;
