/**
 * First Officer Service - Workflow Coordination Layer
 * 
 * Manages First Officer Agent instances and coordinates expedition workflows.
 * Handles agent lifecycle, state persistence, and real-time communication.
 */

import { FirstOfficerAgent, LangChainMemoryStore, createMCPEnabledFirstOfficerAgent } from '@starships/agent-engine';
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

export class FirstOfficerService {
  private static instance: FirstOfficerService;
  private activeAgents: Map<string, FirstOfficerAgent> = new Map();
  private memoryStores: Map<string, LangChainMemoryStore> = new Map();
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

      // Create MCP-enabled First Officer Agent instance
      const firstOfficer = createMCPEnabledFirstOfficerAgent(
        expedition.starshipId,
        memoryStore,
        {
          maxRetries: 3,
          qualityThreshold: 70,
          timeoutMinutes: 60,
          requireUserApproval: false,
          enableParallelExecution: true,
          autoEscalation: true,
          mcpEnabled: true,
          mcpStarshipId: expedition.starshipId
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
        // Return a graceful response instead of throwing an error
        this.logger.warn('No active expedition found for user message', context);
        return {
          reply: "No active expedition found. Please start an expedition first.",
          usage: undefined
        };
      }

      // Store user message
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
}