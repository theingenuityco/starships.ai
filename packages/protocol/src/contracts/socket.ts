/**
 * Socket.IO Contract Types
 * 
 * Real-time communication event definitions for Socket.IO integration.
 */

import type {
  SibilSocketRequest,
  SibilSocketStreamChunk,
  SibilStreamError,
  SibilStreamCompleteResponse,
  AgentSocketRequest,
  AgentSocketStreamChunk,
  AgentStreamError,
  AgentChatResponse
} from './sibil';

import type {
  VisionAnalysisRequest,
  VisionRefinementRequest,
  VisionUpdateRequest,
  VisionAnalysisEventData,
  VisionProposalEventData,
  VisionUpdatedEventData,
  VisionRefinementErrorEventData,
  VisionRefinementState
} from '../domain/vision';

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
  'sibil:start-stream': (request: SibilSocketRequest) => void;
  'sibil:stop-stream': (streamId: string) => void;
  'sibil:join-room': (userId: string) => void;
  'sibil:leave-room': (userId: string) => void;

  // Sibil Server to Client events
  'sibil:stream-start': (streamId: string) => void;
  'sibil:stream-chunk': (chunk: SibilSocketStreamChunk) => void;
  'sibil:stream-complete': (response: SibilStreamCompleteResponse) => void;
  'sibil:stream-error': (error: SibilStreamError) => void;
  'sibil:typing-start': () => void;
  'sibil:typing-stop': () => void;

  // Agent Chat Client to Server events
  'agent:start-stream': (request: AgentSocketRequest) => void;
  'agent:stop-stream': (streamId: string) => void;
  'agent:join-room': (userId: string, agentId: string) => void;
  'agent:leave-room': (userId: string, agentId: string) => void;

  // Agent Chat Server to Client events
  'agent:stream-start': (streamId: string, agentId: string) => void;
  'agent:stream-chunk': (chunk: AgentSocketStreamChunk) => void;
  'agent:stream-complete': (response: AgentChatResponse) => void;
  'agent:stream-error': (error: AgentStreamError) => void;
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
  'vision:analyze': (request: VisionAnalysisRequest, callback?: (response: { success: boolean; error?: string; sessionId?: string }) => void) => void;
  'vision:refine': (request: VisionRefinementRequest, callback?: (response: { success: boolean; error?: string }) => void) => void;
  'vision:accept-proposal': (data: { starshipId: string; sessionId: string; userId: string }, callback?: (response: { success: boolean; error?: string }) => void) => void;
  'vision:reject-proposal': (data: { starshipId: string; sessionId: string; userId: string; feedback?: string[] }, callback?: (response: { success: boolean; error?: string }) => void) => void;
  'vision:update': (request: VisionUpdateRequest, callback?: (response: { success: boolean; error?: string }) => void) => void;
  'vision:get-state': (data: { starshipId: string; userId: string }, callback?: (response: { success: boolean; state?: VisionRefinementState; error?: string }) => void) => void;
  
  // Server to Client events
  'vision:analyzing': (data: VisionAnalysisEventData) => void;
  'vision:analysis-complete': (data: VisionAnalysisEventData) => void;
  'vision:proposal': (data: VisionProposalEventData) => void;
  'vision:updated': (data: VisionUpdatedEventData) => void;
  'vision:state-changed': (data: VisionUpdatedEventData) => void;
  'vision:error': (data: VisionRefinementErrorEventData) => void;
  
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
 * Main SocketIO Events interface - alias for SocketEvents
 */
export type SocketIOEvents = SocketEvents;


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