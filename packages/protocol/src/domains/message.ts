/**
 * Database Message Types
 *
 * Database-specific message interfaces and API contract types.
 * Imports message types from @starships/autopilot to avoid duplication.
 */

// Import autopilot types at the top level
import type { LlmMessage } from '@starships/autopilot';

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

export interface Message extends LlmMessage {
  messageType: MessageType;
  // Optional model-provided reasoning/thinking text
  reasoning?: string;
  // Agent tracking fields (assistant messages only)
  agentId?: string;
  agentName?: string;
}

/**
 * Database Message interface - core API contract type
 * Extends Message from autopilot with additional database/persistence fields
 */
export interface MessageModel extends Message {
  // Additional database fields (Message already has id, timestamp, role, content, metadata, agentId, agentName)
  id: string;
  createdAt: string;
  updatedAt: string;
}
