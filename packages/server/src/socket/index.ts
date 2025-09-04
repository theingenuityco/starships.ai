import { SocketIOService } from '../services/SocketIOService';
import { MissionEventService } from '../services/MissionEventService';
import { setupAgentHandlers } from './agentHandlers';
import { setupMissionHandlers } from './missionHandlers';
import type { Server as HTTPServer } from 'http';

export function initializeSocketIO(httpServer: HTTPServer) {
  console.log('[SOCKET.IO] Initializing Socket.IO server...');

  const socketService = SocketIOService.initialize(httpServer);
  const io = socketService.getIO();

  // Initialize Mission Event Service with Socket.IO instance
  const missionEventService = MissionEventService.getInstance();
  missionEventService.setSocketIO(io);

  // Start health monitoring for connection stability
  socketService.startHealthMonitoring();

  // Setup Agent-specific handlers
  setupAgentHandlers(io);

  // Setup Mission-specific handlers
  setupMissionHandlers(io);

  // Log connection statistics periodically
  setInterval(() => {
    const stats = socketService.getConnectionStats();
    console.log('[SOCKET.IO] Connection Stats:', {
      totalConnections: stats.totalConnections,
      connectedUsers: stats.connectedUsers,
      averagePingTime: Math.round(stats.averagePingTime),
      healthyConnections: stats.healthyConnections,
    });
  }, 60000); // Log every minute

  console.log('[SOCKET.IO] Socket.IO server initialized successfully with enhanced features');
  return socketService;
}

export { SocketIOService };
