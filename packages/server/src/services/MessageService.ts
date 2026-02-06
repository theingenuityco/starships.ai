/**
 * Message Service
 *
 * Provides business logic APIs for message management and conversation operations.
 * Orchestrates between database persistence (MessageRepository) and business logic.
 */

import { MessageRepository, AttachmentRepository, ConversationParticipantRepository } from '@starships/models';
import { AppError } from '@starships/errors';
import type { Message, MessageModel } from '@starships/protocol';

/**
 * Service class for managing messages and conversations
 */
export class MessageService {
  private messageRepository: MessageRepository;
  private attachmentRepository: AttachmentRepository;
  private conversationParticipantRepository: ConversationParticipantRepository;

  constructor() {
    this.messageRepository = new MessageRepository();
    this.attachmentRepository = new AttachmentRepository();
    this.conversationParticipantRepository = new ConversationParticipantRepository();
  }

  // ============================================================================
  // MESSAGE MANAGEMENT APIs
  // ============================================================================

  /**
   * Create a new message with streaming support
   */
  async createMessage(request: Message & { conversationId: string; attachmentIds?: string[] }): Promise<MessageModel> {
    // Create message with all available properties including toolCalls, toolCallId, agentId, agentName, and attachmentIds
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
      ...(request.userId && { userId: request.userId }),
      ...(request.userName && { userName: request.userName }),
      ...(request.userAvatar && { userAvatar: request.userAvatar }),
      ...(request.attachmentIds && { attachmentIds: request.attachmentIds }),
      ...(request.linkedConversationId && { linkedConversationId: request.linkedConversationId }),
    });

    // Ensure the author is recorded as a conversation participant.
    // This allows participant lists to be stable even before a user has posted multiple times.
    if (request.role === 'user' && request.userId) {
      await this.conversationParticipantRepository.addUserParticipant({
        conversationId: request.conversationId,
        userId: request.userId,
        createdBy: request.userId,
        role: null,
      });
    } else if (request.role === 'assistant' && request.agentId) {
      await this.conversationParticipantRepository.addAgentParticipant({
        conversationId: request.conversationId,
        agentId: request.agentId,
        createdBy: request.userId ?? null,
      });
    }

    // Link attachments to message if provided
    if (request.attachmentIds && request.attachmentIds.length > 0) {
      await Promise.all(request.attachmentIds.map((attachmentId) => this.attachmentRepository.linkToMessage(attachmentId, message.id)));
    }

    return message;
  }

  /**
   * Upsert a message into a stable turn slot (turnId, turnSeq).
   * This is the primary primitive for idempotent persistence under retries/races.
   */
  async upsertMessageByTurnSlot(
    request: Message & { conversationId: string; turnId: string; turnSeq: number; attachmentIds?: string[] }
  ): Promise<MessageModel> {
    const message = await this.messageRepository.upsertByTurnSlot({
      role: request.role,
      content: request.content,
      messageType: request.messageType,
      conversationId: request.conversationId,
      turnId: request.turnId,
      turnSeq: request.turnSeq,
      ...(request.reasoning && { reasoning: request.reasoning }),
      ...(request.toolCalls && { toolCalls: request.toolCalls }),
      ...(request.toolCallId && { toolCallId: request.toolCallId }),
      ...(request.agentId && { agentId: request.agentId }),
      ...(request.agentName && { agentName: request.agentName }),
      ...(request.userId && { userId: request.userId }),
      ...(request.userName && { userName: request.userName }),
      ...(request.userAvatar && { userAvatar: request.userAvatar }),
      ...(request.attachmentIds && { attachmentIds: request.attachmentIds }),
      ...(request.linkedConversationId && { linkedConversationId: request.linkedConversationId }),
    });

    // Ensure author is recorded as a participant for this conversation.
    if (request.role === 'user' && request.userId) {
      await this.conversationParticipantRepository.addUserParticipant({
        conversationId: request.conversationId,
        userId: request.userId,
        createdBy: request.userId,
        role: null,
      });
    } else if (request.role === 'assistant' && request.agentId) {
      await this.conversationParticipantRepository.addAgentParticipant({
        conversationId: request.conversationId,
        agentId: request.agentId,
        createdBy: request.userId ?? null,
      });
    }

    if (request.attachmentIds && request.attachmentIds.length > 0) {
      await Promise.all(request.attachmentIds.map((attachmentId) => this.attachmentRepository.linkToMessage(attachmentId, message.id)));
    }

    return message;
  }

  /**
   * Get max turnSeq for a given turn id (or -1 if none).
   */
  async getMaxTurnSeq(turnId: string): Promise<number> {
    return await this.messageRepository.getMaxTurnSeq(turnId);
  }

  /**
   * Update an existing message by id
   */
  async updateMessage(id: string, updates: Partial<MessageModel>): Promise<MessageModel | null> {
    // Thread-linking is a concurrency-sensitive update.
    //
    // Thread creation is a multi-step flow (create child conversation → link message to it).
    // If two requests race to link the same message to different child conversations, a naive
    // update would allow the later request to overwrite `linkedConversationId`, losing the
    // first created thread reference. We prevent this by performing an atomic "set-if-empty"
    // update at the repository layer, and surfacing a 409 on conflict.
    const updateRecord = (updates ?? {}) as Record<string, unknown>;
    const rawLinked = typeof updateRecord['linkedConversationId'] === 'string' ? String(updateRecord['linkedConversationId']).trim() : '';
    const { linkedConversationId: _ignored, ...rest } = updateRecord;
    void _ignored;

    // Apply all non-thread-link updates normally.
    const hasNonLinkUpdates = Object.keys(rest).length > 0;
    const base = hasNonLinkUpdates ? await this.messageRepository.update(id, rest as Partial<MessageModel>) : await this.messageRepository.findById(id);
    if (!base) return null;

    // If no thread link update requested, we're done.
    if (!rawLinked) {
      return base;
    }

    // Atomically set link only if currently unlinked (or already linked to the same id).
    const linked = await this.messageRepository.linkToThreadIfUnlinked(id, rawLinked);
    if (linked) return linked;

    // Distinguish not-found vs conflict by reloading the message.
    const current = await this.messageRepository.findById(id);
    if (!current) return null;

    const existing = typeof (current as any).linkedConversationId === 'string' ? String((current as any).linkedConversationId).trim() : '';
    if (existing && existing !== rawLinked) {
      throw new AppError('Message is already linked to a different thread', 'RESOURCE_CONFLICT', 409, {
        details: {
          messageId: id,
          existingLinkedConversationId: existing,
          attemptedLinkedConversationId: rawLinked,
        },
      });
    }

    // If we get here, the message is either still unlinked (unexpected) or linked to the same id.
    return current;
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
