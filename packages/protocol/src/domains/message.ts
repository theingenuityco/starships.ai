/**
 * Database Message Types
 *
 * Database-specific message interfaces and API contract types.
 * Imports message types from @starships/autopilot to avoid duplication.
 */

// Import autopilot types at the top level
import type {
  Message
} from '@starships/autopilot';

// ============================================================================
// DATABASE MESSAGE INTERFACE
// ============================================================================

/**
 * Database Message interface - core API contract type
 * Extends Message from autopilot with additional database/persistence fields
 */
export interface MessageModel extends Message {
  // Additional database fields (Message already has id, timestamp, role, content, metadata)
  createdAt: string;
  starshipId: string;
  agentId?: string; // Optional agent that created/processed this message
  memoryId?: string; // Optional memory container this message belongs to
  conversationId?: string; // Group related messages together
}

// ============================================================================
// MESSAGE REQUEST/RESPONSE TYPES
// ============================================================================

/**
 * Request to create a new message
 */
export interface CreateMessageRequest {
  role: 'system' | 'user' | 'assistant';
  content: string;
  starshipId: string;
  agentId?: string;
  memoryId?: string;
  conversationId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Request to update a message
 */
export interface UpdateMessageRequest extends Partial<CreateMessageRequest> {
  // Simplified update request
}

// ============================================================================
// MESSAGE COLLECTION-SPECIFIC TYPES
// ============================================================================

/**
 * Message database response with pagination
 */
export interface MessageListResponse {
  messages: MessageModel[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * Message response with single message
 */
export interface MessageResponse {
  message: MessageModel;
}

/**
 * Request to search messages
 */
export interface SearchMessagesRequest {
  query: string;
  starshipId?: string;
  agentId?: string;
  memoryId?: string;
  conversationId?: string;
  role?: 'system' | 'user' | 'assistant';
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  offset?: number;
}

/**
 * Response for search messages
 */
export interface SearchMessagesResponse {
  messages: MessageModel[];
  total: number;
  searchQuery: string;
}

/**
 * Request to filter messages
 */
export interface MessageFilters {
  starshipId?: string;
  agentId?: string;
  memoryId?: string;
  conversationId?: string;
  role?: 'system' | 'user' | 'assistant';
  dateFrom?: string;
  dateTo?: string;
}

/**
 * Message thread request
 */
export interface GetMessageThreadRequest {
  messageId: string;
  includeParents?: boolean;
  includeChildren?: boolean;
  maxDepth?: number;
}

/**
 * Message thread response
 */
export interface MessageThreadResponse {
  rootMessage: MessageModel;
  thread: MessageModel[];
  totalDepth: number;
}

/**
 * Conversation request
 */
export interface GetConversationRequest {
  conversationId: string;
  limit?: number;
  offset?: number;
  orderBy?: 'timestamp' | 'created_at';
  orderDirection?: 'asc' | 'desc';
}

/**
 * Conversation response
 */
export interface ConversationResponse {
  conversationId: string;
  messages: MessageModel[];
  total: number;
  participants: string[]; // Agent IDs that participated
  startedAt: string;
  lastActivityAt: string;
}

/**
 * Message usage statistics
 */
export interface MessageUsageStats {
  messageId: string;
  viewCount: number;
  referencedByCount: number;
  lastAccessedAt: string | null;
}

/**
 * Message analytics
 */
export interface MessageAnalytics {
  messageId: string;
  conversationId?: string;
  role: MessageModel['role'];
  contentLength: number;
  createdAt: string;
  agentId?: string;
  hasResponses: boolean;
  responseCount: number;
}

/**
 * Bulk message operations
 */
export interface BulkMessageRequest {
  messageIds: string[];
  operation: 'delete' | 'archive' | 'update_status' | 'assign_conversation';
  operationData?: Record<string, unknown>;
}

/**
 * Bulk message response
 */
export interface BulkMessageResponse {
  processed: number;
  failed: number;
  errors: Array<{
    messageId: string;
    error: string;
  }>;
}