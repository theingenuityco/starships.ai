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
          socket.emit('expedition:error', {
            error: 'Expedition not found',
            expeditionId,
            timestamp: new Date().toISOString()
          });
          return;
        }

        // Validate starship ownership
        const starshipRepo = RepositoryFactory.getStarshipRepository();
        const starship = await starshipRepo.findById(expedition.starshipId);

        if (!starship || starship.ownerId !== userId) {
          socket.emit('expedition:error', {
            error: 'Access denied to expedition',
            expeditionId,
            timestamp: new Date().toISOString()
          });
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
        socket.emit('expedition:error', {
          error: 'Failed to join expedition room',
          expeditionId,
          timestamp: new Date().toISOString()
        });
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
          socket.emit('expedition:error', {
            error: 'Expedition not found',
            expeditionId,
            timestamp: new Date().toISOString()
          });
          return;
        }

        // Validate starship ownership
        const starshipRepo = RepositoryFactory.getStarshipRepository();
        const starship = await starshipRepo.findById(expedition.starshipId);

        if (!starship || starship.ownerId !== userId) {
          socket.emit('expedition:error', {
            error: 'Access denied to expedition',
            expeditionId,
            timestamp: new Date().toISOString()
          });
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
        socket.emit('expedition:error', {
          error: error.message || 'Failed to start expedition',
          expeditionId,
          timestamp: new Date().toISOString()
        });
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
          socket.emit('expedition:error', {
            error: 'Expedition not found',
            expeditionId,
            timestamp: new Date().toISOString()
          });
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
        socket.emit('expedition:error', {
          error: error.message || 'Failed to pause expedition',
          expeditionId,
          timestamp: new Date().toISOString()
        });
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
          socket.emit('expedition:error', {
            error: 'Expedition not found',
            expeditionId,
            timestamp: new Date().toISOString()
          });
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
        socket.emit('expedition:error', {
          error: error.message || 'Failed to cancel expedition',
          expeditionId,
          timestamp: new Date().toISOString()
        });
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
        socket.emit('expedition:error', {
          error: error.message || 'Failed to send message',
          expeditionId: data.expeditionId,
          timestamp: new Date().toISOString()
        });
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