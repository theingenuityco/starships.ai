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

/**
 * Clean conversation service with proper error handling
 */
export class ConversationService {
  private conversationRepository: ConversationRepository;
  private messageRepository: MessageRepository;

  constructor() {
    this.conversationRepository = new ConversationRepository();
    this.messageRepository = new MessageRepository();
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
      throw new Error(`Conversation not found: ${conversationId}`);
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
      throw new Error(`Conversation not found: ${conversationId}`);
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
   * Common method to update conversation status and activity timestamp
   */
  private async updateConversationStatus(conversationId: string, status: 'active' | 'paused' | 'completed' | 'archived'): Promise<void> {
    await this.conversationRepository.update(conversationId, {
      status,
      lastActivityAt: new Date().toISOString(),
    });
  }

  /**
   * Delete a conversation
   */
  async deleteConversation(conversationId: string): Promise<boolean> {
    return this.conversationRepository.delete(conversationId);
  }
}
