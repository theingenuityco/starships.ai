/**
 * Chat & Socket Contract Types
 *
 * Interface definitions for chat communication and Socket.IO integration.
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
// MEMORY TYPES
// ============================================================================

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
// CHAT TYPES (REST + Socket.IO)
// ============================================================================

/**
 * Chat source type - distinguishes between different chat systems
 */
export type ChatSourceType = 'sibil' | 'agent';

/**
 * Base chat request (works for both REST API and Socket.IO)
 */
export interface ChatRequest {
  source: ChatSourceType;
  message: string;
  user_id: string;
  session_id?: string;
  
  // Sibil-specific fields
  provider?: 'openai' | 'anthropic';
  model?: string;
  starship_id?: string;
  
  // Agent-specific fields
  agent_id?: string;
  
  // Optional streaming flag for REST API
  stream?: boolean;
}

/**
 * Base chat response (works for both REST API and Socket.IO)
 */
export interface ChatResponse {
  source: ChatSourceType;
  content: string;
  session_id?: string;
  timestamp?: string;
  
  // Sibil-specific fields
  structured_content?: ContentBlock[];
  provider?: 'openai' | 'anthropic';
  model?: string;
  usage?: UsageStats;
  
  // Agent-specific fields
  agent_id?: string;
}

/**
 * Streaming request (extends ChatRequest)
 */
export interface ChatStreamRequest extends ChatRequest {
  stream: true;
}

/**
 * Streaming chunk (works for both REST API and Socket.IO)
 */
export interface ChatStreamChunk {
  source: ChatSourceType;
  type: 'content' | 'structured' | 'complete' | 'error' | 'connected';
  content?: string;
  structured_content?: ContentBlock[];
  
  // Sibil-specific fields
  provider?: 'openai' | 'anthropic';
  model?: string;
  usage?: UsageStats;
  
  // Agent-specific fields
  agent_id?: string;
  
  // Error handling
  error?: string;
  chunk_id?: string;
  is_final?: boolean;
  stream_id?: string; // Optional for REST, required for Socket.IO
}

/**
 * Streaming response metadata (works for both REST API and Socket.IO)
 */
export interface ChatStreamResponse {
  stream_id: string;
  source: ChatSourceType;
  status: 'started' | 'streaming' | 'completed' | 'error';
}

// ============================================================================
// SOCKET.IO ENHANCED INTERFACES
// ============================================================================

/**
 * Socket.IO enhanced chat request (extends base ChatRequest)
 */
export interface ChatSocketRequest extends ChatRequest {
  stream_id: string; // Required for Socket.IO
  
  // Socket enhancements
  typewriter_enabled?: boolean;
  typing_speed?: number; // characters per second (default: 75)
}

/**
 * Socket.IO enhanced chat streaming chunk (extends base ChatStreamChunk)
 */
export interface ChatSocketStreamChunk extends ChatStreamChunk {
  stream_id: string; // Required for Socket.IO
  timestamp: number; // Required for Socket.IO
  
  // Socket enhancements
  typewriter?: TypewriterData;
  typing_speed?: number;
}

/**
 * Socket.IO enhanced chat response (extends base ChatResponse)
 */
export interface ChatSocketResponse extends ChatResponse {
  stream_id?: string;
  timestamp: string; // Required for Socket.IO
}

/**
 * Socket.IO stream error interface
 */
export interface ChatSocketStreamError {
  source: ChatSourceType;
  stream_id?: string;
  agent_id?: string;
  error_code: string;
  message: string;
  timestamp: number;
  recoverable: boolean;
}

/**
 * Socket.IO stream response metadata (extends base ChatStreamResponse)
 */
export interface ChatSocketStreamResponse extends ChatStreamResponse {
  // Inherits from base ChatStreamResponse
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
 * Unified Chat Socket.IO events
 */
export interface ChatSocketEvents {
  // Connection events
  'connection-status': (event: ConnectionStatusEvent) => void;
  'ping': () => void;
  'pong': () => void;

  // Unified Chat Client to Server events
  'chat:start-stream': (request: ChatSocketRequest) => void;
  'chat:stop-stream': (streamId: string) => void;
  'chat:join-room': (data: { userId: string; agentId?: string; source: ChatSourceType }) => void;
  'chat:leave-room': (data: { userId: string; agentId?: string; source: ChatSourceType }) => void;

  // Unified Chat Server to Client events
  'chat:stream-start': (data: { streamId: string; source: ChatSourceType; agentId?: string }) => void;
  'chat:stream-chunk': (chunk: ChatSocketStreamChunk) => void;
  'chat:stream-complete': (response: ChatSocketResponse) => void;
  'chat:stream-error': (error: ChatSocketStreamError) => void;
  'chat:typing-start': (data: { source: ChatSourceType; agentId?: string }) => void;
  'chat:typing-stop': (data: { source: ChatSourceType; agentId?: string }) => void;
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