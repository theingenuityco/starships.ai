/**
 * Conversation Domain Types
 *
 * Types for conversation functionality including requests, responses, and core types
 */

// ============================================================================
// CONVERSATION SOURCE TYPE
// ============================================================================

/**
 * Conversation source type
 */
export type ConversationSourceType = 'agent' | 'user';

/**
 * Base conversation request interface
 */
export interface ConversationRequest {
  source: ConversationSourceType;
  agentId?: string;
  userId?: string;
  message: string;
  conversationId?: string;
  stream?: boolean;
  streamId?: string;
  typingSpeed?: number;
  typewriterEnabled?: boolean;
  context?: Record<string, unknown>;
}

/**
 * Base conversation response interface
 */
export interface ConversationResponse {
  source: ConversationSourceType;
  content: string;
  agentId?: string;
  conversationId?: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens?: number;
    cost?: number;
  };
  timestamp?: string;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// CONVERSATION TYPES
// ============================================================================

/**
 * Core conversation model - database entity
 */
export interface ConversationModel {
  id: string;
  createdAt: string;
  updatedAt?: string;
  lastActivityAt: string;
  messageCount: number;
  totalTokens?: number;
  status: 'active' | 'paused' | 'completed' | 'archived';
  metadata?: Record<string, unknown>;
}

/**
 * Conversation type alias for client compatibility
 */
export type Conversation = ConversationModel;

// ============================================================================
// CONVERSATION ERROR TYPES
// ============================================================================

/**
 * Conversation error response
 */
export interface ConversationError {
  streamId?: string;
  agentId?: string;
  errorCode: string;
  message: string;
  timestamp: number;
  recoverable: boolean;
  metadata?: Record<string, unknown>;
}
