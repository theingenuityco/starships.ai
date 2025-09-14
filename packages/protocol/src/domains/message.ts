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

export type MessageType = 'user_input' | 'agent_response' | 'system_notification' | 'system_instruction' | 'workflow_output' | 'error';

export interface Message extends LlmMessage {
  messageType: MessageType;
}

/**
 * Database Message interface - core API contract type
 * Extends Message from autopilot with additional database/persistence fields
 */
export interface MessageModel extends Message {
  // Additional database fields (Message already has id, timestamp, role, content, metadata)
  id: string;
  createdAt: string;
  updatedAt: string;
}
