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
  // Streaming support - core properties only
  stream?: boolean;
  streamId?: string;
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
  // Streaming support
  streaming?: boolean;
  streamId?: string;
  websocketUrl?: string;
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
  totalTokens: number; // Made required for consistency
  status: 'active' | 'paused' | 'completed' | 'archived';
  metadata?: Record<string, unknown>;
  // Add relationship fields
  starshipId?: string;
  userId?: string;
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
