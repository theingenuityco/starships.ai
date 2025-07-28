import { Server as SocketIOServer } from 'socket.io';
import type { SocketIOEvents } from '@starships/protocol';
import type { ExpeditionMessageData } from '../types/socket-types';
import { FirstOfficerService } from '../services/FirstOfficerService';

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
      
      // Check for pending review requests and sync messages when joining
      setTimeout(async () => {
        try {
          const { MessageService } = await import('../services/MessageService');
          const messageService = MessageService.getInstance();
          
          // Check for pending reviews
          await messageService.checkAndHandleReviewRequests(data.expeditionId);
          
          // Emit a sync event to notify client they should refresh messages
          socket.emit('expedition:sync-required', {
            expeditionId: data.expeditionId,
            reason: 'room-joined',
            timestamp: new Date().toISOString()
          });
        } catch (error) {
          console.error('[SOCKET.IO] Failed to check review requests on join:', error);
        }
      }, 500);
      
      // Set up periodic check for review requests while in the room
      const reviewCheckInterval = setInterval(async () => {
        try {
          // Check if socket is still connected and in the room
          if (!socket.rooms.has(roomId)) {
            clearInterval(reviewCheckInterval);
            return;
          }
          
          const { MessageService } = await import('../services/MessageService');
          const messageService = MessageService.getInstance();
          await messageService.checkAndHandleReviewRequests(data.expeditionId);
        } catch (error) {
          console.error('[SOCKET.IO] Failed to check review requests:', error);
        }
      }, 5000); // Check every 5 seconds
      
      // Clean up interval when socket disconnects or leaves room
      socket.on('disconnect', () => {
        clearInterval(reviewCheckInterval);
      });
      
      socket.on('expedition:leave-room', () => {
        clearInterval(reviewCheckInterval);
      });
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
        
        // After sending the message, check for any pending review requests
        // This handles cases where review requests are created directly by agents
        setTimeout(async () => {
          try {
            await messageService.checkAndHandleReviewRequests(data.expeditionId);
          } catch (error) {
            console.error('[SOCKET.IO] Failed to check review requests:', error);
          }
        }, 1000); // Small delay to ensure message is stored
        
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
    // Handle task review requests
    socket.on('expedition:review-task', async (data, callback) => {
      console.log('[SOCKET.IO] Task review requested:', data);
      
      try {
        const { expeditionId, taskId, agentId, result } = data;
        
        if (!expeditionId || !taskId || !agentId || !result) {
          throw new Error('Missing required fields for task review');
        }
        
        // Get First Officer service and review the task
        const firstOfficerService = FirstOfficerService.getInstance();
        const reviewResult = await firstOfficerService.reviewTaskCompletion(
          expeditionId,
          taskId,
          agentId,
          result
        );
        
        // Emit review result to all expedition participants
        const roomId = `expedition:${expeditionId}`;
        io.to(roomId).emit('expedition:task-reviewed', {
          expeditionId,
          taskId,
          agentId,
          approved: reviewResult.approved,
          feedback: reviewResult.feedback,
          timestamp: new Date().toISOString()
        });
        
        // Send success response
        if (callback) {
          callback({ success: true, reviewResult });
        }
      } catch (error) {
        console.error('[SOCKET.IO] Failed to review task:', error);
        if (callback) {
          callback({ 
            success: false, 
            error: error instanceof Error ? error.message : 'Failed to review task' 
          });
        }
      }
    });

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