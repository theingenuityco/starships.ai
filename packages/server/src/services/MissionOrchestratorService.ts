/**
 * Mission Orchestrator Service - Core Orchestration and Chat Management
 * 
 * Manages mission orchestrator lifecycle, AI chat handling, and WebSocket integration
 * for real-time mission coordination.
 */

import { MissionOrchestratorAgent, type MissionChatState } from './MissionOrchestratorAgent';
import { SYSTEM_INSTRUCTIONS } from '../prompts/MissionPromptBuilder';
import { MissionService } from './MissionService';
import { RepositoryFactory } from '@starships/models';
import { Logger } from '../utils/logger';
import { SocketIOService } from './SocketIOService';
import { ErrorFactory, InternalServerError } from '@starships/errors';
import type {
  MissionMessageModel,
  MissionChatResponse,
  MissionPhase
} from '@starships/protocol';

/**
 * Configuration for MissionOrchestratorService
 */
export interface MissionOrchestratorServiceConfig {
  // Future configuration options can be added here
}

/**
 * MissionOrchestratorService - Singleton service for mission orchestrator management
 */
export class MissionOrchestratorService {
  private static instance: MissionOrchestratorService;
  private logger: Logger;
  private socketService: SocketIOService | null = null;
  
  private readonly config: Required<MissionOrchestratorServiceConfig> = {
    // Removed maxConcurrentOrchestrators - using stateless agents now
  };

  private constructor(config?: Partial<MissionOrchestratorServiceConfig>) {
    this.logger = Logger.getInstance();
    
    // Merge provided config with defaults
    if (config) {
      Object.assign(this.config, config);
    }

    // Initialize WebSocket service integration
    this.initializeSocketService();

    this.logger.info('MissionOrchestratorService initialized', {
      service: 'MissionOrchestratorService',
      operation: 'constructor'
    });
  }

  /**
   * Get singleton instance
   */
  static getInstance(config?: Partial<MissionOrchestratorServiceConfig>): MissionOrchestratorService {
    if (!MissionOrchestratorService.instance) {
      MissionOrchestratorService.instance = new MissionOrchestratorService(config);
    }
    return MissionOrchestratorService.instance;
  }


  /**
   * Core message handling method - executes graph with callbacks
   */
  private async handleMessage(
    missionId: string, 
    message: string,
    options: {
      userId?: string;
      isSystemMessage?: boolean;
    } = {}
  ): Promise<string> {
    // Check if mission exists
    const missionRepo = RepositoryFactory.getMissionRepository();
    await missionRepo.getMissionById(missionId);

    // Validate message content
    if (!message?.trim()) {
      throw ErrorFactory.validation(
        'Message content is required',
        'message'
      );
    }

    const { userId, isSystemMessage = false } = options;

    // Save input message (user only, system messages don't save input)
    if (userId && !isSystemMessage) {
      const savedUserMessage = await this.saveUserMessage(missionId, userId, message);
      this.emitMessageEvent(missionId, savedUserMessage);
    }

    // Execute with callbacks
    const orchestrator = this.createOrchestratorAgent();
    const { finalResponse, state } = await orchestrator.executeWithCallbacks(
      missionId,
      message,
      {
        onMessageGenerated: async (aiMessage: any) => {
          const savedMessage = await this.saveOrchestratorMessage(missionId, aiMessage.content as string);
          this.emitMessageEvent(missionId, savedMessage);
        },
        
        onPhaseChange: async (newPhase: MissionPhase) => {
          await this.syncActivePhase(missionId, { activePhase: newPhase });
        }
      },
      isSystemMessage
    );
    
    // Sync final state
    await this.syncActivePhase(missionId, state);

    return finalResponse;
  }

  /**
   * Handle user message and generate AI response
   */
  async handleUserMessage(missionId: string, userId: string, message: string): Promise<MissionChatResponse> {
    try {
      const aiResponse = await this.handleMessage(missionId, message, { userId });
      return { reply: aiResponse };
    } catch (error) {
      this.logger.error('Failed to handle user message', { missionId }, error as Error);
      
      if (error instanceof Error && 'code' in error) {
        throw error;
      }

      throw new InternalServerError(
        'Failed to process user message',
        {
          missionId,
          error: error instanceof Error ? error.message : 'Unknown error',
          code: 'MISSION_MESSAGE_SEND_FAILED'
        }
      );
    }
  }


  /**
   * Get message history for a mission with pagination
   */
  async getMessageHistory(missionId: string, page?: number, pageSize?: number): Promise<{
    messages: MissionMessageModel[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  }> {
    const context = {
      service: 'MissionOrchestratorService',
      operation: 'getMessageHistory',
      resource: 'mission',
      resourceId: missionId,
      metadata: { page, pageSize }
    };

    this.logger.info('Retrieving message history', context);

    try {
      const missionRepo = RepositoryFactory.getMissionRepository();
      const missionMessageRepo = RepositoryFactory.getMissionMessageRepository();
      
      // Check if mission exists first
      await missionRepo.getMissionById(missionId);

      const result = await missionMessageRepo.getMessagesByMissionWithPagination(
        missionId,
        page || 1,
        pageSize || 50
      );

      this.logger.info('Retrieved message history successfully', {
        ...context,
        metadata: {
          ...context.metadata,
          messageCount: result.messages.length,
          totalMessages: result.total
        }
      });

      return result;
    } catch (error) {
      this.logger.error('Failed to retrieve message history', context, error as Error);
      throw error;
    }
  }

  /**
   * Get recent messages for a mission (for context)
   */
  async getRecentMessages(missionId: string, limit: number = 10): Promise<MissionMessageModel[]> {
    const context = {
      service: 'MissionOrchestratorService',
      operation: 'getRecentMessages',
      resource: 'mission',
      resourceId: missionId,
      metadata: { limit }
    };

    try {
      const missionRepo = RepositoryFactory.getMissionRepository();
      const missionMessageRepo = RepositoryFactory.getMissionMessageRepository();
      
      // Check if mission exists first
      await missionRepo.getMissionById(missionId);
      
      // Get messages with limit, ordered by timestamp DESC for recent messages
      const messages = await missionMessageRepo.getMessagesByMission(missionId, limit);
      
      // Reverse to get chronological order for context
      return messages.reverse();
    } catch (error) {
      this.logger.error('Failed to retrieve recent messages', context, error as Error);
      throw error;
    }
  }

  /**
   * Create orchestrator agent instance (stateless - new instance per request)
   */
  private createOrchestratorAgent(): MissionOrchestratorAgent {
    return new MissionOrchestratorAgent({
      temperature: 0.7,
      maxTokens: 1000,
      provider: 'openai',
      model: 'gpt-4o'
    });
  }

  /**
   * Save user message to database
   */
  private async saveUserMessage(missionId: string, userId: string, content: string): Promise<MissionMessageModel> {
    try {
      const missionRepo = RepositoryFactory.getMissionRepository();
      const missionMessageRepo = RepositoryFactory.getMissionMessageRepository();
      
      // Check if mission exists first
      await missionRepo.getMissionById(missionId);
      
      // TODO: Get actual user name from UserRepository when available
      const userName = 'User'; // Placeholder

      const messageData = {
        missionId,
        role: 'user' as const,
        content,
        timestamp: new Date().toISOString(),
        userId,
        senderName: userName
      };

      return await missionMessageRepo.saveMessage(messageData);
    } catch (error) {
      this.logger.error('Failed to save user message to database', {
        service: 'MissionOrchestratorService',
        operation: 'saveUserMessage',
        resource: 'mission',
        resourceId: missionId,
        metadata: { userId }
      }, error as Error);
      throw error;
    }
  }

  /**
   * Save orchestrator message to database
   */
  private async saveOrchestratorMessage(missionId: string, content: string): Promise<MissionMessageModel> {
    try {
      const missionRepo = RepositoryFactory.getMissionRepository();
      const missionMessageRepo = RepositoryFactory.getMissionMessageRepository();
      
      // Check if mission exists first
      await missionRepo.getMissionById(missionId);
      
      const messageData = {
        missionId,
        role: 'orchestrator' as const,
        content,
        timestamp: new Date().toISOString(),
        senderName: 'Mission Orchestrator'
      };

      return await missionMessageRepo.saveMessage(messageData);
    } catch (error) {
      this.logger.error('Failed to save orchestrator message to database', {
        service: 'MissionOrchestratorService',
        operation: 'saveOrchestratorMessage',
        resource: 'mission',
        resourceId: missionId
      }, error as Error);
      throw error;
    }
  }


  /**
   * Initialize WebSocket service integration
   */
  private initializeSocketService(): void {
    try {
      this.socketService = SocketIOService.getInstance();
      this.logger.info('WebSocket service integrated successfully', {
        service: 'MissionOrchestratorService',
        operation: 'initializeSocketService'
      });
    } catch {
      this.logger.warn('WebSocket service not available - continuing without real-time updates', {
        service: 'MissionOrchestratorService',
        operation: 'initializeSocketService'
      });
      this.socketService = null;
    }
  }

  /**
   * Emit message event via WebSocket for real-time updates
   */
  private emitMessageEvent(missionId: string, message: MissionMessageModel): void {
    if (this.socketService) {
      const missionRoom = `mission:${missionId}`;
      const eventData = {
        type: 'mission:message-sent',
        missionId,
        message,
        timestamp: new Date().toISOString()
      };

      this.socketService.getIO().to(missionRoom).emit('mission:message-sent' as any, eventData);
      
    }
  }

  /**
   * Sync activePhase changes to database
   */
  private async syncActivePhase(missionId: string, state: Partial<MissionChatState>): Promise<void> {
    if (state.activePhase && state.metadata?.mission?.phase !== state.activePhase) {
      try {
        await MissionService.updateMission(missionId, { phase: state.activePhase });
      } catch (error) {
        this.logger.error('Failed to sync activePhase', { missionId }, error as Error);
      }
    }
  }

  /**
   * Handle system-initiated messages
   */
  async handleSystemMessage(missionId: string, message: string): Promise<string> {
    try {
      return await this.handleMessage(missionId, message, { isSystemMessage: true });
    } catch (error) {
      this.logger.error('Failed to handle system message', { missionId }, error as Error);
      throw error;
    }
  }

  /**
   * Initialize welcome sequence for new missions
   */
  async startMission(missionId: string): Promise<void> {
    try {
      await this.handleMessage(missionId, SYSTEM_INSTRUCTIONS.WELCOME, { isSystemMessage: true });
    } catch (error) {
      this.logger.error('Failed to start mission orchestration', { missionId }, error as Error);
      throw error;
    }
  }
}