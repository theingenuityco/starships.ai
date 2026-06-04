/**
 * Database Message Types
 *
 * Database-specific message interfaces and API contract types.
 * Imports message types from @starships/autopilot to avoid duplication.
 */

// Import autopilot types at the top level
import type { LlmMessage } from './llm';

// ============================================================================
// DATABASE MESSAGE INTERFACE
// ============================================================================

export type MessageType =
  | 'user_input'
  | 'agent_response'
  | 'system_notification'
  | 'system_instruction'
  | 'workflow_output'
  | 'error'
  | 'tool_result';

export interface Message extends Omit<LlmMessage, 'content'> {
  // Override content to be string only (client sends string, database stores string)
  // ContentBlock[] is only built when calling LLM
  content: string;
  messageType: MessageType;
  /**
   * Turn linkage for idempotent persistence.
   * When present, identifies which turn/run produced the message.
   */
  turnId?: string;
  /**
   * Per-turn stable ordering slot.
   * Used with (turnId) to provide DB-enforced idempotency.
   */
  turnSeq?: number;
  // Optional model-provided reasoning/thinking text
  reasoning?: string;
  // Agent tracking fields (assistant messages only)
  agentId?: string;
  agentName?: string;
  /**
   * Human author identity (user messages only).
   *
   * NOTE:
   * - `role='user'` means “a human-authored message”, but in multi-member contexts
   *   we must know *which* human authored it.
   * - These fields are optional for backward compatibility with legacy rows.
   */
  userId?: string;
  userName?: string;
  userAvatar?: string;
  // File attachments (array of attachment IDs)
  attachmentIds?: string[];

  /**
   * Emoji reactions keyed by emoji.
   *
   * Value is the ordered list of userIds who reacted with that emoji.
   * (Ordering is stable for UI; do not treat it as meaningful beyond display.)
   */
  reactions?: Record<string, string[]>;

  /**
   * Optional: link this message to a separate conversation.
   * Used for generic "thread preview" / "index post" messages in channels.
   */
  linkedConversationId?: string;

  /**
   * Optional message metadata stored in Postgres (JSONB).
   * Used for internal flags (e.g. hidden seed messages) and future extensibility.
   */
  metadata?: Record<string, unknown>;
}

// Sentinel used to mark a message as deleted (soft delete).
// UI renders a placeholder instead of the raw marker string.
export const DELETED_MESSAGE_MARKER = '__deleted__';

/**
 * Database Message interface - core API contract type
 * Extends Message from autopilot with additional database/persistence fields
 *
 * IMPORTANT: content is always stored as string in database (TEXT column).
 * ContentBlock[] is only built in-memory when calling LLM APIs.
 */
export interface MessageModel extends Omit<Message, 'content'> {
  // Override content to be string only (database stores TEXT, not JSONB)
  content: string;
  // Additional database fields
  id: string;
  createdAt: string;
  updatedAt: string;
}
