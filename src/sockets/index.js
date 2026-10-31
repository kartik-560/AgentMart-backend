import { Server } from 'socket.io';
import { registerNegotiationSocketHandlers } from './negotiation.socket.js';
import { logger } from '../utils/logger.js';
import { env } from '../config/env.js';

export function initializeSockets(httpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: [env.FRONTEND_URL, 'http://localhost:3000', 'http://127.0.0.1:3000'],
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  io.on('connection', (socket) => {
    logger.info(`Socket client connected: ${socket.id}`);

    registerNegotiationSocketHandlers(io, socket);

    socket.on('disconnect', (reason) => {
      logger.info(`Socket client disconnected: ${socket.id} (${reason})`);
    });
  });

  return io;
}

