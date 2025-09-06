/**
 * Conversation Domain Types
 *
 * Types for conversation functionality including requests, responses, streaming, and socket events
 */

// ============================================================================
// SOCKET CONNECTION STATE
// ============================================================================

/**
 * Socket.IO client connection state
 */
export interface SocketConnectionState {
  connected: boolean;
  authenticated: boolean;
  roomJoined: boolean;
  userId?: string;
  connectionId?: string;
  lastPing?: number;
}

/**
 * Connection status event data
 */
export interface ConnectionStatusEvent {
  status: 'connected' | 'disconnected' | 'reconnecting' | 'error';
  userId: string;
  connectionId: string;
  timestamp: string;
}

/**
 * Connection status type
 */
export type ConnectionStatus = 'connected' | 'disconnected' | 'reconnecting' | 'error';

// ============================================================================
// CHAT EVENT DATA TYPES
// ============================================================================

/**
 * Chat room event data
 */
export interface ChatRoomData {
  roomId: string;
  userId: string;
  conversationId?: string;
}

/**
 * Chat typing event data
 */
export interface ChatTypingData {
  userId: string;
  conversationId?: string;
  roomId?: string;
  isTyping: boolean;
}

// ============================================================================
// EVENT EMISSION UTILITIES
// ============================================================================

/**
 * Event emission options
 */
export interface EventEmissionOptions {
  excludeUser?: string;
  includeUsers?: string[];
  retryCount?: number;
  timeout?: number;
}

/**
 * Event emission result
 */
export interface EventEmissionResult {
  success: boolean;
  eventType: string;
  recipientCount: number;
  errors?: Array<{
    userId: string;
    error: string;
  }>;
  timestamp: string;
}

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
// LEGACY COMPATIBILITY TYPES
// ============================================================================

/**
 * @deprecated Use ConversationRequest instead
 * Legacy session request type for backward compatibility during transition
 */
export type SessionRequest = ConversationRequest;

/**
 * @deprecated Use ConversationResponse instead
 * Legacy session response type for backward compatibility during transition
 */
export type SessionResponse = ConversationResponse;

/**
 * @deprecated Use ConversationSocketEvents instead
 * Legacy socket events type for backward compatibility during transition
 */
export type SessionSocketEvents = ConversationSocketEvents;

/**
 * @deprecated Use ConversationStreamChunk instead
 * Legacy stream chunk type for backward compatibility during transition
 */
export type SessionStreamChunk = ConversationStreamChunk;

/**
 * Conversation stream chunk for real-time streaming
 */
export interface ConversationStreamChunk {
  source: ConversationSourceType;
  streamId: string;
  agentId?: string;
  type: 'content' | 'status' | 'error' | 'complete';
  content: string;
  typewriter?: {
    type: 'character' | 'word' | 'line';
    content: string;
    position: number;
    totalLength: number;
    delay: number;
    isCode?: boolean;
    isMarkdown?: boolean;
  };
  timestamp: number;
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

// ============================================================================
// SOCKET EVENT INTERFACES
// ============================================================================

/**
 * Base socket events for conversation management
 */
export interface ConversationSocketEvents {
  connect: () => void;
  disconnect: () => void;
  error: (error: Error) => void;
  ping: () => void;
  pong: () => void;
  'connection-status': (data: ConnectionStatusEvent) => void;
  'conversation:start-stream': (data: ConversationRequest) => void;
  'conversation:stream-chunk': (data: ConversationStreamChunk) => void;
  'conversation:stream-complete': (data: ConversationStreamChunk) => void;
  'conversation:stream-error': (data: ConversationError) => void;
  'conversation:typing-start': (data: ChatTypingData) => void;
  'conversation:typing-stop': (data: ChatTypingData) => void;
  'conversation:join-room': (data: ChatRoomData) => void;
  'conversation:leave-room': (data: ChatRoomData) => void;
  'conversation:stop-stream': (streamId: string) => void;
}

/**
 * Generic type helper for socket event data
 */
export type SocketEventData<T extends (...args: unknown[]) => unknown> = Parameters<T>[0];

/**
 * Base socket events type alias for server compatibility
 */
export type BaseSocketEvents = ConversationSocketEvents;
