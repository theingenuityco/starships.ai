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
// UNIFIED CHAT INTERFACES
// ============================================================================

/**
 * Chat source type - distinguishes between different chat systems
 */
export type ChatSourceType = 'sibil' | 'agent';

/**
 * Unified chat request interface
 */
export interface ChatSocketRequest {
  source: ChatSourceType;
  message: string;
  user_id: string;
  stream_id: string;
  session_id?: string;
  
  // Sibil-specific fields
  provider?: 'openai' | 'anthropic';
  model?: string;
  starship_id?: string;
  
  // Agent-specific fields
  agent_id?: string;
  
  // Socket enhancements
  typewriter_enabled?: boolean;
  typing_speed?: number; // characters per second (default: 75)
}

/**
 * Unified chat streaming chunk
 */
export interface ChatSocketStreamChunk {
  source: ChatSourceType;
  stream_id: string;
  type: 'content' | 'structured' | 'complete' | 'error' | 'connected';
  content?: string;
  structured_content?: ContentBlock[];
  
  // Sibil-specific fields
  provider?: 'openai' | 'anthropic';
  model?: string;
  usage?: UsageStats;
  
  // Agent-specific fields
  agent_id?: string;
  
  // Socket enhancements
  typewriter?: TypewriterData;
  typing_speed?: number;
  timestamp: number;
  
  // Error handling
  error?: string;
  chunk_id?: string;
  is_final?: boolean;
}

/**
 * Unified chat response
 */
export interface ChatSocketResponse {
  source: ChatSourceType;
  content: string;
  stream_id?: string;
  session_id?: string;
  timestamp: string;
  
  // Sibil-specific fields
  structured_content?: ContentBlock[];
  provider?: 'openai' | 'anthropic';
  model?: string;
  usage?: UsageStats;
  
  // Agent-specific fields
  agent_id?: string;
}

/**
 * Unified stream error interface
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
 * Stream response metadata
 */
export interface ChatSocketStreamResponse {
  stream_id: string;
  source: ChatSourceType;
  status: 'started' | 'streaming' | 'completed' | 'error';
}

// ============================================================================
// STANDALONE SIBIL INTERFACES (for non-socket usage)
// ============================================================================

/**
 * Basic Sibil request interface (for REST API)
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
 * Basic Sibil response interface (for REST API)
 */
export interface SibilResponse {
  content: string;
  structured_content?: ContentBlock[];
  provider: 'openai' | 'anthropic';
  model: string;
  usage?: UsageStats;
}

/**
 * Sibil streaming request (for REST API)
 */
export interface SibilStreamRequest extends SibilRequest {
  stream: true;
}

/**
 * Sibil streaming chunk (for REST API)
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
 * Sibil streaming response (for REST API)
 */
export interface SibilStreamResponse {
  stream_id: string;
  status: 'started' | 'streaming' | 'completed' | 'error';
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