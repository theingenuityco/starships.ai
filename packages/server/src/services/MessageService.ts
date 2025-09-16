/**
 * Message Service
 *
 * Provides business logic APIs for message management and conversation operations.
 * Orchestrates between database persistence (MessageRepository) and business logic.
 */

import { MessageRepository } from '@starships/models';
import type { Message, MessageModel } from '@starships/protocol';

/**
 * Service class for managing messages and conversations
 */
export class MessageService {
  private messageRepository: MessageRepository;

  constructor() {
    this.messageRepository = new MessageRepository();
  }

  // ============================================================================
  // MESSAGE MANAGEMENT APIs
  // ============================================================================

  /**
   * Create a new message with streaming support
   */
  async createMessage(request: Message & { conversationId: string }): Promise<MessageModel> {
    // Create message with only available properties
    const message = await this.messageRepository.create({
      role: request.role,
      content: request.content,
      messageType: request.messageType,
      conversationId: request.conversationId,
    });

    return message;
  }

  /**
   * Get message by ID
   */
  async getMessage(messageId: string): Promise<MessageModel | null> {
    const message = await this.messageRepository.findById(messageId);

    if (!message) {
      return null;
    }

    return message;
  }

  /**
   * Update message
   */
  async updateMessage(messageId: string, updates: Partial<Pick<Message, 'content'>>): Promise<MessageModel | null> {
    // Filter updates to only include valid MessageModel properties
    const validUpdates: Partial<MessageModel> = {};
    if (updates.content !== undefined) validUpdates.content = updates.content;

    const updatedMessage = await this.messageRepository.update(messageId, validUpdates);
    return updatedMessage;
  }

  /**
   * Delete message
   */
  async deleteMessage(messageId: string): Promise<boolean> {
    const deleted = await this.messageRepository.delete(messageId);
    return deleted;
  }
}
