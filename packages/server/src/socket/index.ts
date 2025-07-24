import { SocketIOService } from '../services/SocketIOService';
import { setupSibilHandlers } from './sibilHandlers';
import { setupAgentHandlers } from './agentHandlers';
import type { Server as HTTPServer } from 'http';

export function initializeSocketIO(httpServer: HTTPServer) {
  console.log('[SOCKET.IO] Initializing Socket.IO server...');
  
  const socketService = SocketIOService.initialize(httpServer);
  const io = socketService.getIO();

  // Start health monitoring for connection stability
  socketService.startHealthMonitoring();

  // Setup Sibil-specific handlers
  setupSibilHandlers(io);

  // Setup Agent-specific handlers
  setupAgentHandlers(io);

  // Log connection statistics periodically
  setInterval(() => {
    const stats = socketService.getConnectionStats();
    console.log('[SOCKET.IO] Connection Stats:', {
      totalConnections: stats.totalConnections,
      connectedUsers: stats.connectedUsers,
      averagePingTime: Math.round(stats.averagePingTime),
      healthyConnections: stats.healthyConnections
    });
  }, 60000); // Log every minute

  console.log('[SOCKET.IO] Socket.IO server initialized successfully with enhanced features');
  return socketService;
}

export { SocketIOService };
