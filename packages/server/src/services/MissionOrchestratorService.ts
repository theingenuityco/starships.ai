/**
 * Mission Orchestrator Service - Core Orchestration and Chat Management
 * 
 * Manages mission orchestrator lifecycle, AI chat handling, and WebSocket integration
 * for real-time mission coordination.
 */

import { MissionOrchestratorAgent } from './MissionOrchestratorAgent';
import { RepositoryFactory } from '@starships/models';
import { Logger } from '../utils/logger';
import { SocketIOService } from './SocketIOService';
import { ErrorFactory } from '@starships/protocol';
import type { 
  MissionMessage,
  MissionChatResponse,
  SendMissionMessageRequest
} from '@starships/protocol';

/**
 * Configuration for MissionOrchestratorService
 */
export interface MissionOrchestratorServiceConfig {
  autoCleanupMinutes?: number;
  maxConcurrentOrchestrators?: number;
}

/**
 * MissionOrchestratorService - Singleton service for mission orchestrator management
 */
export class MissionOrchestratorService {
  private static instance: MissionOrchestratorService;
  private logger: Logger;
  private socketService: SocketIOService | null = null;
  
  // In-memory orchestrator instances (missionId -> agent)
  private orchestrators: Map<string, MissionOrchestratorAgent> = new Map();
  
  private readonly config: Required<MissionOrchestratorServiceConfig> = {
    autoCleanupMinutes: 60, // Auto cleanup inactive orchestrators after 1 hour
    maxConcurrentOrchestrators: 100 // Limit concurrent orchestrators
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
      operation: 'constructor',
      metadata: { config: this.config }
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
   * Initialize chat for a mission (lazy creation of orchestrator)
   */
  async initializeChat(missionId: string, userId: string): Promise<MissionChatResponse | null> {
    const context = {
      service: 'MissionOrchestratorService',
      operation: 'initializeChat',
      resource: 'mission',
      resourceId: missionId,
      metadata: { userId }
    };

    this.logger.info('Initializing mission chat', context);

    try {
      // Check if mission exists
      const missionRepo = RepositoryFactory.getMissionRepository();
      const mission = await missionRepo.getMissionById(missionId);

      // Get or create orchestrator
      const orchestrator = await this.getOrCreateOrchestratorAgent(missionId);

      // Check if this is the first initialization (no conversation history in database)
      const existingMessages = await this.getRecentMessages(missionId, 1);
      const hasHistory = existingMessages.length > 0;

      if (!hasHistory) {
        // Generate welcome message for first-time initialization
        const welcomeMessage = await orchestrator.generateResponse(
          `Hello, I'm ready to help coordinate this mission: "${mission.name}". What can I assist you with?`,
          missionId
        );

        // Save system greeting message to database
        await this.saveSystemMessage(missionId, welcomeMessage);

        // Emit WebSocket event for real-time updates
        this.emitMessageEvent(missionId, {
          id: `greeting-${Date.now()}`,
          missionId,
          role: 'orchestrator',
          content: welcomeMessage,
          timestamp: new Date().toISOString(),
          senderName: 'Mission Orchestrator'
        });

        this.logger.info('Generated welcome message for mission chat', {
          ...context,
          metadata: { ...context.metadata, hasWelcome: true }
        });

        return { reply: welcomeMessage };
      }

      // Chat already initialized, return null (no greeting needed)
      return null;

    } catch (error) {
      this.logger.error('Failed to initialize mission chat', context, error as Error);
      throw ErrorFactory.businessLogic(
        'MISSION_ORCHESTRATOR_INITIALIZATION_FAILED',
        'Failed to initialize mission chat',
        error instanceof Error ? error.message : 'Unknown error',
        context
      );
    }
  }

  /**
   * Handle user message and generate AI response
   */
  async handleUserMessage(missionId: string, userId: string, message: string): Promise<MissionChatResponse> {
    const context = {
      service: 'MissionOrchestratorService',
      operation: 'handleUserMessage',
      resource: 'mission',
      resourceId: missionId,
      metadata: { 
        userId, 
        messageLength: message?.length
      }
    };

    this.logger.info('Handling user message', context);

    try {
      // Validate inputs
      if (!message?.trim()) {
        throw ErrorFactory.validation([
          { field: 'message', message: 'Message content is required' }
        ], context);
      }

      // Check if mission exists
      const missionRepo = RepositoryFactory.getMissionRepository();
      await missionRepo.getMissionById(missionId); // Will throw if not found

      // Save user message to database first
      const savedUserMessage = await this.saveUserMessage(missionId, userId, message);

      // Emit user message event
      this.emitMessageEvent(missionId, savedUserMessage);

      // Get or create orchestrator agent
      const orchestrator = await this.getOrCreateOrchestratorAgent(missionId);

      // Generate AI response
      const aiResponse = await orchestrator.generateResponse(message, missionId);

      // Save orchestrator response to database
      const savedOrchestratorMessage = await this.saveOrchestratorMessage(missionId, aiResponse);

      // Emit orchestrator response event
      this.emitMessageEvent(missionId, savedOrchestratorMessage);

      this.logger.info('Successfully handled user message', {
        ...context,
        metadata: {
          ...context.metadata,
          responseLength: aiResponse?.length
        }
      });

      return { reply: aiResponse };

    } catch (error) {
      this.logger.error('Failed to handle user message', context, error as Error);
      
      // Re-throw known errors
      if (error instanceof Error && 'code' in error) {
        throw error;
      }

      throw ErrorFactory.businessLogic(
        'MISSION_MESSAGE_SEND_FAILED',
        'Failed to process user message',
        error instanceof Error ? error.message : 'Unknown error',
        context
      );
    }
  }

  /**
   * Check if orchestrator exists for mission
   */
  hasActiveOrchestrator(missionId: string): boolean {
    return this.orchestrators.has(missionId);
  }

  /**
   * Cleanup orchestrator when mission completes
   */
  async cleanupMission(missionId: string): Promise<void> {
    const context = {
      service: 'MissionOrchestratorService',
      operation: 'cleanupMission',
      resource: 'mission',
      resourceId: missionId
    };

    this.logger.info('Cleaning up mission orchestrator', context);

    try {
      const orchestrator = this.orchestrators.get(missionId);
      if (orchestrator) {
        // Clear conversation history
        orchestrator.clearConversationHistory(missionId);
        
        // Remove from active orchestrators
        this.orchestrators.delete(missionId);

        this.logger.info('Mission orchestrator cleaned up successfully', context);
      }
    } catch (error) {
      this.logger.error('Failed to cleanup mission orchestrator', context, error as Error);
      // Don't throw on cleanup errors - log and continue
    }
  }

  /**
   * Get orchestrator agent count (for monitoring)
   */
  getActiveOrchestratorCount(): number {
    return this.orchestrators.size;
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
   * Get or create orchestrator agent instance (lazy creation)
   */
  private async getOrCreateOrchestratorAgent(missionId: string): Promise<MissionOrchestratorAgent> {
    let orchestrator = this.orchestrators.get(missionId);

    if (!orchestrator) {
      // Check limits
      if (this.orchestrators.size >= this.config.maxConcurrentOrchestrators) {
        throw ErrorFactory.businessLogic(
          'RESOURCE_LIMIT_EXCEEDED',
          'Maximum concurrent orchestrators reached',
          `Limit: ${this.config.maxConcurrentOrchestrators}`,
          {
            service: 'MissionOrchestratorService',
            operation: 'getOrCreateOrchestratorAgent',
            resource: 'mission',
            resourceId: missionId
          }
        );
      }

      // Create new orchestrator agent
      orchestrator = new MissionOrchestratorAgent({
        temperature: 0.7,
        maxTokens: 1000
      });

      this.orchestrators.set(missionId, orchestrator);

      this.logger.info('Created new orchestrator agent', {
        service: 'MissionOrchestratorService',
        operation: 'getOrCreateOrchestratorAgent',
        resource: 'mission',
        resourceId: missionId,
        metadata: { 
          totalOrchestrators: this.orchestrators.size 
        }
      });
    }

    return orchestrator;
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
      
      this.logger.info('Emitted message event', {
        service: 'MissionOrchestratorService',
        operation: 'emitMessageEvent',
        resource: 'mission',
        resourceId: missionId,
        metadata: { 
          room: missionRoom,
          messageRole: message.role
        }
      });
    }
  }
}