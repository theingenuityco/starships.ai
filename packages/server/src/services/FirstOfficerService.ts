/**
 * First Officer Service - Workflow Coordination Layer
 * 
 * Manages First Officer Agent instances and coordinates expedition workflows.
 * Handles agent lifecycle, state persistence, and real-time communication.
 */

import { FirstOfficerAgent, LangChainMemoryStore } from '@starships/agent-engine';
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

export class FirstOfficerService {
  private static instance: FirstOfficerService;
  private activeAgents: Map<string, FirstOfficerAgent> = new Map();
  private memoryStores: Map<string, LangChainMemoryStore> = new Map();
  private virtualFirstOfficers: Map<string, VirtualFirstOfficer> = new Map();
  private logger: Logger;

  private constructor() {
    this.logger = Logger.getInstance({ service: 'FirstOfficerService' });
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

      // Create First Officer Agent instance
      const firstOfficer = new FirstOfficerAgent(
        expedition.starshipId,
        memoryStore,
        {
          maxRetries: 3,
          qualityThreshold: 70,
          timeoutMinutes: 60,
          requireUserApproval: false,
          enableParallelExecution: true,
          autoEscalation: true
        },
        expedition.assignedAgents // Pass selected agents from expedition
      );

      // Store active agent
      this.activeAgents.set(expeditionId, firstOfficer);

      // Start orchestration
      const result = await firstOfficer.startExpedition(expeditionId, userId, objective);

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
      await expeditionRepo.updateStatus(expeditionId, 'review');

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
   * Resume expedition orchestration
   */
  async resumeExpedition(expeditionId: string): Promise<void> {
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
          
          // Process message with Virtual First Officer
          const response = await virtualFirstOfficer.processMessage(message, userId);
          
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

      // Store user message (existing logic for regular FirstOfficer agents)
      const messageRepo = RepositoryFactory.getExpeditionMessageRepository();
      await messageRepo.create({
        expeditionId,
        role: 'user',
        userId,
        content: message,
        messageType: 'user-input',
        timestamp: new Date().toISOString(),
        metadata: {}
      });

      // Get response from First Officer
      const response = await firstOfficer.handleUserMessage(expeditionId, message);

      // Store First Officer response
      await messageRepo.create({
        expeditionId,
        role: 'first-officer',
        content: response.reply,
        messageType: 'coordination',
        timestamp: new Date().toISOString(),
        metadata: {}
      });

      this.logger.info('User message handled successfully', {
        ...context,
        metadata: { ...context.metadata, responseLength: response.reply?.length }
      });

      return response;
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
          requirements: expedition.objective,
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
        actualDuration: this.calculateExpeditionDuration(expeditionId),
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

      // Create expedition context from real expedition data
      const expeditionContext = {
        expeditionId: expedition.id,
        starshipId: expedition.starshipId,
        state: expedition.status || 'active',
        title: expedition.title || 'Expedition',
        objective: expedition.objective || 'Complete expedition tasks',
        createdAt: expedition.createdAt,
        assignedAgents: expedition.assignedAgents || [],
        tasks: [], // Would be populated from ExpeditionTaskRepository
        results: [], // Would be populated from ExpeditionResultRepository
        recentMessages: [], // Will be loaded from message history
        statistics: {
          totalTasks: 0,
          completedTasks: 0,
          activeTasks: 0,
          failedTasks: 0,
          totalMessages: 0,
          averageCompletionTime: 0
        }
      };

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