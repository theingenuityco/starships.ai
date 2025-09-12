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
}

/**
 * Core conversation model - database entity
 */
export interface ConversationModel extends Conversation {
  id: string;
  createdAt: string;
  updatedAt?: string;
}

export type CreateConversationRequest = Omit<Conversation, 'status'>;

export type UpdateConversationRequest = Conversation;
