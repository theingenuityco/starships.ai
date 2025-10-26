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
    // Create message with all available properties including toolCalls, toolCallId, agentId, and agentName
    const message = await this.messageRepository.create({
      role: request.role,
      content: request.content,
      messageType: request.messageType,
      conversationId: request.conversationId,
      ...(request.reasoning && { reasoning: request.reasoning }),
      ...(request.toolCalls && { toolCalls: request.toolCalls }),
      ...(request.toolCallId && { toolCallId: request.toolCallId }),
      ...(request.agentId && { agentId: request.agentId }),
      ...(request.agentName && { agentName: request.agentName }),
    });

    return message;
  }

  /**
   * Update an existing message by id
   */
  async updateMessage(id: string, updates: Partial<MessageModel>): Promise<MessageModel | null> {
    return this.messageRepository.update(id, updates);
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
  // Removed duplicate updateMessage method that restricted updates to content only

  /**
   * Delete message
   */
  async deleteMessage(messageId: string): Promise<boolean> {
    const deleted = await this.messageRepository.delete(messageId);
    return deleted;
  }
}
