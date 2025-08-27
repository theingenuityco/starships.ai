/**
 * Unified Chat & Socket Contract Types
 * 
 * Combined interface definitions for chat communication and Socket.IO integration.
 */

// ============================================================================
// USAGE STATISTICS
// ============================================================================

/**
 * LLM usage statistics
 */
export interface UsageStats {
  prompt_tokens: number;
  completion_tokens: number;
}

// ============================================================================
// BASIC CHAT TYPES
// ============================================================================

/**
 * Basic chat request
 */
export interface ChatRequest {
  agent_id: string;
  user_id: string;
  message: string;
  stream?: boolean;
}

/**
 * Basic chat response
 */
export interface ChatResponse {
  reply: string;
  usage?: UsageStats;
}

/**
 * Basic memory entry for conversation history
 */
export interface MemoryEntry {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: number;
}

/**
 * Enhanced memory entry with additional metadata
 */
export interface EnhancedMemoryEntry extends MemoryEntry {
  importance?: number;
  summary?: string;
}

/**
 * Memory search result
 */
export interface MemorySearchResult {
  entries: EnhancedMemoryEntry[];
  relevanceScores: number[];
}

/**
 * Session key for memory management
 */
export type SessionKey = string;

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
// CONTENT BLOCKS
// ============================================================================

/**
 * Content block for structured responses
 */
export interface ContentBlock {
  type: 'text' | 'markdown' | 'code' | 'table';
  content: string;
  metadata?: {
    language?: string;
    headers?: string[];
  };
}

// ============================================================================
// SIBIL CHAT INTERFACES
// ============================================================================

/**
 * Sibil request interface
 */
export interface SibilRequest {
  provider: 'openai' | 'anthropic';
  model?: string;
  message: string;
  user_id: string;
  session_id?: string;
  starship_id?: string;
}

/**
 * Sibil response interface
 */
export interface SibilResponse {
  content: string;
  structured_content?: ContentBlock[];
  provider: 'openai' | 'anthropic';
  model: string;
  usage?: UsageStats;
}

/**
 * Sibil streaming request
 */
export interface SibilStreamRequest extends SibilRequest {
  stream: true;
}

/**
 * Sibil streaming chunk
 */
export interface SibilStreamChunk {
  type: 'content' | 'structured' | 'complete' | 'error' | 'connected';
  content?: string;
  structured_content?: ContentBlock[];
  provider?: 'openai' | 'anthropic';
  model?: string;
  usage?: UsageStats;
  error?: string;
  chunk_id?: string;
  is_final?: boolean;
  stream_id?: string;
}

/**
 * Sibil streaming response
 */
export interface SibilStreamResponse {
  stream_id: string;
  status: 'started' | 'streaming' | 'completed' | 'error';
}

/**
 * Sibil stream completion response - extends SibilResponse with stream info
 */
export interface SibilStreamCompleteResponse extends SibilResponse {
  stream_id?: string;
}

// ============================================================================
// SOCKET.IO CHAT INTERFACES
// ============================================================================

/**
 * Enhanced Sibil request for Socket.IO
 */
export interface SibilSocketRequest extends SibilRequest {
  stream_id: string;
  typewriter_enabled?: boolean;
  typing_speed?: number; // characters per second (default: 75)
}

/**
 * Enhanced Sibil streaming chunk for Socket.IO
 */
export interface SibilSocketStreamChunk extends SibilStreamChunk {
  stream_id: string;
  typewriter?: TypewriterData; // Client-side typewriter functionality
  typing_speed?: number;
  timestamp: number;
}

/**
 * Sibil stream error interface
 */
export interface SibilStreamError {
  stream_id?: string;
  error_code: string;
  message: string;
  timestamp: number;
  recoverable: boolean;
}

/**
 * Agent Socket.IO request
 */
export interface AgentSocketRequest {
  agent_id: string;
  session_id: string;
  message: string;
  stream_id: string;
  typewriter_enabled?: boolean;
  typing_speed?: number; // characters per second (default: 75)
  user_id: string; // From auth context
}

/**
 * Agent Socket.IO streaming chunk
 */
export interface AgentSocketStreamChunk {
  stream_id: string;
  agent_id: string;
  type: 'content' | 'complete' | 'error';
  content?: string;
  typewriter?: TypewriterData; // Client-side typewriter functionality
  timestamp: number;
}

/**
 * Agent chat response
 */
export interface AgentChatResponse {
  content: string;
  agent_id: string;
  session_id: string;
  timestamp: string;
  usage?: UsageStats;
}

/**
 * Agent stream error
 */
export interface AgentStreamError {
  stream_id?: string;
  agent_id?: string;
  error_code: string;
  message: string;
  timestamp: number;
  recoverable: boolean;
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
// CHAT SOCKET EVENTS
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
// COMBINED SOCKET EVENTS
// ============================================================================

/**
 * Combined chat socket events interface
 */
export interface ChatSocketIOEvents extends BaseSocketEvents, ChatSocketEvents {}

/**
 * Main Chat and Socket Events interface
 */
export type SocketEvents = ChatSocketIOEvents;

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