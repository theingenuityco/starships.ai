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
  'chat:start-stream': (data: any) => void;
  'chat:stream-chunk': (data: any) => void;
  'chat:stream-complete': (data: any) => void;
  'chat:stream-error': (data: any) => void;
  'chat:stream-start': (data: any) => void;
  'chat:typing-start': (data: any) => void;
  'chat:typing-stop': (data: any) => void;
  'chat:join-room': (data: any) => void;
  'chat:leave-room': (data: any) => void;
  'agent:stream-error': (data: any) => void;
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