/**
 * Expedition Socket.IO Event Handlers
 * 
 * Handles real-time communication for expedition management including
 * room management, message broadcasting, and status updates.
 */

import { Server as SocketIOServer, Socket } from 'socket.io';
import { SocketIOService } from '../services/SocketIOService';
import { FirstOfficerService } from '../services/FirstOfficerService';
import { RepositoryFactory } from '@starships/models';
import type { SocketIOEvents } from '@starships/protocol';

/**
 * Utility function to ensure error objects are never empty
 */
function safeEmitError(socket: any, errorData: any, expeditionId?: string, source?: string) {
  console.log('[EXPEDITION-SOCKET] safeEmitError called with:', {
    errorData,
    errorDataType: typeof errorData,
    expeditionId,
    source
  });
  
  // Ensure we never emit empty or invalid error objects
  let errorMessage = 'An unknown error occurred';
  
  if (errorData) {
    if (typeof errorData === 'string' && errorData.trim().length > 0) {
      errorMessage = errorData.trim();
    } else if (errorData instanceof Error) {
      errorMessage = errorData.message || 'Error occurred';
    } else if (typeof errorData === 'object' && errorData.message) {
      errorMessage = errorData.message;
    } else if (typeof errorData === 'object' && errorData.error) {
      errorMessage = errorData.error;
    }
  }
  
  const errorObject = {
    error: errorMessage,
    expeditionId: expeditionId || 'unknown',
    timestamp: new Date().toISOString(),
    source: source || 'expedition-handler'
  };
  
  console.log('[EXPEDITION-SOCKET] About to emit error object:', errorObject);
  console.log('[EXPEDITION-SOCKET] Error object keys:', Object.keys(errorObject));
  console.log('[EXPEDITION-SOCKET] Error object JSON:', JSON.stringify(errorObject));
  
  socket.emit('expedition:error', errorObject);
  
  console.log('[EXPEDITION-SOCKET] Error emission completed');
}

/**
 * Setup expedition-specific Socket.IO event handlers
 */
export function setupExpeditionHandlers(io: SocketIOServer<SocketIOEvents>) {
  console.log('[SOCKET.IO] Setting up expedition handlers...');

  const firstOfficerService = FirstOfficerService.getInstance();

  io.on('connection', (socket: Socket) => {
    const userId = socket.data.userId;
    
    if (!userId) {
      console.error('[EXPEDITION-SOCKET] No user ID found in socket data');
      return;
    }

    console.log(`[EXPEDITION-SOCKET] User ${userId} connected for expeditions`);

    // ========================================================================
    // EXPEDITION ROOM MANAGEMENT
    // ========================================================================

    /**
     * Join expedition room for real-time updates
     */
    socket.on('expedition:join', async (expeditionId: string) => {
      try {
        console.log(`[EXPEDITION-SOCKET] User ${userId} joining expedition room: ${expeditionId}`);

        // Validate expedition access
        const expeditionRepo = RepositoryFactory.getExpeditionRepository();
        const expedition = await expeditionRepo.findById(expeditionId);

        if (!expedition) {
          safeEmitError(socket, 'Expedition not found', expeditionId, 'expedition:join');
          return;
        }

        // Validate starship ownership
        const starshipRepo = RepositoryFactory.getStarshipRepository();
        const starship = await starshipRepo.findById(expedition.starshipId);

        if (!starship || starship.ownerId !== userId) {
          safeEmitError(socket, 'Access denied to expedition', expeditionId, 'expedition:join');
          return;
        }

        // Join expedition room
        const expeditionRoom = `expedition:${expeditionId}`;
        socket.join(expeditionRoom);

        // Send current expedition status
        const progress = await firstOfficerService.getExpeditionProgress(expeditionId);
        socket.emit('expedition:status-update', {
          expeditionId,
          progress,
          timestamp: new Date().toISOString()
        });

        console.log(`[EXPEDITION-SOCKET] User ${userId} joined expedition room: ${expeditionId}`);
      } catch (error) {
        console.error('[EXPEDITION-SOCKET] Failed to join expedition room:', error);
        safeEmitError(socket, error, expeditionId, 'expedition:join');
      }
    });

    /**
     * Leave expedition room
     */
    socket.on('expedition:leave', (expeditionId: string) => {
      try {
        console.log(`[EXPEDITION-SOCKET] User ${userId} leaving expedition room: ${expeditionId}`);
        
        const expeditionRoom = `expedition:${expeditionId}`;
        socket.leave(expeditionRoom);

        console.log(`[EXPEDITION-SOCKET] User ${userId} left expedition room: ${expeditionId}`);
      } catch (error) {
        console.error('[EXPEDITION-SOCKET] Failed to leave expedition room:', error);
      }
    });

    // ========================================================================
    // EXPEDITION CONTROL
    // ========================================================================

    /**
     * Start expedition via Socket.IO
     */
    socket.on('expedition:start', async (expeditionId: string) => {
      try {
        console.log(`[EXPEDITION-SOCKET] User ${userId} starting expedition: ${expeditionId}`);

        // Validate expedition access
        const expeditionRepo = RepositoryFactory.getExpeditionRepository();
        const expedition = await expeditionRepo.findById(expeditionId);

        if (!expedition) {
          safeEmitError(socket, 'Expedition not found', expeditionId, 'expedition:start');
          return;
        }

        // Validate starship ownership
        const starshipRepo = RepositoryFactory.getStarshipRepository();
        const starship = await starshipRepo.findById(expedition.starshipId);

        if (!starship || starship.ownerId !== userId) {
          safeEmitError(socket, 'Access denied to expedition', expeditionId, 'expedition:start');
          return;
        }

        // Start expedition through First Officer
        await firstOfficerService.startExpedition(expeditionId, userId, expedition.objective);

        // Broadcast to expedition room
        const expeditionRoom = `expedition:${expeditionId}`;
        io.to(expeditionRoom).emit('expedition:started', {
          expeditionId,
          timestamp: new Date().toISOString()
        });

        console.log(`[EXPEDITION-SOCKET] Expedition started: ${expeditionId}`);
      } catch (error: any) {
        console.error('[EXPEDITION-SOCKET] Failed to start expedition:', error);
        safeEmitError(socket, error, expeditionId, 'expedition:start');
      }
    });

    /**
     * Pause expedition via Socket.IO
     */
    socket.on('expedition:pause', async (expeditionId: string) => {
      try {
        console.log(`[EXPEDITION-SOCKET] User ${userId} pausing expedition: ${expeditionId}`);

        // Validate expedition access (similar to start)
        const expeditionRepo = RepositoryFactory.getExpeditionRepository();
        const expedition = await expeditionRepo.findById(expeditionId);

        if (!expedition) {
          safeEmitError(socket, 'Expedition not found', expeditionId, 'expedition:pause');
          return;
        }

        // Pause expedition
        await firstOfficerService.pauseExpedition(expeditionId);

        // Broadcast to expedition room
        const expeditionRoom = `expedition:${expeditionId}`;
        io.to(expeditionRoom).emit('expedition:paused', {
          expeditionId,
          timestamp: new Date().toISOString()
        });

        console.log(`[EXPEDITION-SOCKET] Expedition paused: ${expeditionId}`);
      } catch (error: any) {
        console.error('[EXPEDITION-SOCKET] Failed to pause expedition:', error);
        safeEmitError(socket, error, expeditionId, 'expedition:pause');
      }
    });

    /**
     * Cancel expedition via Socket.IO
     */
    socket.on('expedition:cancel', async (expeditionId: string) => {
      try {
        console.log(`[EXPEDITION-SOCKET] User ${userId} cancelling expedition: ${expeditionId}`);

        // Validate expedition access (similar to start)
        const expeditionRepo = RepositoryFactory.getExpeditionRepository();
        const expedition = await expeditionRepo.findById(expeditionId);

        if (!expedition) {
          safeEmitError(socket, 'Expedition not found', expeditionId, 'expedition:cancel');
          return;
        }

        // Cancel expedition
        await firstOfficerService.cancelExpedition(expeditionId);

        // Broadcast to expedition room
        const expeditionRoom = `expedition:${expeditionId}`;
        io.to(expeditionRoom).emit('expedition:cancelled', {
          expeditionId,
          timestamp: new Date().toISOString()
        });

        console.log(`[EXPEDITION-SOCKET] Expedition cancelled: ${expeditionId}`);
      } catch (error: any) {
        console.error('[EXPEDITION-SOCKET] Failed to cancel expedition:', error);
        safeEmitError(socket, error, expeditionId, 'expedition:cancel');
      }
    });

    // ========================================================================
    // EXPEDITION MESSAGING
    // ========================================================================

    /**
     * Send message to expedition
     */
    socket.on('expedition:send-message', async (data: { expeditionId: string; message: string }) => {
      try {
        const { expeditionId, message } = data;
        console.log(`[EXPEDITION-SOCKET] User ${userId} sending message to expedition: ${expeditionId}`);

        // Handle message through First Officer Service
        const response = await firstOfficerService.handleUserMessage(expeditionId, userId, message);

        // Broadcast user message to expedition room
        const expeditionRoom = `expedition:${expeditionId}`;
        io.to(expeditionRoom).emit('expedition:message', {
          expeditionId,
          role: 'user',
          userId,
          content: message,
          timestamp: new Date().toISOString()
        });

        // Send First Officer response
        io.to(expeditionRoom).emit('expedition:message', {
          expeditionId,
          role: 'first-officer',
          content: response.reply,
          timestamp: new Date().toISOString()
        });

        console.log(`[EXPEDITION-SOCKET] Message sent to expedition: ${expeditionId}`);
      } catch (error: any) {
        console.error('[EXPEDITION-SOCKET] Failed to send message:', error);
        safeEmitError(socket, error, data.expeditionId, 'expedition:send-message');
      }
    });

    // ========================================================================
    // DISCONNECTION HANDLING
    // ========================================================================

    socket.on('disconnect', () => {
      console.log(`[EXPEDITION-SOCKET] User ${userId} disconnected from expeditions`);
    });
  });

  console.log('[SOCKET.IO] Expedition handlers setup complete');
}

/**
 * Utility functions for broadcasting expedition events
 */
export class ExpeditionSocketUtils {
  private static io: SocketIOServer<SocketIOEvents>;

  static initialize(io: SocketIOServer<SocketIOEvents>) {
    this.io = io;
  }

  /**
   * Broadcast expedition status update to all participants
   */
  static broadcastStatusUpdate(expeditionId: string, status: any) {
    if (!this.io) return;
    
    const expeditionRoom = `expedition:${expeditionId}`;
    this.io.to(expeditionRoom).emit('expedition:status-update', {
      expeditionId,
      status,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Broadcast task assignment to expedition room
   */
  static broadcastTaskAssignment(expeditionId: string, taskData: any) {
    if (!this.io) return;
    
    const expeditionRoom = `expedition:${expeditionId}`;
    this.io.to(expeditionRoom).emit('expedition:task-assigned', {
      expeditionId,
      ...taskData,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Broadcast task completion to expedition room
   */
  static broadcastTaskCompletion(expeditionId: string, taskData: any) {
    if (!this.io) return;
    
    const expeditionRoom = `expedition:${expeditionId}`;
    this.io.to(expeditionRoom).emit('expedition:task-completed', {
      expeditionId,
      ...taskData,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Broadcast expedition completion to all participants
   */
  static broadcastExpeditionCompletion(expeditionId: string, result: string) {
    if (!this.io) return;
    
    const expeditionRoom = `expedition:${expeditionId}`;
    this.io.to(expeditionRoom).emit('expedition:completed', {
      expeditionId,
      result,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Broadcast phase change to expedition room
   */
  static broadcastPhaseChange(expeditionId: string, phase: string, data?: any) {
    if (!this.io) return;
    
    const expeditionRoom = `expedition:${expeditionId}`;
    this.io.to(expeditionRoom).emit('expedition:phase-change', {
      expeditionId,
      phase,
      data,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Broadcast new result availability
   */
  static broadcastResultAvailable(expeditionId: string, resultData: any) {
    if (!this.io) return;
    
    const expeditionRoom = `expedition:${expeditionId}`;
    this.io.to(expeditionRoom).emit('expedition:result-available', {
      expeditionId,
      ...resultData,
      timestamp: new Date().toISOString()
    });
  }
}