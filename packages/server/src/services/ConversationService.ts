import { AgentService } from '@/services';
import { MessageService } from '@/services/MessageService';
import { NotFoundError } from '@starships/errors';
import { ConversationRepository, MessageRepository } from '@starships/models';
import { ConversationModel } from '@starships/protocol';

export interface CreateConversationData {
  metadata?: Record<string, unknown>;
  starshipId?: string;
  userId?: string;
}

export interface ConversationWithMessages extends ConversationModel {
  messages: any[]; // Using any[] to match existing Message type from routes
}

export interface AddMessageData {
  conversationId: string;
  agentId: string;
  userId: string;
  message: string;
}

export interface AddMessageResponse {
  reply: string;
  usage?: any;
}

/**
 * Clean conversation service with proper error handling
 */
export class ConversationService {
  private conversationRepository: ConversationRepository;
  private messageRepository: MessageRepository;
  private messageService: MessageService;

  constructor() {
    this.conversationRepository = new ConversationRepository();
    this.messageRepository = new MessageRepository();
    this.messageService = new MessageService();
  }

  /**
   * Create a new conversation
   */
  async createConversation(data: CreateConversationData): Promise<ConversationModel> {
    const conversation = await this.conversationRepository.create(
      {
        lastActivityAt: new Date().toISOString(),
        messageCount: 0,
        totalTokens: 0,
        status: 'active',
        metadata: data.metadata,
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
   * Get conversations by user (placeholder for future implementation)
   */
  async getConversationsByUser(userId: string): Promise<ConversationModel[]> {
    // TODO: Implement user-conversation relationship in repository
    return [];
  }

  /**
   * Get conversation with messages
   */
  async getConversationWithMessages(
    conversationId: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<ConversationWithMessages | null> {
    const conversation = await this.conversationRepository.findById(conversationId);
    if (!conversation) return null;

    const messages = await this.messageRepository.findByConversationId(conversationId, limit, offset);

    return {
      ...conversation,
      messages,
    };
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
   * Update conversation activity timestamp
   */
  async updateConversationActivity(conversationId: string): Promise<void> {
    await this.conversationRepository.update(conversationId, {
      lastActivityAt: new Date().toISOString(),
    });
  }

  /**
   * Increment message count for a conversation
   */
  async incrementMessageCount(conversationId: string, increment: number = 1): Promise<void> {
    const conversation = await this.conversationRepository.findById(conversationId);
    if (!conversation) {
      throw new NotFoundError('Conversation', conversationId);
    }

    await this.conversationRepository.update(conversationId, {
      messageCount: (conversation.messageCount || 0) + increment,
      lastActivityAt: new Date().toISOString(),
    });
  }

  /**
   * Update token usage for a conversation
   */
  async updateTokenCount(conversationId: string, tokens: number): Promise<void> {
    const conversation = await this.conversationRepository.findById(conversationId);
    if (!conversation) {
      throw new NotFoundError('Conversation', conversationId);
    }

    await this.conversationRepository.update(conversationId, {
      totalTokens: (conversation.totalTokens || 0) + tokens,
      lastActivityAt: new Date().toISOString(),
    });
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
  async updateConversationStatus(conversationId: string, status: 'active' | 'paused' | 'completed' | 'archived'): Promise<void> {
    await this.conversationRepository.update(conversationId, {
      status,
      lastActivityAt: new Date().toISOString(),
    });
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

    // Execute agent chat
    const response = await AgentService.executeChat({
      source: 'user',
      agentId,
      userId,
      message,
      conversationId,
      stream: false,
    });

    // Save agent response to database
    await this.messageService.addToConversation(
      conversationId,
      'assistant',
      response.content,
      {
        starshipId: starshipInfo.id,
        agentId,
        userId,
      },
      {
        usage: response.usage,
        tokenCount: response.usage?.totalTokens,
      }
    );

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
