import { AgentService } from '@/services';
import { MessageService } from '@/services/MessageService';
import { StreamingService } from '@/services/StreamingService';
import { NotFoundError } from '@starships/errors';
import { ConversationRepository } from '@starships/models';
import { ConversationModel, ConversationStatus, CreateConversationRequest, CreateMessageRequest, MessageModel } from '@starships/protocol';

/**
 * Clean conversation service with proper error handling
 */
export class ConversationService {
  private conversationRepository: ConversationRepository;
  private messageService: MessageService;
  private streamingService: StreamingService;

  constructor() {
    this.conversationRepository = new ConversationRepository();
    this.messageService = new MessageService();
    this.streamingService = new StreamingService();
  }

  /**
   * Create a new conversation
   */
  async createConversation(data: CreateConversationRequest & { starshipId: string }): Promise<ConversationModel> {
    const conversation = await this.conversationRepository.create(
      {
        title: 'New Conversation',
        status: 'active',
      },
      data.starshipId
    );

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
  async getConversationStarship(conversationId: string): Promise<{ id: string; name: string; slug: string } | null> {
    return this.conversationRepository.getConversationStarship(conversationId);
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
   * Process conversation with streaming support
   * Uses conversationId as the stream identifier - no database streaming state needed
   */
  async addMessageWithStreaming(data: CreateMessageRequest & { conversationId: string }): Promise<MessageModel[]> {
    const { conversationId, content, role, messageType } = data;

    try {
      // Verify conversation exists
      const conversation = await this.conversationRepository.findById(conversationId);
      if (!conversation) {
        throw new NotFoundError('Conversation', conversationId);
      }

      // Get starship information for message context
      const starshipInfo = await this.getConversationStarship(conversationId);
      if (!starshipInfo) {
        throw new NotFoundError('Starship', `for conversation ${conversationId}`);
      }

      // Save user message to database
      await this.messageService.createMessage({
        conversationId,
        role: role,
        content: content,
        messageType: messageType,
      });

      // Execute agent conversation with streaming
      const response = await AgentService.executeConversationWithStreaming({
        agentId,
        userId,
        message,
        conversationId,
        streamId: conversationId, // Use conversationId as streamId
        streamingService: this.streamingService,
      });

      // Save agent response to database
      await this.messageService.createMessage({
        conversationId,
        role: 'assistant',
        content: response.content,
        messageType: 'agent_response',
      });

      // Send final completion event via streaming (using conversationId as streamId)
      await this.streamingService.broadcastComplete(conversationId, response);

      return {
        reply: response.content,
        usage: response.usage,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      // Broadcast error using conversationId as streamId
      await this.streamingService.broadcastError(conversationId, {
        streamId: conversationId,
        errorCode: 'CONVERSATION_PROCESSING_FAILED',
        message: errorMessage,
        timestamp: new Date().toISOString(),
        recoverable: false,
        context: { conversationId, agentId },
      });

      throw error;
    }
  }

  /**
   * Add message to conversation and get agent response
   */
  async addMessage(data: AddMessageData): Promise<AddMessageResponse> {
    const { conversationId, agentId, userId, message } = data;

    // Verify conversation exists
    const conversation = await this.conversationRepository.findById(conversationId);
    if (!conversation) {
      throw new NotFoundError('Conversation', conversationId);
    }

    // Get starship information for message context
    const starshipInfo = await this.getConversationStarship(conversationId);
    if (!starshipInfo) {
      throw new NotFoundError('Starship', `for conversation ${conversationId}`);
    }

    // Save user message to database
    await this.messageService.addToConversation(conversationId, 'user', message, {
      starshipId: starshipInfo.id,
      agentId,
      userId,
    });

    // Execute agent conversation - streaming support will be added
    const response = await AgentService.executeConversation({
      agentId,
      userId,
      message,
      conversationId,
      // stream parameter will be passed from request when streaming is implemented
    });

    // Save agent response to database
    await this.messageService.addToConversation(conversationId, 'assistant', response.content, {
      starshipId: starshipInfo.id,
      agentId,
      userId,
    });

    // Update conversation metrics
    await Promise.all([
      this.updateConversationActivity(conversationId),
      this.incrementMessageCount(conversationId, 2), // User message + assistant response
    ]);

    return {
      reply: response.content,
      usage: response.usage,
    };
  }

  /**
   * Delete a conversation
   */
  async deleteConversation(conversationId: string): Promise<boolean> {
    return this.conversationRepository.delete(conversationId);
  }
}
