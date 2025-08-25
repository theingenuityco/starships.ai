/**
 * Socket.IO Contract Types
 * 
 * Real-time communication event definitions for Socket.IO integration.
 */

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
// CHAT-RELATED EVENTS
// ============================================================================

/**
 * Chat-related Socket.IO events for Sibil and Agent chat
 */
export interface ChatSocketEvents {
  // Connection events
  'connection-status': (event: ConnectionStatusEvent) => void;
  'ping': () => void;
  'pong': () => void;

  // Sibil Client to Server events
  'sibil:start-stream': (request: any) => void;
  'sibil:stop-stream': (streamId: string) => void;
  'sibil:join-room': (userId: string) => void;
  'sibil:leave-room': (userId: string) => void;

  // Sibil Server to Client events
  'sibil:stream-start': (streamId: string) => void;
  'sibil:stream-chunk': (chunk: any) => void;
  'sibil:stream-complete': (response: any) => void;
  'sibil:stream-error': (error: any) => void;
  'sibil:typing-start': () => void;
  'sibil:typing-stop': () => void;

  // Agent Chat Client to Server events
  'agent:start-stream': (request: any) => void;
  'agent:stop-stream': (streamId: string) => void;
  'agent:join-room': (userId: string, agentId: string) => void;
  'agent:leave-room': (userId: string, agentId: string) => void;

  // Agent Chat Server to Client events
  'agent:stream-start': (streamId: string, agentId: string) => void;
  'agent:stream-chunk': (chunk: any) => void;
  'agent:stream-complete': (response: any) => void;
  'agent:stream-error': (error: any) => void;
  'agent:typing-start': (agentId: string) => void;
  'agent:typing-stop': (agentId: string) => void;
}

// ============================================================================
// VISION REFINEMENT EVENTS
// ============================================================================

/**
 * Vision refinement Socket.IO events
 */
export interface VisionRefinementSocketEvents {
  // Client to Server events
  'vision:analyze': (request: any, callback?: (response: { success: boolean; error?: string; sessionId?: string }) => void) => void;
  'vision:refine': (request: any, callback?: (response: { success: boolean; error?: string }) => void) => void;
  'vision:accept-proposal': (data: { starshipId: string; sessionId: string; userId: string }, callback?: (response: { success: boolean; error?: string }) => void) => void;
  'vision:reject-proposal': (data: { starshipId: string; sessionId: string; userId: string; feedback?: string[] }, callback?: (response: { success: boolean; error?: string }) => void) => void;
  'vision:update': (request: any, callback?: (response: { success: boolean; error?: string }) => void) => void;
  'vision:get-state': (data: { starshipId: string; userId: string }, callback?: (response: { success: boolean; state?: any; error?: string }) => void) => void;
  
  // Server to Client events
  'vision:analyzing': (data: any) => void;
  'vision:analysis-complete': (data: any) => void;
  'vision:proposal': (data: any) => void;
  'vision:updated': (data: any) => void;
  'vision:state-changed': (data: any) => void;
  'vision:error': (data: any) => void;
  
  // Room management for vision refinement
  'vision:join-starship-room': (data: { starshipId: string; userId: string }) => void;
  'vision:leave-starship-room': (data: { starshipId: string; userId: string }) => void;
}

// ============================================================================
// COMBINED SOCKET EVENTS
// ============================================================================

/**
 * Combined socket events interface
 */
export interface SocketEvents extends BaseSocketEvents, ChatSocketEvents, VisionRefinementSocketEvents {}

/**
 * Main SocketIO Events interface
 */
export interface SocketIOEvents extends SocketEvents {}

/**
 * Enhanced SocketIO Events interface for backward compatibility
 */
export interface EnhancedSocketIOEvents extends SocketIOEvents {}

// ============================================================================
// UTILITY TYPES
// ============================================================================

/**
 * Type helper for socket event data
 */
export type SocketEventData<T extends keyof SocketEvents> = Parameters<SocketEvents[T]>[0];

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