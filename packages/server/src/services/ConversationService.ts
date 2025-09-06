import { ConversationRepository } from '@starships/models';
import { ConversationModel } from '@starships/protocol';

export interface CreateConversationData {
  metadata?: Record<string, unknown>;
}

export interface ConversationServiceDependencies {
  conversationRepository: ConversationRepository;
}

/**
 * Clean conversation service with dependency injection and proper error handling
 */
export class ConversationService {
  constructor(private readonly dependencies: ConversationServiceDependencies) {}

  /**
   * Create a new conversation
   */
  async createConversation(data: CreateConversationData): Promise<ConversationModel> {
    const { conversationRepository } = this.dependencies;

    const conversation = await conversationRepository.create({
      lastActivityAt: new Date().toISOString(),
      messageCount: 0,
      totalTokens: 0,
      status: 'active',
      metadata: data.metadata,
    });

    return conversation;
  }

  /**
   * Get conversation by ID
   */
  async getConversationById(id: string): Promise<ConversationModel | null> {
    const { conversationRepository } = this.dependencies;
    return conversationRepository.findById(id);
  }

  /**
   * Update conversation activity timestamp
   */
  async updateConversationActivity(conversationId: string): Promise<void> {
    const { conversationRepository } = this.dependencies;
    await conversationRepository.updateActivity(conversationId);
  }

  /**
   * Increment message count for a conversation
   */
  async incrementMessageCount(conversationId: string, increment: number = 1): Promise<void> {
    const { conversationRepository } = this.dependencies;
    await conversationRepository.incrementMessageCount(conversationId, increment);
  }

  /**
   * Update token usage for a conversation
   */
  async updateTokenCount(conversationId: string, tokens: number): Promise<void> {
    const { conversationRepository } = this.dependencies;
    await conversationRepository.updateTokenCount(conversationId, tokens);
  }

  /**
   * Complete a conversation
   */
  async completeConversation(conversationId: string): Promise<void> {
    const { conversationRepository } = this.dependencies;
    await conversationRepository.markAsCompleted(conversationId);
  }

  /**
   * Archive a conversation
   */
  async archiveConversation(conversationId: string): Promise<void> {
    const { conversationRepository } = this.dependencies;
    await conversationRepository.archiveConversation(conversationId);
  }

  /**
   * Delete a conversation
   */
  async deleteConversation(conversationId: string): Promise<boolean> {
    const { conversationRepository } = this.dependencies;
    return conversationRepository.delete(conversationId);
  }
}

/**
 * Default service instance factory
 */
export const createConversationService = (): ConversationService => {
  return new ConversationService({
    conversationRepository: new ConversationRepository(),
  });
};
