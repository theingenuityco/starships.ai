/**
 * First Officer Service - Workflow Coordination Layer
 * 
 * Manages First Officer Agent instances and coordinates expedition workflows.
 * Handles agent lifecycle, state persistence, and real-time communication.
 */

import { 
  FirstOfficerAgent, 
  LangChainMemoryStore, 
  ProviderFactory,
  WebSocketEventEmitter
} from '@starships/agent-engine';
import { RepositoryFactory } from '@starships/models';
import {
  ExpeditionWorkflowState,
  WorkflowPhase,
  ChatRequest,
  ChatResponse
} from '@starships/protocol';
import { ExpeditionProgress } from '@starships/agent-engine';
import {
  ErrorFactory,
  NotFoundError,
  ValidationError,
  StandardError
} from '@starships/protocol/src/types/error-classes';
import { Logger } from '../utils/logger';
import { VirtualFirstOfficer } from './VirtualFirstOfficer';
import { VirtualFirstOfficerWorkflow } from './VirtualFirstOfficerWorkflow';
import { ContextBuilder } from './ContextBuilder';
import { SocketIOService } from './SocketIOService';

export class FirstOfficerService {
  private static instance: FirstOfficerService;
  private activeAgents: Map<string, FirstOfficerAgent> = new Map();
  private memoryStores: Map<string, LangChainMemoryStore> = new Map();
  private virtualFirstOfficers: Map<string, VirtualFirstOfficer> = new Map();
  private virtualFirstOfficerWorkflows: Map<string, VirtualFirstOfficerWorkflow> = new Map();
  private contextBuilder: ContextBuilder;
  private logger: Logger;
  private socketService: SocketIOService | null = null;

  private constructor() {
    this.logger = Logger.getInstance({ service: 'FirstOfficerService' });
    this.contextBuilder = new ContextBuilder();
    // Note: SocketIOService will be accessed lazily when needed
  }

  /**
   * Get SocketIOService instance lazily
   */
  private getSocketService(): SocketIOService | null {
    if (!this.socketService) {
      try {
        this.socketService = SocketIOService.getInstance();
        this.logger.info('SocketIOService successfully connected');
      } catch (error) {
        this.logger.warn('SocketIOService not available', undefined, { error: error instanceof Error ? error.message : String(error) });
        return null;
      }
    }
    return this.socketService;
  }

  static getInstance(): FirstOfficerService {
    if (!FirstOfficerService.instance) {
      FirstOfficerService.instance = new FirstOfficerService();
    }
    return FirstOfficerService.instance;
  }

  /**
   * Start expedition orchestration
   */
  async startExpedition(
    expeditionId: string,
    userId: string,
    objective: string
  ): Promise<string> {
    const context = {
      service: 'FirstOfficerService',
      operation: 'startExpedition',
      resource: 'expedition',
      resourceId: expeditionId,
      metadata: { userId, objective }
    };

    this.logger.info('Starting expedition orchestration', context);

    try {
      // Validate inputs
      if (!expeditionId?.trim()) {
        throw ErrorFactory.validation([
          { field: 'expeditionId', message: 'Expedition ID is required' }
        ], context);
      }

      if (!userId?.trim()) {
        throw ErrorFactory.validation(
          [{ field: 'userId', message: 'User ID is required' }],
          context
        );
      }

      if (!objective?.trim()) {
        throw ErrorFactory.validation(
          [{ field: 'objective', message: 'Expedition objective is required' }],
          context
        );
      }

      // Get expedition details
      const expeditionRepo = RepositoryFactory.getExpeditionRepository();
      const expedition = await expeditionRepo.findById(expeditionId);
      
      if (!expedition) {
        throw ErrorFactory.notFound(
          'Expedition',
          expeditionId,
          context
        );
      }

      // Initialize memory store for this expedition
      const memoryStore = new LangChainMemoryStore();
      this.memoryStores.set(expeditionId, memoryStore);

      // Create WebSocket message emission callback
      const messageEmitCallback = async (message: any) => {
        const socketSvc = this.getSocketService();
        if (socketSvc) {
          const expeditionRoom = `expedition:${expeditionId}`;
          const eventData = {
            expeditionId,
            message,
            timestamp: new Date().toISOString()
          };
          
          console.log(`📡 [FIRST-OFFICER-SERVICE] About to emit WebSocket event to room: ${expeditionRoom}`);
          console.log(`📡 [FIRST-OFFICER-SERVICE] Event data:`, JSON.stringify(eventData, null, 2));
          
          socketSvc.getIO().to(expeditionRoom).emit('message:sent', eventData);
          
          console.log(`✅ [FIRST-OFFICER-SERVICE] WebSocket event emitted successfully for First Officer message`);
        } else {
          console.warn(`⚠️ [FIRST-OFFICER-SERVICE] SocketIOService not available for message emission`);
        }
      };

      // Initialize ProviderFactory for LLM access
      const agentRepo = RepositoryFactory.getAgentRepository();
      const llmRepo = RepositoryFactory.getLLMRepository();
      ProviderFactory.initialize(agentRepo, llmRepo);

      // Create WebSocketEventEmitter with socket server
      const webSocketEmitter = new WebSocketEventEmitter();
      const socketSvc = this.getSocketService();
      if (socketSvc) {
        webSocketEmitter.setSocketServer(socketSvc.getIO());
      }

      // Create First Officer Agent instance with proper configuration
      const firstOfficer = new FirstOfficerAgent(
        expedition.starshipId,
        memoryStore,
        {
          maxRetries: 3,
          qualityThreshold: 70,
          timeoutMinutes: 60,
          requireUserApproval: false,
          enableParallelExecution: false, // Disable parallel execution as per plan
          autoEscalation: true
        },
        expedition.assignedAgents, // Pass selected agents from expedition
        messageEmitCallback, // Pass WebSocket emission callback
        webSocketEmitter // Pass WebSocket event emitter for activity events
      );

      // Store active agent
      this.activeAgents.set(expeditionId, firstOfficer);

      // Emit expedition started event
      const socketSvcStart = this.getSocketService();
      if (socketSvcStart) {
        const expeditionRoom = `expedition:${expeditionId}`;
        socketSvcStart.getIO().to(expeditionRoom).emit('expedition:started' as any, {
          expeditionId,
          userId,
          objective,
          timestamp: new Date().toISOString(),
          assignedAgents: expedition.assignedAgents
        });
      }

      // Start orchestration with real-time updates
      const result = await firstOfficer.startExpedition(expeditionId, userId, objective);

      // Emit expedition completed event
      const socketSvcEnd = this.getSocketService();
      if (socketSvcEnd) {
        const expeditionRoom = `expedition:${expeditionId}`;
        socketSvcEnd.getIO().to(expeditionRoom).emit('expedition:completed' as any, {
          expeditionId,
          result: result.substring(0, 500), // Truncate for performance
          timestamp: new Date().toISOString()
        });
      }

      this.logger.info('Expedition orchestration completed successfully', {
        ...context,
        metadata: { ...context.metadata, result: result.substring(0, 100) + '...' }
      });

      return result;

    } catch (error) {
      // Clean up on failure
      this.activeAgents.delete(expeditionId);
      this.memoryStores.delete(expeditionId);

      if (error instanceof StandardError) {
        this.logger.error('Failed to start expedition', error as StandardError, context);
        throw error;
      }

      const standardError = new StandardError(
        'EXPEDITION_WORKFLOW_FAILED',
        'Failed to start expedition orchestration',
        { originalError: error instanceof Error ? error.message : String(error) },
        context
      );

      this.logger.error('Failed to start expedition', error instanceof Error ? error : undefined, context);
      throw standardError;
    }
  }


  /**
   * Resume an interrupted expedition
   */
  async resumeExpedition(
    expeditionId: string,
    userId: string
  ): Promise<string> {
    const context = {
      service: 'FirstOfficerService',
      operation: 'resumeExpedition',
      resource: 'expedition',
      resourceId: expeditionId,
      metadata: { userId }
    };

    this.logger.info('Resuming expedition from checkpoint', context);

    try {
      // Validate inputs
      if (!expeditionId?.trim()) {
        throw ErrorFactory.validation([
          { field: 'expeditionId', message: 'Expedition ID is required' }
        ], context);
      }

      if (!userId?.trim()) {
        throw ErrorFactory.validation(
          [{ field: 'userId', message: 'User ID is required' }],
          context
        );
      }

      // Get the active First Officer agent
      const firstOfficer = this.activeAgents.get(expeditionId);
      
      if (!firstOfficer) {
        this.logger.warn('No active First Officer found, creating new instance', context);
        
        // Recreate the First Officer instance
        const expedition = await RepositoryFactory.getExpeditionRepository().findById(expeditionId);
        if (!expedition) {
          throw ErrorFactory.notFound('Expedition', expeditionId, context);
        }

        // Get or create memory store
        let memoryStore = this.memoryStores.get(expeditionId);
        if (!memoryStore) {
          memoryStore = new LangChainMemoryStore();
          this.memoryStores.set(expeditionId, memoryStore);
        }

        // Create WebSocket message emission callback
        const messageEmitCallback = async (message: any) => {
          const socketSvc = this.getSocketService();
          if (socketSvc) {
            const expeditionRoom = `expedition:${expeditionId}`;
            socketSvc.getIO().to(expeditionRoom).emit('message:sent', {
              expeditionId,
              message,
              timestamp: new Date().toISOString()
            });
          }
        };

        // Create WebSocketEventEmitter with socket server
        const webSocketEmitter = new WebSocketEventEmitter();
        const socketSvcEmitter = this.getSocketService();
        if (socketSvcEmitter) {
          webSocketEmitter.setSocketServer(socketSvcEmitter.getIO());
        }

        // Create First Officer Agent instance
        const newFirstOfficer = new FirstOfficerAgent(
          expedition.starshipId,
          memoryStore,
          {
            maxRetries: 3,
            qualityThreshold: 70,
            timeoutMinutes: 60,
            requireUserApproval: false,
            enableParallelExecution: false,
            autoEscalation: true
          },
          expedition.assignedAgents,
          messageEmitCallback,
          webSocketEmitter
        );

        this.activeAgents.set(expeditionId, newFirstOfficer);
        
        // Resume the expedition
        const result = await (newFirstOfficer as any).resumeExpedition(expeditionId, userId);
        
        this.logger.info('Expedition resumed successfully', {
          ...context,
          metadata: { ...context.metadata, fromCheckpoint: true }
        });
        
        return result;
      }
      
      // Use existing First Officer to resume
      const result = await (firstOfficer as any).resumeExpedition(expeditionId, userId);
      
      this.logger.info('Expedition resumed successfully', {
        ...context,
        metadata: { ...context.metadata, fromCheckpoint: true }
      });
      
      return result;
      
    } catch (error) {
      this.logger.error('Failed to resume expedition', error instanceof Error ? error : undefined, context);
      throw error;
    }
  }

  /**
   * Pause expedition orchestration
   */
  async pauseExpedition(expeditionId: string): Promise<void> {
    const context = {
      service: 'FirstOfficerService',
      operation: 'pauseExpedition',
      resource: 'expedition',
      resourceId: expeditionId
    };

    this.logger.info('Pausing expedition orchestration', context);

    try {
      if (!expeditionId?.trim()) {
        throw ErrorFactory.validation(
          [{ field: 'expeditionId', message: 'Expedition ID is required' }],
          context
        );
      }

      const firstOfficer = this.activeAgents.get(expeditionId);
      if (!firstOfficer) {
        throw ErrorFactory.notFound(
          'First Officer',
          expeditionId,
          context
        );
      }

      // Update expedition status
      const expeditionRepo = RepositoryFactory.getExpeditionRepository();
      await expeditionRepo.updateStatus(expeditionId, 'in-progress');

      this.logger.info('Expedition orchestration paused successfully', context);
    } catch (error) {
      if (error instanceof StandardError) {
        this.logger.error('Failed to pause expedition', error as StandardError, context);
        throw error;
      }

      const standardError = new StandardError(
        'STATUS_UPDATE_FAILED',
        'Failed to pause expedition orchestration',
        { originalError: error instanceof Error ? error.message : String(error) },
        context
      );

      this.logger.error('Failed to pause expedition', error instanceof Error ? error : undefined, context);
      throw standardError;
    }
  }

  /**
   * Resume expedition orchestration (deprecated - use resumeExpedition with userId)
   */
  async resumeExpeditionDeprecated(expeditionId: string): Promise<void> {
    const context = {
      service: 'FirstOfficerService',
      operation: 'resumeExpedition',
      resource: 'expedition',
      resourceId: expeditionId
    };

    this.logger.info('Resuming expedition orchestration', context);

    try {
      if (!expeditionId?.trim()) {
        throw ErrorFactory.validation(
          [{ field: 'expeditionId', message: 'Expedition ID is required' }],
          context
        );
      }

      const firstOfficer = this.activeAgents.get(expeditionId);
      if (!firstOfficer) {
        throw ErrorFactory.notFound(
          'First Officer',
          expeditionId,
          context
        );
      }

      // Update expedition status
      const expeditionRepo = RepositoryFactory.getExpeditionRepository();
      await expeditionRepo.updateStatus(expeditionId, 'in-progress');

      this.logger.info('Expedition orchestration resumed successfully', context);
    } catch (error) {
      if (error instanceof StandardError) {
        this.logger.error('Failed to resume expedition', error as StandardError, context);
        throw error;
      }

      const standardError = new StandardError(
        'STATUS_UPDATE_FAILED',
        'Failed to resume expedition orchestration',
        { originalError: error instanceof Error ? error.message : String(error) },
        context
      );

      this.logger.error('Failed to resume expedition', error instanceof Error ? error : undefined, context);
      throw standardError;
    }
  }

  /**
   * Cancel expedition orchestration
   */
  async cancelExpedition(expeditionId: string): Promise<void> {
    console.log(`[FIRST-OFFICER-SERVICE] Cancelling expedition: ${expeditionId}`);

    const firstOfficer = this.activeAgents.get(expeditionId);
    if (firstOfficer) {
      // Clean up active agent and memory
      this.activeAgents.delete(expeditionId);
      this.memoryStores.delete(expeditionId);
    }

    // Update expedition status
    const expeditionRepo = RepositoryFactory.getExpeditionRepository();
    await expeditionRepo.updateStatus(expeditionId, 'cancelled');

    console.log(`[FIRST-OFFICER-SERVICE] Expedition cancelled: ${expeditionId}`);
  }

  /**
   * Handle user message during expedition
   */
  async handleUserMessage(
    expeditionId: string,
    userId: string,
    message: string
  ): Promise<ChatResponse> {
    const context = {
      service: 'FirstOfficerService',
      operation: 'handleUserMessage',
      resource: 'expedition',
      resourceId: expeditionId,
      metadata: { userId, messageLength: message?.length }
    };

    this.logger.info('Handling user message for expedition', context);

    try {
      // Validate inputs
      if (!expeditionId?.trim()) {
        throw ErrorFactory.validation(
          [{ field: 'expeditionId', message: 'Expedition ID is required' }],
          context
        );
      }

      if (!userId?.trim()) {
        throw ErrorFactory.validation(
          [{ field: 'userId', message: 'User ID is required' }],
          context
        );
      }

      if (!message?.trim()) {
        throw ErrorFactory.validation(
          [{ field: 'message', message: 'Message content is required' }],
          context
        );
      }

      const firstOfficer = this.activeAgents.get(expeditionId);
      if (!firstOfficer) {
        // Try to get or create a Virtual First Officer for this expedition
        const expeditionRepo = RepositoryFactory.getExpeditionRepository();
        const expedition = await expeditionRepo.findById(expeditionId);
        
        if (expedition) {
          const virtualFirstOfficer = await this.getOrCreateVirtualFirstOfficerForExpedition(
            expeditionId,
            expedition.starshipId,
            expedition
          );
          
          // Get or create workflow for LangGraph orchestration
          const workflow = await this.getOrCreateVirtualFirstOfficerWorkflow(
            expeditionId,
            virtualFirstOfficer
          );
          
          // Process message with LangGraph workflow
          const workflowResult = await workflow.executeWorkflow({
            expeditionId,
            starshipId: expedition.starshipId,
            userId,
            userMessage: message
          });
          
          const response = workflowResult.response || "I encountered an error processing your message.";
          
          this.logger.info('Message handled by Virtual First Officer', {
            ...context,
            metadata: { ...context.metadata, responseLength: response.length }
          });
          
          return {
            reply: response,
            usage: undefined
          };
        }
        
        // Return a graceful response if no expedition found
        this.logger.warn('No active expedition found for user message', context);
        return {
          reply: "No active expedition found. Please start an expedition first.",
          usage: undefined
        };
      }

      // The FirstOfficerService should not create messages directly
      // Messages are already created by the MessageService that calls this method
      // Just handle the First Officer logic and return a response
      
      console.log('[FIRST-OFFICER-SERVICE] Processing First Officer message (messages handled by MessageService)');

      // For now, just return a simple response since the actual logic is complex
      // The message handling and WebSocket emission is done by MessageService
      console.log(`[FIRST-OFFICER-SERVICE] Generating First Officer response for expedition ${expeditionId}`);

      // Return a First Officer response
      const reply = `Thank you for your message. I'm coordinating the expedition and will provide updates as tasks progress. If you need immediate assistance, please let me know.`;

      this.logger.info('User message handled successfully', {
        ...context,
        metadata: { 
          ...context.metadata, 
          responseLength: reply.length
        }
      });

      return {
        reply,
        usage: undefined
      };
    } catch (error) {
      if (error instanceof StandardError) {
        this.logger.error('Failed to handle user message', error as StandardError, context);
        return {
          reply: "I encountered an error processing your message. Please try again.",
          usage: undefined
        };
      }

      const standardError = new StandardError(
        'MESSAGE_SEND_FAILED',
        'Failed to handle user message',
        { originalError: error instanceof Error ? error.message : String(error) },
        context
      );

      this.logger.error('Failed to handle user message', error instanceof Error ? error : undefined, context);
      return {
        reply: "I encountered an error processing your message. Please try again.",
        usage: undefined
      };
    }
  }

  /**
   * Get expedition progress
   */
  async getExpeditionProgress(expeditionId: string): Promise<ExpeditionProgress | null> {
    const firstOfficer = this.activeAgents.get(expeditionId);
    if (!firstOfficer) {
      return null;
    }

    return await firstOfficer.getExpeditionStatus(expeditionId);
  }

  /**
   * Get active expeditions count
   */
  getActiveExpeditionsCount(): number {
    return this.activeAgents.size;
  }

  /**
   * Get active expedition IDs
   */
  getActiveExpeditionIds(): string[] {
    return Array.from(this.activeAgents.keys());
  }

  /**
   * Check if expedition is active
   */
  isExpeditionActive(expeditionId: string): boolean {
    return this.activeAgents.has(expeditionId);
  }

  /**
   * Clean up completed expedition
   */
  async cleanupExpedition(expeditionId: string): Promise<void> {
    console.log(`[FIRST-OFFICER-SERVICE] Cleaning up expedition: ${expeditionId}`);

    // Remove from active agents
    this.activeAgents.delete(expeditionId);
    
    // Clean up memory store
    const memoryStore = this.memoryStores.get(expeditionId);
    if (memoryStore) {
      // Memory cleanup would be handled by the store implementation
      this.memoryStores.delete(expeditionId);
    }

    console.log(`[FIRST-OFFICER-SERVICE] Expedition cleanup completed: ${expeditionId}`);
  }

  /**
   * Handle expedition status updates from First Officer
   */
  async handleStatusUpdate(
    expeditionId: string,
    phase: WorkflowPhase,
    progress: ExpeditionProgress
  ): Promise<void> {
    console.log(`[FIRST-OFFICER-SERVICE] Status update for ${expeditionId}: ${phase}`);

    try {
      // Update expedition workflow state
      const expeditionRepo = RepositoryFactory.getExpeditionRepository();
      const expedition = await expeditionRepo.findById(expeditionId);
      
      if (expedition) {
        const workflowState: ExpeditionWorkflowState = {
          expeditionId,
          currentPhase: phase,
          requirements: expedition.mission,
          taskBreakdown: [],
          agentAssignments: {},
          agentResults: {},
          userId: expedition.createdBy,
          starshipId: expedition.starshipId,
          errors: progress.issues,
          retryCount: 0,
          lastUpdated: new Date().toISOString()
        };

        await expeditionRepo.updateWorkflowState(expeditionId, workflowState);
      }
    } catch (error) {
      console.error(`[FIRST-OFFICER-SERVICE] Failed to handle status update:`, error);
    }
  }

  /**
   * Handle task completion from First Officer
   */
  async handleTaskCompletion(
    expeditionId: string,
    taskId: string,
    result: string,
    agentId: string
  ): Promise<void> {
    console.log(`[FIRST-OFFICER-SERVICE] Task completed: ${taskId} in expedition: ${expeditionId}`);

    try {
      // Update task status
      const taskRepo = RepositoryFactory.getExpeditionTaskRepository();
      await taskRepo.update(taskId, {
        status: 'completed',
        result,
        updatedAt: new Date().toISOString()
      });

      // Get expedition details for user notification
      const expeditionRepo = RepositoryFactory.getExpeditionRepository();
      const expedition = await expeditionRepo.findById(expeditionId);

    } catch (error) {
      console.error(`[FIRST-OFFICER-SERVICE] Failed to handle task completion:`, error);
    }
  }

  /**
   * Handle expedition completion
   */
  async handleExpeditionCompletion(
    expeditionId: string,
    finalResult: string
  ): Promise<void> {
    console.log(`[FIRST-OFFICER-SERVICE] Expedition completed: ${expeditionId}`);

    try {
      // Update expedition status and result
      const expeditionRepo = RepositoryFactory.getExpeditionRepository();
      await expeditionRepo.update(expeditionId, {
        status: 'completed',
        result: finalResult,
        updatedAt: new Date().toISOString()
      });


      // Clean up resources
      await this.cleanupExpedition(expeditionId);
    } catch (error) {
      console.error(`[FIRST-OFFICER-SERVICE] Failed to handle expedition completion:`, error);
    }
  }

  /**
   * Calculate expedition duration
   */
  private calculateExpeditionDuration(expeditionId: string): number {
    // This would calculate the actual duration based on start/end times
    // For now, return a placeholder value
    return 0;
  }

  /**
   * Build complete expedition context with all details
   */
  private async buildCompleteExpeditionContext(expedition: any): Promise<any> {
    const agentRepo = RepositoryFactory.getAgentRepository();
    const taskRepo = RepositoryFactory.getExpeditionTaskRepository();
    const resultRepo = RepositoryFactory.getExpeditionResultRepository();
    const messageRepo = RepositoryFactory.getExpeditionMessageRepository();

    // Fetch all tasks for the expedition first
    const allTasks = await taskRepo.findByExpedition(expedition.id);

    // Fetch agent details with their current tasks
    const assignedAgents = [];
    for (const agentId of (expedition.assignedAgents || [])) {
      try {
        const agent = await agentRepo.findById(agentId);
        if (agent) {
          // Get tasks assigned to this agent
          const agentTasks = allTasks.filter(task => task.assignedAgentId === agentId);
          const activeTasks = agentTasks.filter(t => t.status === 'in-progress' || t.status === 'assigned');
          const completedTasks = agentTasks.filter(t => t.status === 'completed');
          
          this.logger.debug('Found agent details with tasks', {
            service: 'FirstOfficerService',
            operation: 'buildCompleteExpeditionContext'
          }, {
            agentId: agent.id,
            agentName: agent.name,
            agentCategory: agent.category,
            totalTasks: agentTasks.length,
            activeTasks: activeTasks.length,
            completedTasks: completedTasks.length
          });
          
          // Determine agent status based on active tasks
          let agentStatus: 'online' | 'offline' | 'busy' = 'online';
          if (activeTasks.length > 0) {
            agentStatus = 'busy';
          }
          
          assignedAgents.push({
            id: agent.id,
            name: agent.name,
            role: agent.category || 'general',
            status: agentStatus,
            currentTasks: activeTasks.map(t => ({
              id: t.id,
              title: t.title,
              status: t.status,
              priority: t.priority,
              progress: 0  // ExpeditionTask doesn't have progress field
            })),
            completedTasksCount: completedTasks.length,
            totalTasksCount: agentTasks.length
          });
        } else {
          this.logger.warn('Agent not found in database', {
            service: 'FirstOfficerService',
            operation: 'buildCompleteExpeditionContext'
          }, {
            agentId
          });
        }
      } catch (error) {
        this.logger.warn('Failed to fetch agent details', {
          service: 'FirstOfficerService',
          operation: 'buildCompleteExpeditionContext'
        }, {
          agentId,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    // Create enhanced task summaries with agent names
    const agentMap = new Map(assignedAgents.map(a => [a.id, a]));
    const taskSummaries = allTasks.map(task => {
      const assignedAgent = task.assignedAgentId ? agentMap.get(task.assignedAgentId) : null;
      return {
        id: task.id,
        title: task.title,
        status: task.status,
        assignedTo: task.assignedAgentId,
        assignedAgentName: assignedAgent?.name || 'Unassigned',
        priority: task.priority || 'medium',
        progress: 0,  // ExpeditionTask doesn't have progress field
        createdAt: task.createdAt,
        completedAt: task.status === 'completed' ? task.updatedAt : undefined
      };
    });

    // Fetch recent results
    const results = await resultRepo.findByExpedition(expedition.id);
    const resultSummaries = results.slice(0, 10).map(result => ({
      id: result.id,
      taskId: '',
      content: result.content,
      createdAt: result.createdAt,
      createdBy: result.createdBy
    }));

    // Fetch recent messages
    const messages = await messageRepo.getLatestMessages(expedition.id, 20);
    const messageSummaries = messages.map(msg => ({
      id: msg.id,
      sender: msg.agentId || msg.userId || 'system',
      content: msg.content,
      timestamp: msg.timestamp,
      type: msg.role === 'user' ? 'user' as const : msg.role === 'agent' ? 'agent' as const : 'system' as const
    }));

    // Calculate statistics
    const completedTasks = allTasks.filter(t => t.status === 'completed').length;
    const activeTasks = allTasks.filter(t => t.status === 'in-progress' || t.status === 'assigned').length;
    const failedTasks = allTasks.filter(t => t.status === 'failed').length;
    const blockedTasks = allTasks.filter(t => t.status === 'blocked').length;

    return {
      expeditionId: expedition.id,
      starshipId: expedition.starshipId,
      state: expedition.status || 'active',
      title: expedition.name || 'Expedition',
      objective: expedition.mission || 'Complete expedition tasks',
      createdAt: expedition.createdAt,
      assignedAgents,
      tasks: taskSummaries,
      results: resultSummaries,
      recentMessages: messageSummaries,
      statistics: {
        totalTasks: allTasks.length,
        completedTasks,
        activeTasks,
        failedTasks,
        blockedTasks,
        totalMessages: messages.length,
        averageCompletionTime: 0,
        agentsWorking: assignedAgents.filter(a => a.currentTasks && a.currentTasks.length > 0).length,
        totalAgents: assignedAgents.length
      }
    };
  }

  /**
   * Get or create a Virtual First Officer workflow instance
   */
  async getOrCreateVirtualFirstOfficerWorkflow(
    expeditionId: string,
    virtualFirstOfficer: VirtualFirstOfficer
  ): Promise<VirtualFirstOfficerWorkflow> {
    const context = {
      service: 'FirstOfficerService',
      operation: 'getOrCreateVirtualFirstOfficerWorkflow',
      resource: 'virtualFirstOfficerWorkflow',
      resourceId: expeditionId
    };

    try {
      // Check if we already have a workflow for this expedition
      if (this.virtualFirstOfficerWorkflows.has(expeditionId)) {
        return this.virtualFirstOfficerWorkflows.get(expeditionId)!;
      }

      // Create a new workflow
      const workflow = new VirtualFirstOfficerWorkflow(
        virtualFirstOfficer,
        this.contextBuilder,
        {
          maxRetries: 3,
          enableSemanticSearch: true,
          contextRefreshInterval: 60000
        }
      );
      
      // Store it in our map
      this.virtualFirstOfficerWorkflows.set(expeditionId, workflow);
      
      this.logger.info('Created Virtual First Officer workflow for expedition', {
        ...context,
        metadata: { expeditionId }
      });
      
      return workflow;
    } catch (error) {
      this.logger.error(
        'Failed to create Virtual First Officer workflow',
        error instanceof Error ? error : undefined,
        context
      );
      throw error;
    }
  }

  /**
   * Get or create a Virtual First Officer instance for a starship
   */
  async getOrCreateVirtualFirstOfficer(starshipId: string): Promise<VirtualFirstOfficer> {
    const context = {
      service: 'FirstOfficerService',
      operation: 'getOrCreateVirtualFirstOfficer',
      resource: 'virtualFirstOfficer',
      resourceId: starshipId
    };

    try {
      // Check if we already have a Virtual First Officer for this starship
      if (this.virtualFirstOfficers.has(starshipId)) {
        return this.virtualFirstOfficers.get(starshipId)!;
      }

      // Get message repository for persistence
      const messageRepository = RepositoryFactory.getExpeditionMessageRepository();

      // Create a new Virtual First Officer with default config and repository injection
      // Note: In a real implementation, we'd fetch expedition details
      const config = {
        expeditionId: 'virtual', // Placeholder expedition ID
        starshipId: starshipId,
        context: {
          expeditionId: 'virtual',
          starshipId: starshipId,
          state: 'active' as const,
          title: 'Virtual First Officer Session',
          objective: 'Assist with expedition coordination',
          createdAt: new Date().toISOString(),
          assignedAgents: [],
          tasks: [],
          results: [],
          recentMessages: [],
          statistics: {
            totalTasks: 0,
            completedTasks: 0,
            activeTasks: 0,
            failedTasks: 0,
            totalMessages: 0,
            averageCompletionTime: 0
          }
        },
        conversationMemory: {
          messages: [],
          maxMessages: 50
        },
        messageRepository: messageRepository // Inject repository for persistence
      };
      
      const virtualFirstOfficer = new VirtualFirstOfficer(config);
      
      // Store it in our map
      this.virtualFirstOfficers.set(starshipId, virtualFirstOfficer);
      
      this.logger.info('Created Virtual First Officer for starship', {
        ...context,
        metadata: { starshipId }
      });
      
      return virtualFirstOfficer;
    } catch (error) {
      this.logger.error(
        'Failed to create Virtual First Officer',
        error instanceof Error ? error : undefined,
        context
      );
      throw error;
    }
  }

  /**
   * Get or create a Virtual First Officer instance for a specific expedition
   * Phase 1.2: Enhanced version that loads conversation history for real expeditions
   */
  async getOrCreateVirtualFirstOfficerForExpedition(
    expeditionId: string,
    starshipId: string,
    expedition: any
  ): Promise<VirtualFirstOfficer> {
    const context = {
      service: 'FirstOfficerService',
      operation: 'getOrCreateVirtualFirstOfficerForExpedition',
      resource: 'virtualFirstOfficer',
      resourceId: expeditionId
    };

    try {
      // Check if we already have a Virtual First Officer for this expedition
      if (this.virtualFirstOfficers.has(expeditionId)) {
        return this.virtualFirstOfficers.get(expeditionId)!;
      }

      // Get message repository for persistence
      const messageRepository = RepositoryFactory.getExpeditionMessageRepository();

      // Build complete expedition context with agent details
      const expeditionContext = await this.buildCompleteExpeditionContext(expedition);

      const config = {
        expeditionId: expedition.id,
        starshipId: expedition.starshipId,
        context: expeditionContext,
        conversationMemory: {
          messages: [],
          maxMessages: 50
        },
        messageRepository: messageRepository // Inject repository for persistence
      };
      
      const virtualFirstOfficer = new VirtualFirstOfficer(config);
      
      // Store it in our map using expedition ID as key
      this.virtualFirstOfficers.set(expeditionId, virtualFirstOfficer);
      
      this.logger.info('Created Virtual First Officer for expedition', {
        ...context,
        metadata: { expeditionId, starshipId }
      });
      
      return virtualFirstOfficer;
    } catch (error) {
      this.logger.error(
        'Failed to create Virtual First Officer for expedition',
        error instanceof Error ? error : undefined,
        context
      );
      throw error;
    }
  }
}