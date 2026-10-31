import { logger } from '../utils/logger.js';

export function registerNegotiationSocketHandlers(io, socket) {
  // Join negotiation room for real-time round observation
  socket.on('negotiation:join', ({ negotiationId }) => {
    if (negotiationId) {
      socket.join(negotiationId);
      logger.info(`Socket [${socket.id}] joined negotiation room [${negotiationId}]`);
      socket.emit('negotiation:joined', { negotiationId, status: 'CONNECTED', timestamp: new Date().toISOString() });
    }
  });

  // Leave negotiation room
  socket.on('negotiation:leave', ({ negotiationId }) => {
    if (negotiationId) {
      socket.leave(negotiationId);
      logger.info(`Socket [${socket.id}] left negotiation room [${negotiationId}]`);
      socket.emit('negotiation:left', { negotiationId, status: 'DISCONNECTED' });
    }
  });

  // Subscribe to agent telemetry
  socket.on('agent:status_subscribe', () => {
    socket.join('agent_telemetry');
    socket.emit('agent:status_subscribed', { status: 'SUBSCRIBED' });
  });
}
