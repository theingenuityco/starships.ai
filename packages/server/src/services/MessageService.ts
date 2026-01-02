/**
 * Message Service
 *
 * Provides business logic APIs for message management and conversation operations.
 * Orchestrates between database persistence (MessageRepository) and business logic.
 */

import { MessageRepository, AttachmentRepository } from '@starships/models';
import type { Message, MessageModel } from '@starships/protocol';

/**
 * Service class for managing messages and conversations
 */
export class MessageService {
  private messageRepository: MessageRepository;
  private attachmentRepository: AttachmentRepository;

  constructor() {
    this.messageRepository = new MessageRepository();
    this.attachmentRepository = new AttachmentRepository();
  }

  // ============================================================================
  // MESSAGE MANAGEMENT APIs
  // ============================================================================

  /**
   * Create a new message with streaming support
   */
  async createMessage(request: Message & { conversationId: string; attachmentIds?: string[]; stoppedAt?: string | null }): Promise<MessageModel> {
    // Create message with all available properties including toolCalls, toolCallId, agentId, agentName, attachmentIds, and stoppedAt
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
      ...(request.attachmentIds && { attachmentIds: request.attachmentIds }),
      ...(request.stoppedAt !== undefined && { stoppedAt: request.stoppedAt }),
    });

    // Link attachments to message if provided
    if (request.attachmentIds && request.attachmentIds.length > 0) {
      await Promise.all(
        request.attachmentIds.map((attachmentId) => this.attachmentRepository.linkToMessage(attachmentId, message.id))
      );
    }

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
   * Delete message and cleanup associated S3 files
   */
  async deleteMessage(messageId: string): Promise<boolean> {
    // First, get the message with starshipId to access its attachments
    const connection = this.messageRepository['getConnection']();
    const messageData = await connection.queryOne<{
      id: string;
      starship_id: string;
      attachment_ids: string[];
    }>('SELECT id, starship_id, attachment_ids FROM messages WHERE id = $1', [messageId]);

    if (!messageData) {
      return false;
    }

    // Delete attachments and their S3 files before deleting the message
    if (messageData.attachment_ids && messageData.attachment_ids.length > 0) {
      const { AttachmentService } = await import('@/services/AttachmentService');
      const attachmentService = new AttachmentService();

      console.log(`[MessageService] Deleting ${messageData.attachment_ids.length} attachments for message ${messageId}`);

      for (const attachmentId of messageData.attachment_ids) {
        try {
          await attachmentService.deleteAttachment(attachmentId, messageData.starship_id);
        } catch (error) {
          console.error(`[MessageService] Failed to delete attachment ${attachmentId}:`, error);
          // Continue deleting other attachments even if one fails
        }
      }
    }

    // Now delete the message (CASCADE will delete any remaining attachment records)
    const deleted = await this.messageRepository.delete(messageId);
    return deleted;
  }
}
