/**
 * Enhanced Expedition Socket.IO Event Handlers
 * 
 * Provides comprehensive real-time communication for expedition management with
 * improved timing, error handling, and event emission capabilities.
 */

import { Server as SocketIOServer, Socket } from 'socket.io';
import { EnhancedSocketIOService } from '../services/EnhancedSocketIOService';
import { FirstOfficerService } from '../services/FirstOfficerService';
import { RepositoryFactory } from '@starships/models';
import type { 
  EnhancedSocketIOEvents,
  ExpeditionCreatedEvent,
  ExpeditionStatusEvent,
  ExpeditionProgressEvent,
  TaskAssignedEvent,
  TaskCompletedEvent,
  ExpeditionMessageEvent,
  AgentActivityEvent,
  QualityScoreUpdateEvent,
  ResultAvailableEvent,
  PhaseChangeEvent,
  ExpeditionErrorEvent
} from '@starships/protocol';

/**
 * Enhanced utility class for broadcasting expedition events with proper error handling
 */
export class EnhancedExpeditionSocketUtils {
  private static socketService: EnhancedSocketIOService;

  static initialize(socketService: EnhancedSocketIOService) {
    this.socketService = socketService;
  }

  /**
   * Broadcast expedition creation to relevant users
   */
  static async broadcastExpeditionCreated(expeditionId: string, expedition: any, createdBy: string) {
    const event: ExpeditionCreatedEvent = {
      expeditionId,
      expedition: {
        id: expedition.id,
        title: expedition.title,
        objective: expedition.objective,
        status: expedition.status,
        priority: expedition.priority,
        starshipId: expedition.starshipId,
        createdBy,
        createdAt: expedition.createdAt
      },
      timestamp: new Date().toISOString()
    };

    try {
      // Emit to expedition room and user room
      await Promise.all([
        this.socketService.emitToExpeditionRoom(expeditionId, 'expedition:created', event),
        this.socketService.emitToUser(createdBy, 'expedition:created', event)
      ]);

      console.log(`[ENHANCED-EXPEDITION-SOCKET] Broadcasted expedition created: ${expeditionId}`);
    } catch (error) {
      console.error(`[ENHANCED-EXPEDITION-SOCKET] Failed to broadcast expedition created:`, error);
    }
  }

  /**
   * Broadcast expedition status updates with progress information
   */
  static async broadcastStatusUpdate(expeditionId: string, status: any, progress?: any) {
    const progressEvent: ExpeditionProgressEvent = {
      expeditionId,
      progress: {
        overall: progress?.overall || 0,
        currentPhase: progress?.currentPhase || 'unknown',
        completedTasks: progress?.completedTasks || 0,
        totalTasks: progress?.totalTasks || 0,
        estimatedTimeRemaining: progress?.estimatedTimeRemaining,
        lastActivity: new Date().toISOString()
      },
      timestamp: new Date().toISOString()
    };

    try {
      const result = await this.socketService.emitToExpeditionRoom(
        expeditionId, 
        'expedition:status-update', 
        progressEvent
      );

      if (result.success) {
        console.log(`[ENHANCED-EXPEDITION-SOCKET] Status update sent to ${result.recipientCount} recipients`);
      } else {
        console.warn(`[ENHANCED-EXPEDITION-SOCKET] Status update failed:`, result.errors);
      }
    } catch (error) {
      console.error(`[ENHANCED-EXPEDITION-SOCKET] Failed to broadcast status update:`, error);
    }
  }

  /**
   * Broadcast task assignment with enhanced details
   */
  static async broadcastTaskAssignment(expeditionId: string, taskData: any, assignedBy: string) {
    const event: TaskAssignedEvent = {
      expeditionId,
      taskId: taskData.id,
      task: {
        id: taskData.id,
        title: taskData.title,
        description: taskData.description,
        status: taskData.status,
        priority: taskData.priority,
        assignedTo: taskData.assignedAgentId,
        agentId: taskData.assignedAgentId,
        estimatedEffort: taskData.estimatedEffort
      },
      assignedBy,
      timestamp: new Date().toISOString()
    };

    try {
      await this.socketService.emitToExpeditionRoom(expeditionId, 'expedition:task-assigned', event);
      console.log(`[ENHANCED-EXPEDITION-SOCKET] Task assignment broadcasted: ${taskData.id}`);
    } catch (error) {
      console.error(`[ENHANCED-EXPEDITION-SOCKET] Failed to broadcast task assignment:`, error);
    }
  }

  /**
   * Broadcast task completion with results
   */
  static async broadcastTaskCompletion(expeditionId: string, taskData: any) {
    const event: TaskCompletedEvent = {
      expeditionId,
      taskId: taskData.id,
      task: {
        id: taskData.id,
        title: taskData.title,
        status: taskData.status,
        result: taskData.result,
        completedAt: taskData.updatedAt || new Date().toISOString(),
        completedBy: taskData.assignedAgentId,
        agentId: taskData.assignedAgentId
      },
      timestamp: new Date().toISOString()
    };

    try {
      await this.socketService.emitToExpeditionRoom(expeditionId, 'expedition:task-completed', event);
      console.log(`[ENHANCED-EXPEDITION-SOCKET] Task completion broadcasted: ${taskData.id}`);
    } catch (error) {
      console.error(`[ENHANCED-EXPEDITION-SOCKET] Failed to broadcast task completion:`, error);
    }
  }

  /**
   * Broadcast expedition messages with proper formatting
   */
  static async broadcastMessage(expeditionId: string, messageData: any) {
    const event: ExpeditionMessageEvent = {
      expeditionId,
      messageId: messageData.id,
      message: {
        id: messageData.id,
        role: messageData.role,
        content: messageData.content,
        userId: messageData.userId,
        agentId: messageData.agentId,
        threadId: messageData.threadId,
        attachments: messageData.attachments || []
      },
      timestamp: messageData.timestamp || new Date().toISOString()
    };

    try {
      await this.socketService.emitToExpeditionRoom(expeditionId, 'expedition:message', event);
      console.log(`[ENHANCED-EXPEDITION-SOCKET] Message broadcasted: ${messageData.id}`);
    } catch (error) {
      console.error(`[ENHANCED-EXPEDITION-SOCKET] Failed to broadcast message:`, error);
    }
  }

  /**
   * Broadcast agent activity updates
   */
  static async broadcastAgentActivity(expeditionId: string, agentId: string, activity: any) {
    const event: AgentActivityEvent = {
      expeditionId,
      agentId,
      activity: {
        type: activity.type,
        description: activity.description,
        taskId: activity.taskId,
        messageId: activity.messageId,
        data: activity.data
      },
      timestamp: new Date().toISOString()
    };

    try {
      await this.socketService.emitToExpeditionRoom(expeditionId, 'expedition:agent-activity', event);
      console.log(`[ENHANCED-EXPEDITION-SOCKET] Agent activity broadcasted: ${agentId}`);
    } catch (error) {
      console.error(`[ENHANCED-EXPEDITION-SOCKET] Failed to broadcast agent activity:`, error);
    }
  }

  /**
   * Broadcast quality score updates
   */
  static async broadcastQualityScoreUpdate(expeditionId: string, resultId: string, qualityScore: any, previousScore?: any) {
    const event: QualityScoreUpdateEvent = {
      expeditionId,
      resultId,
      qualityScore: {
        overall: qualityScore.overall,
        completeness: qualityScore.completeness,
        accuracy: qualityScore.accuracy,
        relevance: qualityScore.relevance,
        clarity: qualityScore.clarity,
        assessedBy: qualityScore.assessedBy,
        assessedAt: qualityScore.assessedAt,
        notes: qualityScore.notes
      },
      previousScore,
      timestamp: new Date().toISOString()
    };

    try {
      await this.socketService.emitToExpeditionRoom(expeditionId, 'expedition:quality-score-update', event);
      console.log(`[ENHANCED-EXPEDITION-SOCKET] Quality score update broadcasted: ${resultId}`);
    } catch (error) {
      console.error(`[ENHANCED-EXPEDITION-SOCKET] Failed to broadcast quality score update:`, error);
    }
  }

  /**
   * Broadcast new result availability
   */
  static async broadcastResultAvailable(expeditionId: string, resultData: any) {
    const event: ResultAvailableEvent = {
      expeditionId,
      resultId: resultData.id,
      result: {
        id: resultData.id,
        title: resultData.title,
        description: resultData.description,
        resultType: resultData.resultType,
        format: resultData.format,
        createdBy: resultData.createdBy,
        createdAt: resultData.createdAt,
        quality: resultData.quality
      },
      timestamp: new Date().toISOString()
    };

    try {
      await this.socketService.emitToExpeditionRoom(expeditionId, 'expedition:result-available', event);
      console.log(`[ENHANCED-EXPEDITION-SOCKET] Result availability broadcasted: ${resultData.id}`);
    } catch (error) {
      console.error(`[ENHANCED-EXPEDITION-SOCKET] Failed to broadcast result availability:`, error);
    }
  }

  /**
   * Broadcast phase changes in expedition workflow
   */
  static async broadcastPhaseChange(expeditionId: string, phase: string, previousPhase?: string, data?: any) {
    const event: PhaseChangeEvent = {
      expeditionId,
      phase: {
        current: phase,
        previous: previousPhase,
        description: data?.description || `Expedition entered ${phase} phase`,
        estimatedDuration: data?.estimatedDuration,
        startedAt: new Date().toISOString()
      },
      data: {
        tasksInPhase: data?.tasksInPhase,
        completedTasks: data?.completedTasks,
        nextPhase: data?.nextPhase,
        milestones: data?.milestones
      },
      timestamp: new Date().toISOString()
    };

    try {
      await this.socketService.emitToExpeditionRoom(expeditionId, 'expedition:phase-change', event);
      console.log(`[ENHANCED-EXPEDITION-SOCKET] Phase change broadcasted: ${phase}`);
    } catch (error) {
      console.error(`[ENHANCED-EXPEDITION-SOCKET] Failed to broadcast phase change:`, error);
    }
  }

  /**
   * Broadcast expedition errors with proper categorization
   */
  static async broadcastError(expeditionId: string, error: any, source: string = 'system') {
    const event: ExpeditionErrorEvent = {
      expeditionId,
      error: {
        code: error.code || 'UNKNOWN_ERROR',
        message: error.message || 'An unknown error occurred',
        severity: error.severity || 'medium',
        source: source as any,
        taskId: error.taskId,
        agentId: error.agentId,
        recoverable: error.recoverable !== false,
        retryCount: error.retryCount || 0
      },
      timestamp: new Date().toISOString()
    };

    try {
      await this.socketService.emitToExpeditionRoom(expeditionId, 'expedition:error', event);
      console.log(`[ENHANCED-EXPEDITION-SOCKET] Error broadcasted: ${error.code}`);
    } catch (broadcastError) {
      console.error(`[ENHANCED-EXPEDITION-SOCKET] Failed to broadcast error:`, broadcastError);
    }
  }
}

/**
 * Setup enhanced expedition-specific Socket.IO event handlers
 */
export function setupEnhancedExpeditionHandlers(io: SocketIOServer<EnhancedSocketIOEvents>) {
  console.log('[ENHANCED-SOCKET.IO] Setting up enhanced expedition handlers...');

  const firstOfficerService = FirstOfficerService.getInstance();
  const socketService = EnhancedSocketIOService.getInstance();

  // Initialize the utility class
  EnhancedExpeditionSocketUtils.initialize(socketService);

  io.on('connection', (socket: Socket) => {
    const userId = socket.data.userId;
    
    if (!userId) {
      console.error('[ENHANCED-EXPEDITION-SOCKET] No user ID found in socket data');
      return;
    }

    console.log(`[ENHANCED-EXPEDITION-SOCKET] User ${userId} connected for enhanced expeditions`);

    // ========================================================================
    // EXPEDITION CONTROL WITH ENHANCED ERROR HANDLING
    // ========================================================================

    /**
     * Start expedition with comprehensive error handling and progress tracking
     */
    socket.on('expedition:start', async (expeditionId: string) => {
      try {
        console.log(`[ENHANCED-EXPEDITION-SOCKET] User ${userId} starting expedition: ${expeditionId}`);

        // Validate expedition access
        const expeditionRepo = RepositoryFactory.getExpeditionRepository();
        const expedition = await expeditionRepo.findById(expeditionId);

        if (!expedition) {
          await EnhancedExpeditionSocketUtils.broadcastError(expeditionId, {
            code: 'EXPEDITION_NOT_FOUND',
            message: 'Expedition not found',
            severity: 'high',
            recoverable: false
          }, 'user');
          return;
        }

        // Validate starship ownership
        const starshipRepo = RepositoryFactory.getStarshipRepository();
        const starship = await starshipRepo.findById(expedition.starshipId);

        if (!starship || starship.ownerId !== userId) {
          await EnhancedExpeditionSocketUtils.broadcastError(expeditionId, {
            code: 'EXPEDITION_ACCESS_DENIED',
            message: 'Access denied to expedition',
            severity: 'high',
            recoverable: false
          }, 'user');
          return;
        }

        // Start expedition through First Officer
        await firstOfficerService.startExpedition(expeditionId, userId, expedition.objective);

        // Broadcast expedition started event
        const statusEvent: ExpeditionStatusEvent = {
          expeditionId,
          status: 'in-progress',
          previousStatus: expedition.status,
          changedBy: userId,
          timestamp: new Date().toISOString()
        };

        await socketService.emitToExpeditionRoom(expeditionId, 'expedition:started', statusEvent);

        // Broadcast phase change
        await EnhancedExpeditionSocketUtils.broadcastPhaseChange(
          expeditionId, 
          'initializing', 
          'draft',
          { description: 'Expedition initialization started' }
        );

        console.log(`[ENHANCED-EXPEDITION-SOCKET] Expedition started successfully: ${expeditionId}`);
      } catch (error: any) {
        console.error('[ENHANCED-EXPEDITION-SOCKET] Failed to start expedition:', error);
        await EnhancedExpeditionSocketUtils.broadcastError(expeditionId, {
          code: 'START_EXPEDITION_FAILED',
          message: error.message || 'Failed to start expedition',
          severity: 'high',
          recoverable: true
        }, 'system');
      }
    });

    /**
     * Pause expedition with state preservation
     */
    socket.on('expedition:pause', async (expeditionId: string) => {
      try {
        console.log(`[ENHANCED-EXPEDITION-SOCKET] User ${userId} pausing expedition: ${expeditionId}`);

        await firstOfficerService.pauseExpedition(expeditionId);

        const statusEvent: ExpeditionStatusEvent = {
          expeditionId,
          status: 'paused',
          previousStatus: 'in-progress',
          changedBy: userId,
          timestamp: new Date().toISOString()
        };

        await socketService.emitToExpeditionRoom(expeditionId, 'expedition:paused', statusEvent);

        console.log(`[ENHANCED-EXPEDITION-SOCKET] Expedition paused: ${expeditionId}`);
      } catch (error: any) {
        console.error('[ENHANCED-EXPEDITION-SOCKET] Failed to pause expedition:', error);
        await EnhancedExpeditionSocketUtils.broadcastError(expeditionId, error, 'system');
      }
    });

    /**
     * Resume expedition with state restoration
     */
    socket.on('expedition:resume', async (expeditionId: string) => {
      try {
        console.log(`[ENHANCED-EXPEDITION-SOCKET] User ${userId} resuming expedition: ${expeditionId}`);

        await firstOfficerService.resumeExpedition(expeditionId);

        const statusEvent: ExpeditionStatusEvent = {
          expeditionId,
          status: 'in-progress',
          previousStatus: 'paused',
          changedBy: userId,
          timestamp: new Date().toISOString()
        };

        await socketService.emitToExpeditionRoom(expeditionId, 'expedition:resumed', statusEvent);

        console.log(`[ENHANCED-EXPEDITION-SOCKET] Expedition resumed: ${expeditionId}`);
      } catch (error: any) {
        console.error('[ENHANCED-EXPEDITION-SOCKET] Failed to resume expedition:', error);
        await EnhancedExpeditionSocketUtils.broadcastError(expeditionId, error, 'system');
      }
    });

    /**
     * Cancel expedition with cleanup
     */
    socket.on('expedition:cancel', async (expeditionId: string) => {
      try {
        console.log(`[ENHANCED-EXPEDITION-SOCKET] User ${userId} cancelling expedition: ${expeditionId}`);

        await firstOfficerService.cancelExpedition(expeditionId);

        const statusEvent: ExpeditionStatusEvent = {
          expeditionId,
          status: 'cancelled',
          previousStatus: 'in-progress',
          changedBy: userId,
          timestamp: new Date().toISOString()
        };

        await socketService.emitToExpeditionRoom(expeditionId, 'expedition:cancelled', statusEvent);

        console.log(`[ENHANCED-EXPEDITION-SOCKET] Expedition cancelled: ${expeditionId}`);
      } catch (error: any) {
        console.error('[ENHANCED-EXPEDITION-SOCKET] Failed to cancel expedition:', error);
        await EnhancedExpeditionSocketUtils.broadcastError(expeditionId, error, 'system');
      }
    });

    // ========================================================================
    // ENHANCED MESSAGING WITH REAL-TIME FEATURES
    // ========================================================================

    /**
     * Send message with enhanced features and broadcasting
     */
    socket.on('expedition:send-message', async (data: { expeditionId: string; message: string }) => {
      try {
        const { expeditionId, message } = data;
        console.log(`[ENHANCED-EXPEDITION-SOCKET] User ${userId} sending message to expedition: ${expeditionId}`);

        // Handle message through First Officer Service
        const response = await firstOfficerService.handleUserMessage(expeditionId, userId, message);

        // Create and broadcast user message
        const userMessageEvent: ExpeditionMessageEvent = {
          expeditionId,
          messageId: `msg_${Date.now()}_user`,
          message: {
            id: `msg_${Date.now()}_user`,
            role: 'user',
            content: message,
            userId,
            // Remove threadId as it's not needed and not part of ChatResponse
          },
          timestamp: new Date().toISOString()
        };

        await socketService.emitToExpeditionRoom(expeditionId, 'expedition:message', userMessageEvent);

        // Create and broadcast First Officer response
        const responseMessageEvent: ExpeditionMessageEvent = {
          expeditionId,
          messageId: `msg_${Date.now()}_fo`,
          message: {
            id: `msg_${Date.now()}_fo`,
            role: 'first-officer',
            content: response.reply,
            // Remove threadId as it's not needed and not part of ChatResponse
          },
          timestamp: new Date().toISOString()
        };

        await socketService.emitToExpeditionRoom(expeditionId, 'expedition:message', responseMessageEvent);

        console.log(`[ENHANCED-EXPEDITION-SOCKET] Messages broadcasted for expedition: ${expeditionId}`);
      } catch (error: any) {
        console.error('[ENHANCED-EXPEDITION-SOCKET] Failed to send message:', error);
        await EnhancedExpeditionSocketUtils.broadcastError(data.expeditionId, error, 'messaging');
      }
    });

    // ========================================================================
    // DISCONNECTION HANDLING
    // ========================================================================

    socket.on('disconnect', () => {
      console.log(`[ENHANCED-EXPEDITION-SOCKET] User ${userId} disconnected from enhanced expeditions`);
    });
  });

  console.log('[ENHANCED-SOCKET.IO] Enhanced expedition handlers setup complete');
}