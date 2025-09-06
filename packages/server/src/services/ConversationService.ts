import { ConversationRepository } from '@starships/models';
import { ConversationModel } from '@starships/protocol';

export interface CreateConversationData {
  metadata?: Record<string, unknown>;
}

/**
 * Clean conversation service with proper error handling
 */
export class ConversationService {
  private conversationRepository: ConversationRepository;

  constructor() {
    this.conversationRepository = new ConversationRepository();
  }

  /**
   * Create a new conversation
   */
  async createConversation(data: CreateConversationData): Promise<ConversationModel> {
    const conversation = await this.conversationRepository.create({
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
    return this.conversationRepository.findById(id);
  }

  /**
   * Update conversation activity timestamp
   */
  async updateConversationActivity(conversationId: string): Promise<void> {
    await this.conversationRepository.updateActivity(conversationId);
  }

  /**
   * Increment message count for a conversation
   */
  async incrementMessageCount(conversationId: string, increment: number = 1): Promise<void> {
    await this.conversationRepository.incrementMessageCount(conversationId, increment);
  }

  /**
   * Update token usage for a conversation
   */
  async updateTokenCount(conversationId: string, tokens: number): Promise<void> {
    await this.conversationRepository.updateTokenCount(conversationId, tokens);
  }

  /**
   * Complete a conversation
   */
  async completeConversation(conversationId: string): Promise<void> {
    await this.conversationRepository.markAsCompleted(conversationId);
  }

  /**
   * Archive a conversation
   */
  async archiveConversation(conversationId: string): Promise<void> {
    await this.conversationRepository.archiveConversation(conversationId);
  }

  /**
   * Delete a conversation
   */
  async deleteConversation(conversationId: string): Promise<boolean> {
    return this.conversationRepository.delete(conversationId);
  }
}
