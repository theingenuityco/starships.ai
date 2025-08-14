/**
 * Mission Orchestrator Service - Core Orchestration and Chat Management
 * 
 * Manages mission orchestrator lifecycle, AI chat handling, and WebSocket integration
 * for real-time mission coordination.
 */

import { MissionOrchestratorAgent, type MissionChatState, type GraphExecutionCallbacks } from './MissionOrchestratorAgent';
import { MissionService } from './MissionService';
import { RepositoryFactory } from '@starships/models';
import { Logger } from '../utils/logger';
import { SocketIOService } from './SocketIOService';
import { ErrorFactory } from '@starships/protocol';
import { AIMessage } from '@langchain/core/messages';
import type { 
  MissionMessage,
  MissionChatResponse,
  SendMissionMessageRequest,
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
   * Core orchestration method - handles different types of mission interactions
   */
  private async executeOrchestration(
    missionId: string, 
    operation: 'user-message' | 'system-message' | 'start-mission',
    input?: {
      message?: string;
      userId?: string;
    }
  ): Promise<string> {
    // Check if mission exists
    const missionRepo = RepositoryFactory.getMissionRepository();
    await missionRepo.getMissionById(missionId);

    const context = {
      service: 'MissionOrchestratorService',
      operation,
      resource: 'mission',
      resourceId: missionId,
      metadata: input
    };

    // Handle different orchestration types
    let aiResponse: string;
    
    if (operation === 'start-mission') {
      // Direct welcome generation without graph execution
      const orchestrator = this.createOrchestratorAgent();
      aiResponse = await orchestrator.generateWelcomeMessage(missionId);
      
      // Save and emit welcome message
      const savedMessage = await this.saveOrchestratorMessage(missionId, aiResponse);
      this.emitMessageEvent(missionId, savedMessage);
      
      // Set mission phase to analysis (auto-progression after welcome)
      await this.syncActivePhase(missionId, { activePhase: 'analysis' });
      
    } else {
      // Graph-based execution for user/system messages
      const { message = '', userId } = input || {};
      
      // Validate message content
      if (!message?.trim()) {
        throw ErrorFactory.validation([
          { field: 'message', message: 'Message content is required' }
        ], context);
      }

      // Save input message (user only, system messages don't save input)
      const isSystemMessage = operation === 'system-message';
      if (userId && !isSystemMessage) {
        const savedUserMessage = await this.saveUserMessage(missionId, userId, message);
        this.emitMessageEvent(missionId, savedUserMessage);
      }

      // Execute graph with callbacks
      const orchestrator = this.createOrchestratorAgent();
      const { finalResponse, state } = await orchestrator.executeGraphWithCallbacks(
        missionId, 
        message, 
        {
          onMessageGenerated: async (aiMessage: AIMessage, nodeId: string, missionId: string) => {
            const savedMessage = isSystemMessage
              ? await this.saveSystemMessage(missionId, aiMessage.content as string)
              : await this.saveOrchestratorMessage(missionId, aiMessage.content as string);
            
            this.emitMessageEvent(missionId, savedMessage);
            
          },
          
          onPhaseChange: async (newPhase: MissionPhase, missionId: string) => {
            await this.syncActivePhase(missionId, { activePhase: newPhase });
            
          }
        },
        isSystemMessage
      );
      
      // Sync final state
      await this.syncActivePhase(missionId, state);
      aiResponse = finalResponse;
    }

    return aiResponse;
  }

  /**
   * Handle user message and generate AI response
   */
  async handleUserMessage(missionId: string, userId: string, message: string): Promise<MissionChatResponse> {
    try {
      const aiResponse = await this.executeOrchestration(missionId, 'user-message', { message, userId });
      return { reply: aiResponse };
    } catch (error) {
      this.logger.error('Failed to handle user message', { missionId }, error as Error);
      
      if (error instanceof Error && 'code' in error) {
        throw error;
      }

      throw ErrorFactory.businessLogic(
        'MISSION_MESSAGE_SEND_FAILED',
        'Failed to process user message',
        error instanceof Error ? error.message : 'Unknown error',
        { service: 'MissionOrchestratorService', operation: 'handleUserMessage', resource: 'mission', resourceId: missionId }
      );
    }
  }


  /**
   * Get message history for a mission with pagination
   */
  async getMessageHistory(missionId: string, page?: number, pageSize?: number): Promise<{
    messages: MissionMessage[];
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
      
      // Check if mission exists first
      await missionRepo.getMissionById(missionId);

      const result = await missionRepo.getMessagesByMissionWithPagination(
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
  async getRecentMessages(missionId: string, limit: number = 10): Promise<MissionMessage[]> {
    const context = {
      service: 'MissionOrchestratorService',
      operation: 'getRecentMessages',
      resource: 'mission',
      resourceId: missionId,
      metadata: { limit }
    };

    try {
      const missionRepo = RepositoryFactory.getMissionRepository();
      
      // Get messages with limit, ordered by timestamp DESC for recent messages
      const messages = await missionRepo.getMessagesByMission(missionId, limit);
      
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
      model: 'gpt-4'
    });
  }

  /**
   * Save user message to database
   */
  private async saveUserMessage(missionId: string, userId: string, content: string): Promise<MissionMessage> {
    try {
      const missionRepo = RepositoryFactory.getMissionRepository();
      
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

      return await missionRepo.saveMessage(messageData);
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
  private async saveOrchestratorMessage(missionId: string, content: string): Promise<MissionMessage> {
    try {
      const missionRepo = RepositoryFactory.getMissionRepository();
      
      const messageData = {
        missionId,
        role: 'orchestrator' as const,
        content,
        timestamp: new Date().toISOString(),
        senderName: 'Mission Orchestrator'
      };

      return await missionRepo.saveMessage(messageData);
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
   * Save system message to database
   */
  private async saveSystemMessage(missionId: string, content: string): Promise<MissionMessage> {
    try {
      const missionRepo = RepositoryFactory.getMissionRepository();
      
      const messageData = {
        missionId,
        role: 'system' as const,
        content,
        timestamp: new Date().toISOString(),
        senderName: 'System'
      };

      return await missionRepo.saveMessage(messageData);
    } catch (error) {
      this.logger.error('Failed to save system message to database', {
        service: 'MissionOrchestratorService',
        operation: 'saveSystemMessage',
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
    } catch (error) {
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
  private emitMessageEvent(missionId: string, message: MissionMessage): void {
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
      return await this.executeOrchestration(missionId, 'system-message', { message });
    } catch (error) {
      this.logger.error('Failed to handle system message', { missionId }, error as Error);
      throw error;
    }
  }

  /**
   * Start mission orchestration - generates initial welcome and sets up mission session
   */
  async startMission(missionId: string): Promise<void> {
    try {
      await this.executeOrchestration(missionId, 'start-mission');
    } catch (error) {
      this.logger.error('Failed to start mission orchestration', { missionId }, error as Error);
      throw error;
    }
  }
}