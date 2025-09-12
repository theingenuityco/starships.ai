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
export interface Conversation {
  title: string;
  status: 'active' | 'paused' | 'completed' | 'archived';
}

/**
 * Core conversation model - database entity
 */
export interface ConversationModel extends Conversation {
  id: string;
  createdAt: string;
  updatedAt?: string;
}
