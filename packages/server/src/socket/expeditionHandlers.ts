import { Server as SocketIOServer } from 'socket.io';
import type { SocketIOEvents } from '@starships/protocol';
import type { ExpeditionMessageData } from '../types/socket-types';

/**
 * Setup expedition-specific Socket.IO event handlers
 * 
 * Handles expedition room management and real-time event routing
 */
export function setupExpeditionHandlers(io: SocketIOServer<SocketIOEvents>) {
  console.log('[SOCKET.IO] Setting up expedition-specific handlers');

  io.on('connection', (socket) => {
    console.log('[SOCKET.IO] Client connected to expedition handlers');
    
    // Handle expedition room joining
    socket.on('expedition:join-room', async (data) => {
      const roomId = `expedition:${data.expeditionId}`;
      socket.join(roomId);
      socket.data.userId = data.userId;
      socket.data.expeditionId = data.expeditionId;
      console.log(`[SOCKET.IO] User ${data.userId} joined expedition room: ${roomId}`);
      console.log(`[SOCKET.IO] Socket ${socket.id} is now in rooms:`, Array.from(socket.rooms));
      
      // Notify other users in the room
      socket.to(roomId).emit('expedition:user-joined', {
        userId: data.userId,
        expeditionId: data.expeditionId,
        timestamp: new Date().toISOString()
      });
      
      // Emit a sync event to notify client they should refresh messages when joining
      setTimeout(async () => {
        socket.emit('expedition:sync-required', {
          expeditionId: data.expeditionId,
          reason: 'room-joined',
          timestamp: new Date().toISOString()
        });
      }, 500);
    });

    // Handle expedition room leaving
    socket.on('expedition:leave-room', (data) => {
      const roomId = `expedition:${data.expeditionId}`;
      socket.leave(roomId);
      console.log(`[SOCKET.IO] User ${data.userId} left expedition room: ${roomId}`);
      
      // Notify other users in the room
      socket.to(roomId).emit('expedition:user-left', {
        userId: data.userId,
        expeditionId: data.expeditionId,
        timestamp: new Date().toISOString()
      });
    });

    // Handle message sending via WebSocket
    socket.on('expedition:send-message', async (data: ExpeditionMessageData, callback) => {
      try {
        console.log('[SOCKET.IO] Received expedition message:', data);
        
        // Get the authenticated user ID from the socket
        const userId = socket.data.userId;
        if (!userId) {
          throw new Error('User not authenticated');
        }
        
        console.log('[SOCKET.IO] Authenticated user:', userId);
        
        // Import MessageService to handle the message
        const { MessageService } = await import('../services/MessageService');
        const messageService = MessageService.getInstance();
        
        // Check if streaming is requested
        const enableStreaming = data.enableStreaming === true; // Default to false
        
        console.log('[SOCKET.IO] Message enableStreaming:', enableStreaming);
        
        if (enableStreaming) {
          console.log('[SOCKET.IO] Using streaming message handling');
          // Send message with streaming support
          await messageService.sendExpeditionMessageWithStreaming(data, userId, socket);
        } else {
          console.log('[SOCKET.IO] Using regular message handling');
          // Send the message through the service with the authenticated user ID
          const result = await messageService.sendExpeditionMessage(data, userId);
        }
        
        // Acknowledge success to the sender
        if (callback) {
          callback({ success: true });
        }
        
        console.log('[SOCKET.IO] Message sent successfully via WebSocket');
        
      } catch (error) {
        console.error('[SOCKET.IO] Failed to send message via WebSocket:', error);
        
        // Send error response to the sender
        if (callback) {
          callback({ 
            success: false, 
            error: error instanceof Error ? error.message : 'Failed to send message' 
          });
        }
      }
    });
    
    // Basic connection handling

    socket.on('disconnect', () => {
      console.log('[SOCKET.IO] Client disconnected from expedition handlers');
      
      // Leave all expedition rooms this socket was in
      if (socket.data.expeditionId && socket.data.userId) {
        const roomId = `expedition:${socket.data.expeditionId}`;
        socket.to(roomId).emit('expedition:user-left', {
          userId: socket.data.userId,
          expeditionId: socket.data.expeditionId,
          timestamp: new Date().toISOString()
        });
      }
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