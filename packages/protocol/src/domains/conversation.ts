/**
 * Conversation Domain Types
 *
 * Types for conversation functionality including requests, responses, and core types
 */

// ============================================================================
// CONVERSATION TYPES
// ============================================================================

/**
 * Core conversation
 */
export type ConversationStatus = 'active' | 'paused' | 'completed' | 'archived';

export interface Conversation {
  title: string;
  status: ConversationStatus;
  state?: Record<string, unknown>;
}

/**
 * Core conversation model - database entity
 */
export interface ConversationModel extends Conversation {
  id: string;
  starshipId: string;
  parentConversationId?: string;
  /** True when there is at least one turn with status 'active' or 'waiting_for_tools'. Populated by list endpoints that join turns; undefined otherwise. */
  hasActiveTurn?: boolean;
  createdAt: string;
  updatedAt?: string;
}
