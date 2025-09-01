/**
 * Socket Contract Types
 *
 * Pure Socket.IO infrastructure types and generic socket functionality.
 * Domain-specific socket types should be defined in their respective domains.
 */

// ============================================================================
// TYPEWRITER INTERFACES
// ============================================================================

/**
 * Minimal typewriter interface for streaming effects
 * Client packages can extend this with additional properties
 */
export interface TypewriterData {
  type: string;
  content: string;
  [key: string]: unknown; // Allow extensions by client
}

// ============================================================================
// CONNECTION STATE
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

// ============================================================================
// BASE SOCKET EVENTS
// ============================================================================

// ============================================================================
// CHAT EVENT DATA TYPES
// ============================================================================

/**
 * Chat stream event data
 */
export interface ChatStreamData {
  streamId: string;
  content: string;
  messageId?: string;
  sessionId?: string;
  userId?: string;
}

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

/**
 * Agent stream error data
 */
export interface AgentStreamErrorData {
  streamId: string;
  error: string;
  code?: string;
  agentId?: string;
  timestamp: string;
}

/**
 * Base socket events
 */
export interface BaseSocketEvents {
  connect: () => void;
  disconnect: () => void;
  error: (error: Error) => void;
  ping: () => void;
  pong: () => void;
  'connection-status': (data: ConnectionStatusEvent) => void;
  'chat:start-stream': (data: ChatStreamData) => void;
  'chat:stream-chunk': (data: ChatStreamData) => void;
  'chat:stream-complete': (data: ChatStreamData) => void;
  'chat:stream-error': (data: AgentStreamErrorData) => void;
  'chat:stream-start': (data: ChatStreamData) => void;
  'chat:typing-start': (data: ChatTypingData) => void;
  'chat:typing-stop': (data: ChatTypingData) => void;
  'chat:join-room': (data: ChatRoomData) => void;
  'chat:leave-room': (data: ChatRoomData) => void;
  'agent:stream-error': (data: AgentStreamErrorData) => void;
  'agent:stop-stream': (streamId: string) => void;
}

/**
 * Extended socket events (for backward compatibility)
 * @deprecated Use BaseSocketEvents directly
 */
export type SocketEvents = BaseSocketEvents;

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
// UTILITY TYPES
// ============================================================================

/**
 * Generic type helper for socket event data
 */
export type SocketEventData<T extends (...args: unknown[]) => unknown> = Parameters<T>[0];

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