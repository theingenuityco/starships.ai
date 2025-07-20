/**
 * First Officer Service - Workflow Coordination Layer
 * 
 * Manages First Officer Agent instances and coordinates expedition workflows.
 * Handles agent lifecycle, state persistence, and real-time communication.
 */

import { FirstOfficerAgent, LangChainMemoryStore } from '@starships/agent-engine';
import { RepositoryFactory } from '@starships/models';
import { SocketIOService } from './SocketIOService';
import {
  ExpeditionWorkflowState,
  WorkflowPhase,
  ChatRequest,
  ChatResponse
} from '@starships/protocol';
import { ExpeditionProgress } from '@starships/agent-engine';

export class FirstOfficerService {
  private static instance: FirstOfficerService;
  private activeAgents: Map<string, FirstOfficerAgent> = new Map();
  private memoryStores: Map<string, LangChainMemoryStore> = new Map();
  private socketService?: SocketIOService;

  private constructor() {
    // SocketIOService will be initialized lazily to avoid initialization order issues
  }

  static getInstance(): FirstOfficerService {
    if (!FirstOfficerService.instance) {
      FirstOfficerService.instance = new FirstOfficerService();
    }
    return FirstOfficerService.instance;
  }

  private getSocketService(): SocketIOService {
    if (!this.socketService) {
      this.socketService = SocketIOService.getInstance();
    }
    return this.socketService;
  }

  /**
   * Start expedition orchestration
   */
  async startExpedition(
    expeditionId: string,
    userId: string,
    objective: string
  ): Promise<string> {
    console.log(`[FIRST-OFFICER-SERVICE] Starting expedition: ${expeditionId}`);

    try {
      // Get expedition details
      const expeditionRepo = RepositoryFactory.getExpeditionRepository();
      const expedition = await expeditionRepo.findById(expeditionId);
      
      if (!expedition) {
        throw new Error(`Expedition not found: ${expeditionId}`);
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
        }
      );

      // Store active agent
      this.activeAgents.set(expeditionId, firstOfficer);

      // Start orchestration
      const result = await firstOfficer.startExpedition(expeditionId, userId, objective);

      console.log(`[FIRST-OFFICER-SERVICE] Expedition orchestration completed: ${expeditionId}`);
      return result;

    } catch (error) {
      console.error(`[FIRST-OFFICER-SERVICE] Failed to start expedition:`, error);
      
      // Clean up on failure
      this.activeAgents.delete(expeditionId);
      this.memoryStores.delete(expeditionId);
      
      throw error;
    }
  }

  /**
   * Pause expedition orchestration
   */
  async pauseExpedition(expeditionId: string): Promise<void> {
    console.log(`[FIRST-OFFICER-SERVICE] Pausing expedition: ${expeditionId}`);

    const firstOfficer = this.activeAgents.get(expeditionId);
    if (!firstOfficer) {
      throw new Error(`No active First Officer found for expedition: ${expeditionId}`);
    }

    // Update expedition status
    const expeditionRepo = RepositoryFactory.getExpeditionRepository();
    await expeditionRepo.updateStatus(expeditionId, 'review');

    // Emit pause event
    const expedition = await expeditionRepo.findById(expeditionId);
    if (expedition) {
      this.getSocketService().emitToUser(expedition.createdBy, 'expedition:paused', {
        expeditionId,
        timestamp: new Date().toISOString()
      });
    }

    console.log(`[FIRST-OFFICER-SERVICE] Expedition paused: ${expeditionId}`);
  }

  /**
   * Resume expedition orchestration
   */
  async resumeExpedition(expeditionId: string): Promise<void> {
    console.log(`[FIRST-OFFICER-SERVICE] Resuming expedition: ${expeditionId}`);

    const firstOfficer = this.activeAgents.get(expeditionId);
    if (!firstOfficer) {
      throw new Error(`No active First Officer found for expedition: ${expeditionId}`);
    }

    // Update expedition status
    const expeditionRepo = RepositoryFactory.getExpeditionRepository();
    await expeditionRepo.updateStatus(expeditionId, 'in-progress');

    // Emit resume event
    const expedition = await expeditionRepo.findById(expeditionId);
    if (expedition) {
      this.getSocketService().emitToUser(expedition.createdBy, 'expedition:resumed', {
        expeditionId,
        timestamp: new Date().toISOString()
      });
    }

    console.log(`[FIRST-OFFICER-SERVICE] Expedition resumed: ${expeditionId}`);
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

    // Emit cancel event
    const expedition = await expeditionRepo.findById(expeditionId);
    if (expedition) {
      this.getSocketService().emitToUser(expedition.createdBy, 'expedition:cancelled', {
        expeditionId,
        timestamp: new Date().toISOString()
      });
    }

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
    console.log(`[FIRST-OFFICER-SERVICE] Handling user message for expedition: ${expeditionId}`);

    const firstOfficer = this.activeAgents.get(expeditionId);
    if (!firstOfficer) {
      return {
        reply: "No active expedition found. Please start an expedition first.",
        usage: undefined
      };
    }

    try {
      // Store user message
      const messageRepo = RepositoryFactory.getExpeditionMessageRepository();
      await messageRepo.create({
        expeditionId,
        role: 'user',
        userId,
        content: message,
        messageType: 'user-input',
        timestamp: new Date().toISOString()
      });

      // Get response from First Officer
      const response = await firstOfficer.handleUserMessage(expeditionId, message);

      // Store First Officer response
      await messageRepo.create({
        expeditionId,
        role: 'first-officer',
        content: response.reply,
        messageType: 'coordination',
        timestamp: new Date().toISOString()
      });

      // Emit message events
      this.getSocketService().emitToUser(userId, 'expedition:message', {
        expeditionId,
        role: 'first-officer',
        content: response.reply,
        timestamp: new Date().toISOString()
      });

      return response;
    } catch (error) {
      console.error(`[FIRST-OFFICER-SERVICE] Failed to handle user message:`, error);
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

        // Emit real-time status update
        this.getSocketService().emitToUser(expedition.createdBy, 'expedition:status-update', {
          expeditionId,
          phase,
          progress,
          timestamp: new Date().toISOString()
        });
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

      if (expedition) {
        // Emit task completion event
        this.getSocketService().emitToUser(expedition.createdBy, 'expedition:task-completed', {
          expeditionId,
          taskId,
          result,
          agentId,
          timestamp: new Date().toISOString()
        });
      }
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

      // Get expedition details
      const expedition = await expeditionRepo.findById(expeditionId);
      if (expedition) {
        // Emit completion event
        this.getSocketService().emitToUser(expedition.createdBy, 'expedition:completed', {
          expeditionId,
          result: finalResult,
          timestamp: new Date().toISOString()
        });
      }

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