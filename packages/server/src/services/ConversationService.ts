import { MessageService } from '@/services/MessageService';
import { Agent, AutopilotEvent, LLMResponse } from '@starships/autopilot';
import { NotFoundError } from '@starships/errors';
import { ConversationRepository } from '@starships/models';
import { AgentModel, ConversationModel, ConversationStatus, Message, MessageModel, StarshipModel } from '@starships/protocol';
// import { StreamingService } from './StreamingService';

/**
 * Clean conversation service with proper error handling
 */
export class ConversationService {
  private conversationRepository: ConversationRepository;
  private messageService: MessageService;
  // private streamingService: StreamingService;

  constructor() {
    this.conversationRepository = new ConversationRepository();
    this.messageService = new MessageService();
  }

  /**
   * Create a new conversation
   */
  async createConversation(data: ConversationModel & { starshipId: string; agentId?: string }): Promise<ConversationModel> {
    const conversation = await this.conversationRepository.create({
      title: data.title || 'New Conversation',
      status: 'active',
      starshipId: data.starshipId,
      agentId: data.agentId,
    });

    return conversation;
  }

  /**
   * Get conversations by starship
   */
  async getConversationsByStarship(starshipId: string): Promise<ConversationModel[]> {
    return this.conversationRepository.findByStarship(starshipId);
  }

  /**
   * Link conversation to starship
   */
  async linkConversationToStarship(conversationId: string, starshipId: string): Promise<void> {
    await this.conversationRepository.linkToStarship(conversationId, starshipId);
  }

  /**
   * Get starship for conversation
   */
  async getConversationStarship(conversationId: string): Promise<StarshipModel | null> {
    return this.conversationRepository.getConversationStarship(conversationId);
  }

  /**
   * Get agents in conversation
   */
  async getConversationAgents(conversationId: string): Promise<AgentModel[]> {
    return this.conversationRepository.getConversationAgents(conversationId);
  }

  /**
   * Get conversation by ID
   */
  async getConversationById(id: string): Promise<ConversationModel | null> {
    return this.conversationRepository.findById(id);
  }

  /**
   * Complete a conversation
   */
  async completeConversation(conversationId: string): Promise<void> {
    await this.updateConversationStatus(conversationId, 'completed');
  }

  /**
   * Archive a conversation
   */
  async archiveConversation(conversationId: string): Promise<void> {
    await this.updateConversationStatus(conversationId, 'archived');
  }

  /**
   * Update conversation status and activity timestamp
   */
  async updateConversationStatus(conversationId: string, status: ConversationStatus): Promise<void> {
    await this.conversationRepository.update(conversationId, {
      status,
      updatedAt: new Date().toISOString(),
    });
  }

  /**
   * Get messages for a conversation
   */
  async getConversationMessages(
    conversationId: string,
    orderBy: 'timestamp' | 'created_at' = 'timestamp',
    orderDirection: 'asc' | 'desc' = 'asc'
  ): Promise<MessageModel[]> {
    return this.conversationRepository.getConversationMessages(conversationId, orderBy, orderDirection);
  }

  /**
   * Delete a conversation
   */
  async deleteConversation(conversationId: string): Promise<boolean> {
    return this.conversationRepository.delete(conversationId);
  }

  async addConversationMessage(data: Message & { conversationId: string }): Promise<void> {
    // Save user message to database
    await this.messageService.createMessage({
      conversationId: data.conversationId,
      role: data.role,
      content: data.content,
      messageType: data.messageType,
    });

    const agentModels = await this.getConversationAgents(data.conversationId);
    if (agentModels.length < 0) {
      throw new NotFoundError('Agent', `for Conversation ${data.conversationId}`);
    }
    // only first agent for now
    const agentModel = agentModels[0];

    console.log('🚀 [AGENT-SERVICE] Starting streaming conversation execution:', {
      agentId: agentModel.id,
      conversationId: data.conversationId,
      timestamp: new Date().toISOString(),
    });

    const conversation = await this.getConversationById(data.conversationId);
    if (!conversation) {
      throw new NotFoundError('Conversation', data.conversationId);
    }

    // Get conversation messages from database
    const messages = await this.getConversationMessages(data.conversationId);

    const startTime = Date.now();

    try {
      // Create agent instance with enhanced options
      const agent = new Agent(agentModel, {
        eventCallback: (event) => this.eventCallback(data.conversationId, event),
      });
      messages.forEach((message) => agent.addMessageToMemory(message));

      // Execute agent with streaming-enabled execution
      await agent.execute();

      const executionTime = Date.now() - startTime;

      console.log('✅ [AGENT-SERVICE] Streaming conversation execution completed successfully:', {
        executionTime,
      });

      // ! RETURN messages here
    } catch (error) {
      console.error('❌ [AGENT-SERVICE] Streaming conversation execution failed:', {
        agentId: agentModel.id,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      });

      // // Create error message in conversation
      // await this.createErrorResponse(error as Error, {
      //   agentId: agentModel.id,
      //   conversationId: data.conversationId,
      //   starshipId: 'unknown', // starshipId property no longer exists on AgentModel
      // });

      throw error;
    }
  }

  async eventCallback(conversationId: string, event: AutopilotEvent): Promise<void> {
    switch (event.type) {
      case 'node_completed': {
        console.log('save messages in db');
        break;
        // Check if this is an LLM node with response content
        // const nodeResult = event.data.execution.results.get(event.execution.currentNodeRef || '');
        // if (nodeResult && !nodeResult.error && nodeResult.data) {
        //   const llmData = nodeResult.data as LLMResponse;
        //   const llmResponseContent = llmData;

        //   if (llmResponseContent && typeof llmResponseContent === 'string' && llmResponseContent.trim()) {
        //     // Return assistant message with LLM response
        //     return {
        //       id: messageId,
        //       role: 'assistant',
        //       content: llmResponseContent.trim(),
        //       messageType: 'agent_response',
        //       createdAt: event.timestamp,
        //       updatedAt: event.timestamp,
        //     };
        //   }
        // }

        // // Fallback to system completion message
        // return {
        //   id: messageId,
        //   role: 'system',
        //   content: `✅ Completed node: ${event.execution.currentNodeRef}`,
        //   messageType: 'system_notification',
        //   createdAt: event.timestamp,
        //   updatedAt: event.timestamp,
        // };
      }

      case 'workflow_completed':
        console.log('completed');
        break;
      // return {
      //   id: messageId,
      //   role: 'system',
      //   content: '🎉 Agent workflow completed successfully',
      //   messageType: 'system_notification',
      //   createdAt: event.timestamp,
      //   updatedAt: event.timestamp,
      // };

      case 'content_chunk':
        console.log('chunk', event.data);
        break;

      case 'content_complete':
        console.log('chunk complete');
        break;
    }
  }
}
