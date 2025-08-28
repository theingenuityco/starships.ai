/**
 * Chat Domain Types
 *
 * Core chat system types and domain-specific interfaces.
 * Extracted from contracts/chat-socket.ts to establish chat as an independent domain.
 */

// Import pure socket infrastructure types
import type {
  TypewriterData,
  BaseSocketEvents,
  ConnectionStatusEvent,
} from '../contracts/socket';

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
// CHAT TYPES
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
// CHAT SESSION MANAGEMENT
// ============================================================================

/**
 * Chat session configuration
 */
export interface ChatSession {
  id: string;
  user_id: string;
  source: ChatSourceType;
  created_at: string;
  last_activity: string;
  
  // Session metadata
  starship_id?: string;
  agent_id?: string;
  provider?: 'openai' | 'anthropic';
  model?: string;
  
  // Session state
  message_count: number;
  total_tokens?: number;
  is_active: boolean;
}

/**
 * Chat message record
 */
export interface ChatMessage {
  id: string;
  session_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  structured_content?: ContentBlock[];
  timestamp: string;
  
  // Metadata
  provider?: 'openai' | 'anthropic';
  model?: string;
  usage?: UsageStats;
  
  // Optional fields
  agent_id?: string;
  stream_id?: string;
}

// ============================================================================
// SOCKET.IO & TYPEWRITER INTERFACES
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
 * Currently identical to base ChatStreamResponse but reserved for future Socket.IO-specific properties
 */
export type ChatSocketStreamResponse = ChatStreamResponse;

// ============================================================================
// CHAT-SPECIFIC SOCKET EVENTS
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
 * Type helper for chat socket event data
 */
export type ChatSocketEventData<T extends keyof SocketEvents> = Parameters<SocketEvents[T]>[0];