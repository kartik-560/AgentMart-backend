import { prisma } from '../config/prisma.js';
import { geminiClient } from '../config/gemini.js';
import { sendSuccess } from '../utils/response.js';

export async function getHealth(req, res, next) {
  try {
    let dbStatus = 'disconnected';
    try {
      await prisma.$queryRaw`SELECT 1`;
      dbStatus = 'connected';
    } catch {
      dbStatus = 'unreachable';
    }

    const healthData = {
      status: 'healthy',
      service: 'agentmart-backend',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      database: dbStatus,
      aiEngine: geminiClient ? 'gemini-api-connected' : 'simulation-mode-active',
      environment: process.env.NODE_ENV || 'development',
    };

    return sendSuccess(res, healthData, 'AgentMart Backend Health OK');
  } catch (error) {
    next(error);
  }
}

