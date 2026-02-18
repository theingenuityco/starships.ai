/**
 * Message Service
 *
 * Provides business logic APIs for message management and conversation operations.
 * Orchestrates between database persistence (MessageRepository) and business logic.
 */

import { MessageRepository, AttachmentRepository, ConversationParticipantRepository } from '@starships/models';
import { DELETED_MESSAGE_MARKER } from '@starships/protocol';
import type { Message, MessageModel } from '@starships/protocol';

// Postgres full-text (tsvector) has a hard per-row size limit (~1MB). Tool results can exceed this
// (e.g. provider "raw_response" blobs or base64). Keep tool message content compact and store large
// artifacts as attachments instead.
const MAX_TOOL_MESSAGE_CONTENT_CHARS = 900_000;
const TRUNCATED_STRING_CHARS = 50_000;

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return '{"success":false,"error":{"code":"TOOL_RESULT_SERIALIZE_FAILED","message":"Failed to serialize tool result"}}';
  }
}

function truncateString(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars)}…[truncated ${value.length - maxChars} chars]`;
}

function deleteKnownLargeFields(value: unknown, seen = new WeakSet<object>()): void {
  if (!value || typeof value !== 'object') return;
  if (seen.has(value as object)) return;
  seen.add(value as object);

  const obj = value as Record<string, unknown>;

  // Common large blobs we never need in the `messages` table.
  if (Object.prototype.hasOwnProperty.call(obj, 'raw_response')) delete obj.raw_response;
  if (Object.prototype.hasOwnProperty.call(obj, 'rawResponse')) delete obj.rawResponse;
  if (Object.prototype.hasOwnProperty.call(obj, 'reasoningDetails')) delete obj.reasoningDetails;
  if (Object.prototype.hasOwnProperty.call(obj, 'reasoning_details')) delete obj.reasoning_details;

  for (const v of Object.values(obj)) {
    if (v && typeof v === 'object') deleteKnownLargeFields(v, seen);
  }
}

function truncateLongStrings(value: unknown, seen = new WeakSet<object>()): unknown {
  if (typeof value === 'string') return truncateString(value, TRUNCATED_STRING_CHARS);
  if (!value || typeof value !== 'object') return value;
  if (seen.has(value as object)) return value;
  seen.add(value as object);

  if (Array.isArray(value)) return value.map((v) => truncateLongStrings(v, seen));

  const obj = value as Record<string, unknown>;
  for (const [k, v] of Object.entries(obj)) {
    obj[k] = truncateLongStrings(v, seen);
  }
  return obj;
}

function compactToolMessageContent(args: { role: string; messageType?: string; content: string; toolCallId?: string }): string {
  const { role, messageType, content, toolCallId } = args;
  const isToolMessage = role === 'tool' || messageType === 'tool_result';
  if (!isToolMessage) return content;
  if (typeof content !== 'string' || content.length <= MAX_TOOL_MESSAGE_CONTENT_CHARS) return content;

  // Try structured compaction first (strip provider raw blobs, then truncate long strings).
  try {
    const parsed = JSON.parse(content) as unknown;
    deleteKnownLargeFields(parsed);
    const truncated = truncateLongStrings(parsed);
    const json = safeStringify(truncated);
    if (json.length <= MAX_TOOL_MESSAGE_CONTENT_CHARS) return json;

    // Still too large: keep a small envelope so persistence succeeds.
    return safeStringify({
      success: typeof (parsed as any)?.success === 'boolean' ? (parsed as any).success : false,
      error: (parsed as any)?.error,
      data: {
        omitted: true,
        reason: 'TOOL_RESULT_TOO_LARGE',
        toolCallId: toolCallId || undefined,
        originalLengthChars: content.length,
      },
    });
  } catch {
    // Not JSON: hard truncate as a last resort.
    return truncateString(content, MAX_TOOL_MESSAGE_CONTENT_CHARS);
  }
}

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
    const compactedContent = compactToolMessageContent({
      role: request.role,
      messageType: request.messageType,
      content: request.content,
      toolCallId: request.toolCallId,
    });

    // Create message with all available properties including toolCalls, toolCallId, agentId, agentName, and attachmentIds
    const message = await this.messageRepository.create({
      role: request.role,
      content: compactedContent,
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
    const compactedContent = compactToolMessageContent({
      role: request.role,
      messageType: request.messageType,
      content: request.content,
      toolCallId: request.toolCallId,
    });

    const message = await this.messageRepository.upsertByTurnSlot({
      role: request.role,
      content: compactedContent,
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
   * Find the message in a parent conversation that links to a child conversation (thread/index post).
   */
  async getLinkingMessage(args: { conversationId: string; linkedConversationId: string }): Promise<MessageModel | null> {
    return this.messageRepository.findLinkingMessage(args);
  }

  /**
   * Update message
   */
  // Removed duplicate updateMessage method that restricted updates to content only

  /**
   * Delete message and cleanup associated S3 files
   */
  async deleteMessage(messageId: string): Promise<MessageModel | null> {
    // First, get the message with starshipId to access its attachments
    const connection = this.messageRepository['getConnection']();
    const messageData = await connection.queryOne<{
      id: string;
      starship_id: string;
      attachment_ids: string[];
    }>('SELECT id, starship_id, attachment_ids FROM messages WHERE id = $1', [messageId]);

    if (!messageData) {
      return null;
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

    // Soft-delete the message so clients can render "deleted" placeholders.
    const updated = await this.messageRepository.update(messageId, {
      content: DELETED_MESSAGE_MARKER,
      attachmentIds: [],
    });
    return updated;
  }
}
