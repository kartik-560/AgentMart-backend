import { logger } from '../utils/logger.js';

export function registerNegotiationSocketHandlers(io, socket) {
  // Join negotiation room for real-time round observation
  socket.on('negotiation:join', ({ negotiationId, businessId, role, accountType }) => {
    if (negotiationId) {
      socket.join(negotiationId);
      if (businessId) {
        socket.join(`${negotiationId}:seller:${businessId}`);
      }
      if (accountType === 'BUYER' || role === 'BUYER' || role === 'BUYER_OFFICER') {
        socket.join(`${negotiationId}:buyer`);
      }
      logger.info(
        `Socket [${socket.id}] joined negotiation room [${negotiationId}] (business: ${businessId || 'general'}, role: ${role || accountType || 'observer'})`
      );
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
