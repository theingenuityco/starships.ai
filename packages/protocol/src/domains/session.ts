/**
 * Session Domain Types
 *
 * Types for session functionality including requests, responses, streaming, and socket events
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
  sessionId?: string;
}

/**
 * Chat typing event data
 */
export interface ChatTypingData {
  userId: string;
  sessionId?: string;
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
// SESSION SOURCE TYPE
// ============================================================================

/**
 * Session source type
 */
export type SessionSourceType = 'agent' | 'sibil' | 'user';

/**
 * Base session request interface
 */
export interface SessionRequest {
  source: SessionSourceType;
  agentId?: string;
  userId?: string;
  message: string;
  sessionId?: string;
  stream?: boolean;
  streamId?: string;
  typingSpeed?: number;
  typewriterEnabled?: boolean;
  context?: Record<string, unknown>;
}

/**
 * Base session response interface
 */
export interface SessionResponse {
  source: SessionSourceType;
  content: string;
  agentId?: string;
  sessionId?: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens?: number;
    cost?: number;
  };
  timestamp?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Session stream chunk for real-time streaming
 */
export interface SessionStreamChunk {
  source: SessionSourceType;
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
// SESSION TYPES
// ============================================================================

/**
 * Core session model - database entity
 */
export interface SessionModel {
  id: string;
  source: SessionSourceType;
  agentId?: string;
  userId?: string;
  starshipId?: string;
  createdAt: string;
  updatedAt?: string;
  lastActivityAt: string;
  messageCount: number;
  totalTokens?: number;
  status: 'active' | 'paused' | 'completed' | 'archived';
  metadata?: Record<string, unknown>;
}

/**
 * Session type alias for client compatibility
 */
export type Session = SessionModel;

// ============================================================================
// SESSION ERROR TYPES
// ============================================================================

/**
 * Session error response
 */
export interface SessionError {
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
 * Base socket events for session management
 */
export interface SessionSocketEvents {
  connect: () => void;
  disconnect: () => void;
  error: (error: Error) => void;
  ping: () => void;
  pong: () => void;
  'connection-status': (data: ConnectionStatusEvent) => void;
  'session:start-stream': (data: SessionRequest) => void;
  'session:stream-chunk': (data: SessionStreamChunk) => void;
  'session:stream-complete': (data: SessionStreamChunk) => void;
  'session:stream-error': (data: SessionError) => void;
  'session:typing-start': (data: ChatTypingData) => void;
  'session:typing-stop': (data: ChatTypingData) => void;
  'session:join-room': (data: ChatRoomData) => void;
  'session:leave-room': (data: ChatRoomData) => void;
  'session:stop-stream': (streamId: string) => void;
}

/**
 * Generic type helper for socket event data
 */
export type SocketEventData<T extends (...args: unknown[]) => unknown> = Parameters<T>[0];

// ============================================================================
// TYPE ALIASES FOR CLIENT COMPATIBILITY
// ============================================================================

/**
 * Chat request type alias for client compatibility
 */
export type ChatRequest = SessionRequest;

/**
 * Chat response type alias for client compatibility
 */
export type ChatResponse = SessionResponse;

/**
 * Chat stream chunk type alias for client compatibility
 */
export type ChatStreamChunk = SessionStreamChunk;

/**
 * Chat stream error type alias for client compatibility
 */
export type ChatStreamError = SessionError;

/**
 * Base socket events type alias for server compatibility
 */
export type BaseSocketEvents = SessionSocketEvents;