import { SocketIOService } from '../services/SocketIOService';
import { setupSibilHandlers } from './sibilHandlers';
import type { Server as HTTPServer } from 'http';

export function initializeSocketIO(httpServer: HTTPServer) {
  console.log('[SOCKET.IO] Initializing Socket.IO server...');
  
  const socketService = SocketIOService.initialize(httpServer);
  const io = socketService.getIO();

  // Setup Sibil-specific handlers
  setupSibilHandlers(io);

  console.log('[SOCKET.IO] Socket.IO server initialized successfully');
  return socketService;
}

export { SocketIOService };