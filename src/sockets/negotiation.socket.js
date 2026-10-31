import { logger } from '../utils/logger.js';

export function registerNegotiationSocketHandlers(io, socket) {
  // Join negotiation room for real-time round observation
  socket.on('negotiation:join', ({ negotiationId }) => {
    if (negotiationId) {
      socket.join(negotiationId);
      logger.info(`Socket [${socket.id}] joined negotiation room [${negotiationId}]`);
      socket.emit('negotiation:joined', { negotiationId, status: 'CONNECTED' });
    }
  });

  socket.on('negotiation:leave', ({ negotiationId }) => {
    if (negotiationId) {
      socket.leave(negotiationId);
      logger.info(`Socket [${socket.id}] left negotiation room [${negotiationId}]`);
    }
  });
}

