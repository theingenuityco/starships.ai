import { Server as SocketIOServer } from 'socket.io';
import type { SocketIOEvents } from '@starships/protocol';

/**
 * Setup expedition-specific Socket.IO event handlers
 * 
 * Handles expedition room management and real-time event routing
 */
export function setupExpeditionHandlers(io: SocketIOServer<SocketIOEvents>) {
  console.log('[SOCKET.IO] Setting up expedition-specific handlers');

  io.on('connection', (socket) => {
    // Handle joining expedition rooms
    socket.on('expedition:join-room', ({ expeditionId, userId }) => {
      const roomId = `expedition:${expeditionId}`;
      socket.join(roomId);
      console.log(`[SOCKET.IO] User ${userId} joined expedition room: ${roomId}`);
      
      // Notify others in the room that a user joined
      socket.to(roomId).emit('expedition:user-joined', {
        userId,
        expeditionId,
        timestamp: new Date().toISOString()
      });
    });

    // Handle leaving expedition rooms
    socket.on('expedition:leave-room', ({ expeditionId, userId }) => {
      const roomId = `expedition:${expeditionId}`;
      socket.leave(roomId);
      console.log(`[SOCKET.IO] User ${userId} left expedition room: ${roomId}`);
      
      // Notify others in the room that a user left
      socket.to(roomId).emit('expedition:user-left', {
        userId,
        expeditionId,
        timestamp: new Date().toISOString()
      });
    });

    // Handle expedition status updates (could be used for manual triggers)
    socket.on('expedition:request-status', async ({ expeditionId }) => {
      try {
        // This could trigger a status refresh from the server
        console.log(`[SOCKET.IO] Status request for expedition: ${expeditionId}`);
        
        // Emit current status back to the requesting client
        socket.emit('expedition:status-update', {
          expeditionId,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        console.error('[SOCKET.IO] Error handling status request:', error);
        socket.emit('expedition:error', {
          expeditionId,
          error: 'Failed to get expedition status',
          timestamp: new Date().toISOString()
        });
      }
    });

    // Handle typing indicators for expedition chat
    socket.on('expedition:typing-start', ({ expeditionId, userId, agentId }) => {
      const roomId = `expedition:${expeditionId}`;
      socket.to(roomId).emit('expedition:user-typing', {
        expeditionId,
        userId,
        agentId,
        isTyping: true,
        timestamp: new Date().toISOString()
      });
    });

    socket.on('expedition:typing-stop', ({ expeditionId, userId, agentId }) => {
      const roomId = `expedition:${expeditionId}`;
      socket.to(roomId).emit('expedition:user-typing', {
        expeditionId,
        userId,
        agentId,
        isTyping: false,
        timestamp: new Date().toISOString()
      });
    });
  });
}

/**
 * Emit expedition event to all users in an expedition room
 */
export function emitExpeditionEvent(
  io: SocketIOServer<SocketIOEvents>,
  expeditionId: string,
  event: keyof SocketIOEvents,
  data: any
) {
  const roomId = `expedition:${expeditionId}`;
  io.to(roomId).emit(event, data);
  console.log(`[SOCKET.IO] Emitted ${String(event)} to expedition room: ${roomId}`);
}

/**
 * Get connected users in an expedition room
 */
export async function getExpeditionRoomUsers(
  io: SocketIOServer<SocketIOEvents>,
  expeditionId: string
): Promise<string[]> {
  const roomId = `expedition:${expeditionId}`;
  const sockets = await io.in(roomId).fetchSockets();
  return sockets.map(socket => socket.data.userId).filter(Boolean);
}