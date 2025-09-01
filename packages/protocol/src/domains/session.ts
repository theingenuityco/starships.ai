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
  room_joined: boolean;
  user_id?: string;
  connection_id?: string;
  last_ping?: number;
}

/**
 * Connection status event data
 */
export interface ConnectionStatusEvent {
  status: 'connected' | 'disconnected' | 'reconnecting' | 'error';
  user_id: string;
  connection_id: string;
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
  room_id: string;
  user_id: string;
  session_id?: string;
}

/**
 * Chat typing event data
 */
export interface ChatTypingData {
  user_id: string;
  session_id?: string;
  room_id?: string;
  is_typing: boolean;
}

// ============================================================================
// EVENT EMISSION UTILITIES
// ============================================================================

/**
 * Event emission options
 */
export interface EventEmissionOptions {
  exclude_user?: string;
  include_users?: string[];
  retry_count?: number;
  timeout?: number;
}

/**
 * Event emission result
 */
export interface EventEmissionResult {
  success: boolean;
  event_type: string;
  recipient_count: number;
  errors?: Array<{
    user_id: string;
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
  agent_id?: string;
  user_id?: string;
  message: string;
  session_id?: string;
  stream?: boolean;
  stream_id?: string;
  typing_speed?: number;
  typewriter_enabled?: boolean;
  context?: Record<string, unknown>;
}

/**
 * Base session response interface
 */
export interface SessionResponse {
  source: SessionSourceType;
  content: string;
  agent_id?: string;
  session_id?: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens?: number;
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
  stream_id: string;
  agent_id?: string;
  type: 'content' | 'status' | 'error' | 'complete';
  content: string;
  typewriter?: {
    type: 'character' | 'word' | 'line';
    content: string;
    position: number;
    total_length: number;
    delay: number;
    is_code?: boolean;
    is_markdown?: boolean;
  };
  timestamp: number;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// SESSION TYPES
// ============================================================================

/**
 * Session information
 */
export interface Session {
  id: string;
  source: SessionSourceType;
  agent_id?: string;
  user_id?: string;
  starship_id?: string;
  created_at: string;
  updated_at: string;
  last_activity_at: string;
  message_count: number;
  total_tokens?: number;
  status: 'active' | 'paused' | 'completed' | 'archived';
  metadata?: Record<string, unknown>;
}

// ============================================================================
// SESSION ERROR TYPES
// ============================================================================

/**
 * Session error response
 */
export interface SessionError {
  stream_id?: string;
  agent_id?: string;
  error_code: string;
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
  'session:stream-start': (data: SessionStreamChunk) => void;
  'session:stream-chunk': (data: SessionStreamChunk) => void;
  'session:stream-complete': (data: SessionStreamChunk) => void;
  'session:stream-error': (data: SessionError) => void;
  'session:typing-start': (data: ChatTypingData) => void;
  'session:typing-stop': (data: ChatTypingData) => void;
  'session:join-room': (data: ChatRoomData) => void;
  'session:leave-room': (data: ChatRoomData) => void;
  'session:stop-stream': (stream_id: string) => void;
}

/**
 * Generic type helper for socket event data
 */
export type SocketEventData<T extends (...args: unknown[]) => unknown> = Parameters<T>[0];