/**
 * Enhanced Expedition Socket.IO Event Handlers
 * 
 * Provides comprehensive real-time communication for expedition management with
 * improved timing, error handling, and event emission capabilities.
 */

import { Server as SocketIOServer, Socket } from 'socket.io';
import { SocketIOService } from '../services/SocketIOService';
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
  private static socketService: SocketIOService;

  static initialize(socketService: SocketIOService) {
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
  const socketService = SocketIOService.getInstance();

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

        // Enhanced validation with structured error responses
        if (!expeditionId || typeof expeditionId !== 'string') {
          socket.emit('expedition:error', {
            expeditionId: expeditionId || 'unknown',
            error: {
              code: 'INVALID_EXPEDITION_ID',
              message: 'Invalid expedition ID provided',
              severity: 'medium',
              source: 'validation',
              recoverable: true,
              retryCount: 0
            },
            timestamp: new Date().toISOString()
          });
          return;
        }

        // Validate expedition access with graceful error handling
        const expeditionRepo = RepositoryFactory.getExpeditionRepository();
        let expedition;
        
        try {
          expedition = await expeditionRepo.findById(expeditionId);
        } catch (dbError: any) {
          console.error('[ENHANCED-EXPEDITION-SOCKET] Database error during expedition lookup:', dbError);
          socket.emit('expedition:error', {
            expeditionId,
            error: {
              code: 'DATABASE_ERROR',
              message: 'Temporary database issue - please try again',
              severity: 'medium',
              source: 'database',
              recoverable: true,
              retryCount: 0
            },
            timestamp: new Date().toISOString()
          });
          return;
        }

        if (!expedition) {
          socket.emit('expedition:error', {
            expeditionId,
            error: {
              code: 'EXPEDITION_NOT_FOUND',
              message: 'Expedition not found',
              severity: 'high',
              source: 'validation',
              recoverable: false,
              retryCount: 0
            },
            timestamp: new Date().toISOString()
          });
          return;
        }

        // Validate starship ownership with enhanced error handling
        const starshipRepo = RepositoryFactory.getStarshipRepository();
        let starship;
        
        try {
          starship = await starshipRepo.findById(expedition.starshipId);
        } catch (dbError: any) {
          console.error('[ENHANCED-EXPEDITION-SOCKET] Database error during starship lookup:', dbError);
          socket.emit('expedition:error', {
            expeditionId,
            error: {
              code: 'DATABASE_ERROR',
              message: 'Temporary database issue - please try again',
              severity: 'medium',
              source: 'database',
              recoverable: true,
              retryCount: 0
            },
            timestamp: new Date().toISOString()
          });
          return;
        }

        if (!starship || starship.ownerId !== userId) {
          socket.emit('expedition:error', {
            expeditionId,
            error: {
              code: 'EXPEDITION_ACCESS_DENIED',
              message: 'Access denied to expedition',
              severity: 'high',
              source: 'authorization',
              recoverable: false,
              retryCount: 0
            },
            timestamp: new Date().toISOString()
          });
          return;
        }

        // Check expedition state
        if (expedition.status === 'in-progress') {
          socket.emit('expedition:error', {
            expeditionId,
            error: {
              code: 'EXPEDITION_ALREADY_RUNNING',
              message: 'Expedition is already in progress',
              severity: 'low',
              source: 'validation',
              recoverable: false,
              retryCount: 0
            },
            timestamp: new Date().toISOString()
          });
          return;
        }

        // Start expedition through First Officer with error handling
        try {
          await firstOfficerService.startExpedition(expeditionId, userId, expedition.objective);
        } catch (serviceError: any) {
          console.error('[ENHANCED-EXPEDITION-SOCKET] First Officer service error:', serviceError);
          socket.emit('expedition:error', {
            expeditionId,
            error: {
              code: 'SERVICE_ERROR',
              message: 'Failed to start expedition - service temporarily unavailable',
              severity: 'high',
              source: 'service',
              recoverable: true,
              retryCount: 0
            },
            timestamp: new Date().toISOString()
          });
          return;
        }

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

        // Send success confirmation to the requesting client
        socket.emit('expedition:operation-success', {
          expeditionId,
          operation: 'start',
          timestamp: new Date().toISOString()
        });

        console.log(`[ENHANCED-EXPEDITION-SOCKET] Expedition started successfully: ${expeditionId}`);
      } catch (error: any) {
        console.error('[ENHANCED-EXPEDITION-SOCKET] Unexpected error starting expedition:', error);
        
        // Send structured error response instead of disconnecting
        socket.emit('expedition:error', {
          expeditionId: expeditionId || 'unknown',
          error: {
            code: 'UNEXPECTED_ERROR',
            message: 'An unexpected error occurred - please try again',
            severity: 'high',
            source: 'system',
            recoverable: true,
            retryCount: 0
          },
          timestamp: new Date().toISOString()
        });
      }
    });

    /**
     * Pause expedition with enhanced error handling
     */
    socket.on('expedition:pause', async (expeditionId: string) => {
      try {
        console.log(`[ENHANCED-EXPEDITION-SOCKET] User ${userId} pausing expedition: ${expeditionId}`);

        // Validate input
        if (!expeditionId || typeof expeditionId !== 'string') {
          socket.emit('expedition:error', {
            expeditionId: expeditionId || 'unknown',
            error: {
              code: 'INVALID_EXPEDITION_ID',
              message: 'Invalid expedition ID provided',
              severity: 'medium',
              source: 'validation',
              recoverable: true,
              retryCount: 0
            },
            timestamp: new Date().toISOString()
          });
          return;
        }

        // Validate expedition exists and user has access
        const expeditionRepo = RepositoryFactory.getExpeditionRepository();
        let expedition;
        
        try {
          expedition = await expeditionRepo.findById(expeditionId);
        } catch (dbError: any) {
          console.error('[ENHANCED-EXPEDITION-SOCKET] Database error during expedition lookup:', dbError);
          socket.emit('expedition:error', {
            expeditionId,
            error: {
              code: 'DATABASE_ERROR',
              message: 'Temporary database issue - please try again',
              severity: 'medium',
              source: 'database',
              recoverable: true,
              retryCount: 0
            },
            timestamp: new Date().toISOString()
          });
          return;
        }

        if (!expedition) {
          socket.emit('expedition:error', {
            expeditionId,
            error: {
              code: 'EXPEDITION_NOT_FOUND',
              message: 'Expedition not found',
              severity: 'high',
              source: 'validation',
              recoverable: false,
              retryCount: 0
            },
            timestamp: new Date().toISOString()
          });
          return;
        }

        // Check if expedition can be paused
        if (expedition.status !== 'in-progress') {
          socket.emit('expedition:error', {
            expeditionId,
            error: {
              code: 'INVALID_EXPEDITION_STATE',
              message: `Cannot pause expedition in ${expedition.status} state`,
              severity: 'medium',
              source: 'validation',
              recoverable: false,
              retryCount: 0
            },
            timestamp: new Date().toISOString()
          });
          return;
        }

        // Pause expedition with service error handling
        try {
          await firstOfficerService.pauseExpedition(expeditionId);
        } catch (serviceError: any) {
          console.error('[ENHANCED-EXPEDITION-SOCKET] Service error pausing expedition:', serviceError);
          socket.emit('expedition:error', {
            expeditionId,
            error: {
              code: 'SERVICE_ERROR',
              message: 'Failed to pause expedition - service temporarily unavailable',
              severity: 'high',
              source: 'service',
              recoverable: true,
              retryCount: 0
            },
            timestamp: new Date().toISOString()
          });
          return;
        }

        const statusEvent: ExpeditionStatusEvent = {
          expeditionId,
          status: 'paused',
          previousStatus: 'in-progress',
          changedBy: userId,
          timestamp: new Date().toISOString()
        };

        await socketService.emitToExpeditionRoom(expeditionId, 'expedition:paused', statusEvent);

        socket.emit('expedition:operation-success', {
          expeditionId,
          operation: 'pause',
          timestamp: new Date().toISOString()
        });

        console.log(`[ENHANCED-EXPEDITION-SOCKET] Expedition paused: ${expeditionId}`);
      } catch (error: any) {
        console.error('[ENHANCED-EXPEDITION-SOCKET] Unexpected error pausing expedition:', error);
        socket.emit('expedition:error', {
          expeditionId: expeditionId || 'unknown',
          error: {
            code: 'UNEXPECTED_ERROR',
            message: 'An unexpected error occurred - please try again',
            severity: 'high',
            source: 'system',
            recoverable: true,
            retryCount: 0
          },
          timestamp: new Date().toISOString()
        });
      }
    });

    /**
     * Resume expedition with enhanced error handling
     */
    socket.on('expedition:resume', async (expeditionId: string) => {
      try {
        console.log(`[ENHANCED-EXPEDITION-SOCKET] User ${userId} resuming expedition: ${expeditionId}`);

        // Validate input
        if (!expeditionId || typeof expeditionId !== 'string') {
          socket.emit('expedition:error', {
            expeditionId: expeditionId || 'unknown',
            error: {
              code: 'INVALID_EXPEDITION_ID',
              message: 'Invalid expedition ID provided',
              severity: 'medium',
              source: 'validation',
              recoverable: true,
              retryCount: 0
            },
            timestamp: new Date().toISOString()
          });
          return;
        }

        // Validate expedition exists and user has access
        const expeditionRepo = RepositoryFactory.getExpeditionRepository();
        let expedition;
        
        try {
          expedition = await expeditionRepo.findById(expeditionId);
        } catch (dbError: any) {
          console.error('[ENHANCED-EXPEDITION-SOCKET] Database error during expedition lookup:', dbError);
          socket.emit('expedition:error', {
            expeditionId,
            error: {
              code: 'DATABASE_ERROR',
              message: 'Temporary database issue - please try again',
              severity: 'medium',
              source: 'database',
              recoverable: true,
              retryCount: 0
            },
            timestamp: new Date().toISOString()
          });
          return;
        }

        if (!expedition) {
          socket.emit('expedition:error', {
            expeditionId,
            error: {
              code: 'EXPEDITION_NOT_FOUND',
              message: 'Expedition not found',
              severity: 'high',
              source: 'validation',
              recoverable: false,
              retryCount: 0
            },
            timestamp: new Date().toISOString()
          });
          return;
        }

        // Check if expedition can be resumed
        if (!['paused', 'failed'].includes(expedition.status)) {
          socket.emit('expedition:error', {
            expeditionId,
            error: {
              code: 'INVALID_EXPEDITION_STATE',
              message: `Cannot resume expedition in ${expedition.status} state`,
              severity: 'medium',
              source: 'validation',
              recoverable: false,
              retryCount: 0
            },
            timestamp: new Date().toISOString()
          });
          return;
        }

        // Resume expedition with service error handling
        try {
          await firstOfficerService.resumeExpedition(expeditionId);
        } catch (serviceError: any) {
          console.error('[ENHANCED-EXPEDITION-SOCKET] Service error resuming expedition:', serviceError);
          socket.emit('expedition:error', {
            expeditionId,
            error: {
              code: 'SERVICE_ERROR',
              message: 'Failed to resume expedition - service temporarily unavailable',
              severity: 'high',
              source: 'service',
              recoverable: true,
              retryCount: 0
            },
            timestamp: new Date().toISOString()
          });
          return;
        }

        const statusEvent: ExpeditionStatusEvent = {
          expeditionId,
          status: 'in-progress',
          previousStatus: 'paused',
          changedBy: userId,
          timestamp: new Date().toISOString()
        };

        await socketService.emitToExpeditionRoom(expeditionId, 'expedition:resumed', statusEvent);

        socket.emit('expedition:operation-success', {
          expeditionId,
          operation: 'resume',
          timestamp: new Date().toISOString()
        });

        console.log(`[ENHANCED-EXPEDITION-SOCKET] Expedition resumed: ${expeditionId}`);
      } catch (error: any) {
        console.error('[ENHANCED-EXPEDITION-SOCKET] Unexpected error resuming expedition:', error);
        socket.emit('expedition:error', {
          expeditionId: expeditionId || 'unknown',
          error: {
            code: 'UNEXPECTED_ERROR',
            message: 'An unexpected error occurred - please try again',
            severity: 'high',
            source: 'system',
            recoverable: true,
            retryCount: 0
          },
          timestamp: new Date().toISOString()
        });
      }
    });

    /**
     * Cancel expedition with enhanced error handling
     */
    socket.on('expedition:cancel', async (expeditionId: string) => {
      try {
        console.log(`[ENHANCED-EXPEDITION-SOCKET] User ${userId} cancelling expedition: ${expeditionId}`);

        // Validate input
        if (!expeditionId || typeof expeditionId !== 'string') {
          socket.emit('expedition:error', {
            expeditionId: expeditionId || 'unknown',
            error: {
              code: 'INVALID_EXPEDITION_ID',
              message: 'Invalid expedition ID provided',
              severity: 'medium',
              source: 'validation',
              recoverable: true,
              retryCount: 0
            },
            timestamp: new Date().toISOString()
          });
          return;
        }

        // Validate expedition exists and user has access
        const expeditionRepo = RepositoryFactory.getExpeditionRepository();
        let expedition;
        
        try {
          expedition = await expeditionRepo.findById(expeditionId);
        } catch (dbError: any) {
          console.error('[ENHANCED-EXPEDITION-SOCKET] Database error during expedition lookup:', dbError);
          socket.emit('expedition:error', {
            expeditionId,
            error: {
              code: 'DATABASE_ERROR',
              message: 'Temporary database issue - please try again',
              severity: 'medium',
              source: 'database',
              recoverable: true,
              retryCount: 0
            },
            timestamp: new Date().toISOString()
          });
          return;
        }

        if (!expedition) {
          socket.emit('expedition:error', {
            expeditionId,
            error: {
              code: 'EXPEDITION_NOT_FOUND',
              message: 'Expedition not found',
              severity: 'high',
              source: 'validation',
              recoverable: false,
              retryCount: 0
            },
            timestamp: new Date().toISOString()
          });
          return;
        }

        // Check if expedition can be cancelled
        if (['completed', 'cancelled'].includes(expedition.status)) {
          socket.emit('expedition:error', {
            expeditionId,
            error: {
              code: 'INVALID_EXPEDITION_STATE',
              message: `Cannot cancel expedition in ${expedition.status} state`,
              severity: 'medium',
              source: 'validation',
              recoverable: false,
              retryCount: 0
            },
            timestamp: new Date().toISOString()
          });
          return;
        }

        // Cancel expedition with service error handling
        try {
          await firstOfficerService.cancelExpedition(expeditionId);
        } catch (serviceError: any) {
          console.error('[ENHANCED-EXPEDITION-SOCKET] Service error cancelling expedition:', serviceError);
          socket.emit('expedition:error', {
            expeditionId,
            error: {
              code: 'SERVICE_ERROR',
              message: 'Failed to cancel expedition - service temporarily unavailable',
              severity: 'high',
              source: 'service',
              recoverable: true,
              retryCount: 0
            },
            timestamp: new Date().toISOString()
          });
          return;
        }

        const statusEvent: ExpeditionStatusEvent = {
          expeditionId,
          status: 'cancelled',
          previousStatus: expedition.status,
          changedBy: userId,
          timestamp: new Date().toISOString()
        };

        await socketService.emitToExpeditionRoom(expeditionId, 'expedition:cancelled', statusEvent);

        socket.emit('expedition:operation-success', {
          expeditionId,
          operation: 'cancel',
          timestamp: new Date().toISOString()
        });

        console.log(`[ENHANCED-EXPEDITION-SOCKET] Expedition cancelled: ${expeditionId}`);
      } catch (error: any) {
        console.error('[ENHANCED-EXPEDITION-SOCKET] Unexpected error cancelling expedition:', error);
        socket.emit('expedition:error', {
          expeditionId: expeditionId || 'unknown',
          error: {
            code: 'UNEXPECTED_ERROR',
            message: 'An unexpected error occurred - please try again',
            severity: 'high',
            source: 'system',
            recoverable: true,
            retryCount: 0
          },
          timestamp: new Date().toISOString()
        });
      }
    });

    // ========================================================================
    // ENHANCED MESSAGING WITH REAL-TIME FEATURES
    // ========================================================================

    /**
     * Send message with enhanced features and comprehensive error handling
     */
    socket.on('expedition:send-message', async (data: { expeditionId: string; message: string }) => {
      try {
        console.log(`[ENHANCED-EXPEDITION-SOCKET] User ${userId} sending message to expedition: ${data?.expeditionId}`);

        // Enhanced input validation
        if (!data || typeof data !== 'object') {
          socket.emit('expedition:error', {
            expeditionId: 'unknown',
            error: {
              code: 'INVALID_MESSAGE_DATA',
              message: 'Invalid message data provided',
              severity: 'medium',
              source: 'validation',
              recoverable: true,
              retryCount: 0
            },
            timestamp: new Date().toISOString()
          });
          return;
        }

        const { expeditionId, message } = data;

        if (!expeditionId || typeof expeditionId !== 'string') {
          socket.emit('expedition:error', {
            expeditionId: expeditionId || 'unknown',
            error: {
              code: 'INVALID_EXPEDITION_ID',
              message: 'Invalid expedition ID provided',
              severity: 'medium',
              source: 'validation',
              recoverable: true,
              retryCount: 0
            },
            timestamp: new Date().toISOString()
          });
          return;
        }

        if (!message || typeof message !== 'string' || message.trim().length === 0) {
          socket.emit('expedition:error', {
            expeditionId,
            error: {
              code: 'INVALID_MESSAGE_CONTENT',
              message: 'Message content cannot be empty',
              severity: 'low',
              source: 'validation',
              recoverable: true,
              retryCount: 0
            },
            timestamp: new Date().toISOString()
          });
          return;
        }

        // Validate message length
        if (message.length > 10000) {
          socket.emit('expedition:error', {
            expeditionId,
            error: {
              code: 'MESSAGE_TOO_LONG',
              message: 'Message exceeds maximum length of 10,000 characters',
              severity: 'medium',
              source: 'validation',
              recoverable: true,
              retryCount: 0
            },
            timestamp: new Date().toISOString()
          });
          return;
        }

        // Validate expedition exists and user has access
        const expeditionRepo = RepositoryFactory.getExpeditionRepository();
        let expedition;
        
        try {
          expedition = await expeditionRepo.findById(expeditionId);
        } catch (dbError: any) {
          console.error('[ENHANCED-EXPEDITION-SOCKET] Database error during expedition lookup:', dbError);
          socket.emit('expedition:error', {
            expeditionId,
            error: {
              code: 'DATABASE_ERROR',
              message: 'Temporary database issue - please try again',
              severity: 'medium',
              source: 'database',
              recoverable: true,
              retryCount: 0
            },
            timestamp: new Date().toISOString()
          });
          return;
        }

        if (!expedition) {
          socket.emit('expedition:error', {
            expeditionId,
            error: {
              code: 'EXPEDITION_NOT_FOUND',
              message: 'Expedition not found',
              severity: 'high',
              source: 'validation',
              recoverable: false,
              retryCount: 0
            },
            timestamp: new Date().toISOString()
          });
          return;
        }

        // Handle message through First Officer Service with enhanced error handling
        let response;
        try {
          response = await firstOfficerService.handleUserMessage(expeditionId, userId, message);
        } catch (serviceError: any) {
          console.error('[ENHANCED-EXPEDITION-SOCKET] First Officer service error:', serviceError);
          
          // Categorize service errors
          let errorCode = 'SERVICE_ERROR';
          let errorMessage = 'Failed to process message - service temporarily unavailable';
          let severity: 'low' | 'medium' | 'high' = 'high';
          
          if (serviceError.message?.includes('rate limit')) {
            errorCode = 'RATE_LIMIT_EXCEEDED';
            errorMessage = 'Too many messages sent - please wait a moment';
            severity = 'medium';
          } else if (serviceError.message?.includes('timeout')) {
            errorCode = 'SERVICE_TIMEOUT';
            errorMessage = 'Message processing timed out - please try again';
            severity = 'medium';
          }

          socket.emit('expedition:error', {
            expeditionId,
            error: {
              code: errorCode,
              message: errorMessage,
              severity,
              source: 'service',
              recoverable: true,
              retryCount: 0
            },
            timestamp: new Date().toISOString()
          });
          return;
        }

        // Create and broadcast user message with error handling
        const userMessageEvent: ExpeditionMessageEvent = {
          expeditionId,
          messageId: `msg_${Date.now()}_user`,
          message: {
            id: `msg_${Date.now()}_user`,
            role: 'user',
            content: message,
            userId,
          },
          timestamp: new Date().toISOString()
        };

        try {
          await socketService.emitToExpeditionRoom(expeditionId, 'expedition:message', userMessageEvent);
        } catch (broadcastError: any) {
          console.error('[ENHANCED-EXPEDITION-SOCKET] Failed to broadcast user message:', broadcastError);
          socket.emit('expedition:error', {
            expeditionId,
            error: {
              code: 'BROADCAST_ERROR',
              message: 'Failed to broadcast message to expedition participants',
              severity: 'medium',
              source: 'system',
              recoverable: true,
              retryCount: 0
            },
            timestamp: new Date().toISOString()
          });
          return;
        }

        // Create and broadcast First Officer response with error handling
        if (response?.reply) {
          const responseMessageEvent: ExpeditionMessageEvent = {
            expeditionId,
            messageId: `msg_${Date.now()}_fo`,
            message: {
              id: `msg_${Date.now()}_fo`,
              role: 'first-officer',
              content: response.reply,
            },
            timestamp: new Date().toISOString()
          };

          try {
            await socketService.emitToExpeditionRoom(expeditionId, 'expedition:message', responseMessageEvent);
          } catch (broadcastError: any) {
            console.error('[ENHANCED-EXPEDITION-SOCKET] Failed to broadcast First Officer response:', broadcastError);
            socket.emit('expedition:error', {
              expeditionId,
              error: {
                code: 'BROADCAST_ERROR',
                message: 'Failed to broadcast First Officer response',
                severity: 'medium',
                source: 'system',
                recoverable: true,
                retryCount: 0
              },
              timestamp: new Date().toISOString()
            });
            return;
          }
        }

        // Send success confirmation
        socket.emit('expedition:operation-success', {
          expeditionId,
          operation: 'send-message',
          timestamp: new Date().toISOString()
        });

        console.log(`[ENHANCED-EXPEDITION-SOCKET] Messages broadcasted successfully for expedition: ${expeditionId}`);
      } catch (error: any) {
        console.error('[ENHANCED-EXPEDITION-SOCKET] Unexpected error sending message:', error);
        socket.emit('expedition:error', {
          expeditionId: data?.expeditionId || 'unknown',
          error: {
            code: 'UNEXPECTED_ERROR',
            message: 'An unexpected error occurred while sending message',
            severity: 'high',
            source: 'system',
            recoverable: true,
            retryCount: 0
          },
          timestamp: new Date().toISOString()
        });
      }
    });

    // ========================================================================
    // ROOM MANAGEMENT WITH ERROR HANDLING
    // ========================================================================

    /**
     * Join expedition room with validation
     */
    socket.on('expedition:join-room', async (expeditionId: string) => {
      try {
        console.log(`[ENHANCED-EXPEDITION-SOCKET] User ${userId} joining expedition room: ${expeditionId}`);

        // Validate input
        if (!expeditionId || typeof expeditionId !== 'string') {
          socket.emit('expedition:error', {
            expeditionId: expeditionId || 'unknown',
            error: {
              code: 'INVALID_EXPEDITION_ID',
              message: 'Invalid expedition ID provided',
              severity: 'medium',
              source: 'validation',
              recoverable: true,
              retryCount: 0
            },
            timestamp: new Date().toISOString()
          });
          return;
        }

        // Validate expedition exists and user has access
        const expeditionRepo = RepositoryFactory.getExpeditionRepository();
        let expedition;
        
        try {
          expedition = await expeditionRepo.findById(expeditionId);
        } catch (dbError: any) {
          console.error('[ENHANCED-EXPEDITION-SOCKET] Database error during expedition lookup:', dbError);
          socket.emit('expedition:error', {
            expeditionId,
            error: {
              code: 'DATABASE_ERROR',
              message: 'Temporary database issue - please try again',
              severity: 'medium',
              source: 'database',
              recoverable: true,
              retryCount: 0
            },
            timestamp: new Date().toISOString()
          });
          return;
        }

        if (!expedition) {
          socket.emit('expedition:error', {
            expeditionId,
            error: {
              code: 'EXPEDITION_NOT_FOUND',
              message: 'Expedition not found',
              severity: 'high',
              source: 'validation',
              recoverable: false,
              retryCount: 0
            },
            timestamp: new Date().toISOString()
          });
          return;
        }

        // Join the expedition room
        await socket.join(`expedition:${expeditionId}`);
        
        // Send confirmation
        socket.emit('expedition:room-joined', {
          expeditionId,
          timestamp: new Date().toISOString()
        });

        console.log(`[ENHANCED-EXPEDITION-SOCKET] User ${userId} joined expedition room: ${expeditionId}`);
      } catch (error: any) {
        console.error('[ENHANCED-EXPEDITION-SOCKET] Unexpected error joining expedition room:', error);
        socket.emit('expedition:error', {
          expeditionId: expeditionId || 'unknown',
          error: {
            code: 'UNEXPECTED_ERROR',
            message: 'Failed to join expedition room',
            severity: 'medium',
            source: 'system',
            recoverable: true,
            retryCount: 0
          },
          timestamp: new Date().toISOString()
        });
      }
    });

    /**
     * Leave expedition room
     */
    socket.on('expedition:leave-room', async (expeditionId: string) => {
      try {
        console.log(`[ENHANCED-EXPEDITION-SOCKET] User ${userId} leaving expedition room: ${expeditionId}`);

        if (expeditionId && typeof expeditionId === 'string') {
          await socket.leave(`expedition:${expeditionId}`);
          
          socket.emit('expedition:room-left', {
            expeditionId,
            timestamp: new Date().toISOString()
          });
        }

        console.log(`[ENHANCED-EXPEDITION-SOCKET] User ${userId} left expedition room: ${expeditionId}`);
      } catch (error: any) {
        console.error('[ENHANCED-EXPEDITION-SOCKET] Error leaving expedition room:', error);
        // Don't emit error for leave operations as they're not critical
      }
    });

    // ========================================================================
    // GLOBAL ERROR HANDLING
    // ========================================================================

    /**
     * Global error handler for socket connection
     */
    socket.on('error', (error: any) => {
      console.error(`[ENHANCED-EXPEDITION-SOCKET] Socket error for user ${userId}:`, error);
      
      // Send structured error response
      socket.emit('expedition:error', {
        expeditionId: 'system',
        error: {
          code: 'SOCKET_ERROR',
          message: 'Connection error occurred',
          severity: 'high',
          source: 'connection',
          recoverable: true,
          retryCount: 0
        },
        timestamp: new Date().toISOString()
      });
    });

    /**
     * Handle connection errors gracefully
     */
    socket.on('connect_error', (error: any) => {
      console.error(`[ENHANCED-EXPEDITION-SOCKET] Connection error for user ${userId}:`, error);
    });

    /**
     * Handle reconnection attempts
     */
    socket.on('reconnect', (attemptNumber: number) => {
      console.log(`[ENHANCED-EXPEDITION-SOCKET] User ${userId} reconnected after ${attemptNumber} attempts`);
      
      // Send reconnection success event
      socket.emit('expedition:reconnected', {
        attemptNumber,
        timestamp: new Date().toISOString()
      });
    });

    /**
     * Handle reconnection errors
     */
    socket.on('reconnect_error', (error: any) => {
      console.error(`[ENHANCED-EXPEDITION-SOCKET] Reconnection error for user ${userId}:`, error);
    });

    /**
     * Handle reconnection failures
     */
    socket.on('reconnect_failed', () => {
      console.error(`[ENHANCED-EXPEDITION-SOCKET] Reconnection failed for user ${userId}`);
    });

    // ========================================================================
    // DISCONNECTION HANDLING
    // ========================================================================

    socket.on('disconnect', (reason: string) => {
      console.log(`[ENHANCED-EXPEDITION-SOCKET] User ${userId} disconnected from enhanced expeditions. Reason: ${reason}`);
      
      // Log disconnection reason for monitoring
      if (reason === 'io server disconnect') {
        console.warn(`[ENHANCED-EXPEDITION-SOCKET] Server initiated disconnect for user ${userId}`);
      } else if (reason === 'io client disconnect') {
        console.log(`[ENHANCED-EXPEDITION-SOCKET] Client initiated disconnect for user ${userId}`);
      } else if (reason === 'ping timeout') {
        console.warn(`[ENHANCED-EXPEDITION-SOCKET] Ping timeout disconnect for user ${userId}`);
      } else if (reason === 'transport close') {
        console.warn(`[ENHANCED-EXPEDITION-SOCKET] Transport close disconnect for user ${userId}`);
      } else if (reason === 'transport error') {
        console.error(`[ENHANCED-EXPEDITION-SOCKET] Transport error disconnect for user ${userId}`);
      }
    });
  });

  console.log('[ENHANCED-SOCKET.IO] Enhanced expedition handlers setup complete');
}