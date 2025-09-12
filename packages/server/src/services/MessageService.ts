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
    console.log('📝 [MESSAGE-SERVICE] Creating message:', {
      role: request.role,
    });

    // Create message with only available properties
    const message = await this.messageRepository.create({
      role: request.role,
      content: request.content,
      messageType: request.messageType,
      conversationId: request.conversationId,
    });

    console.log('✅ [MESSAGE-SERVICE] Message created:', message.id);
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

    console.log(`📖 [MESSAGE-SERVICE] Retrieved message ${messageId}`);

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

    if (updatedMessage) {
      console.log('✅ [MESSAGE-SERVICE] Message updated:', messageId);
    }

    return updatedMessage;
  }

  /**
   * Delete message
   */
  async deleteMessage(messageId: string): Promise<boolean> {
    console.log('🗑️ [MESSAGE-SERVICE] Deleting message:', messageId);

    const deleted = await this.messageRepository.delete(messageId);

    if (deleted) {
      console.log('✅ [MESSAGE-SERVICE] Message deleted:', messageId);
    }

    return deleted;
  }
}
