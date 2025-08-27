/**
 * Chat Domain Types
 *
 * Core chat system types and domain-specific interfaces.
 * Simplified and consolidated for better maintainability.
 */

// Import pure socket infrastructure types
import type {
  TypewriterData,
  BaseSocketEvents,
  ConnectionStatusEvent,
} from '../contracts/socket';

// ============================================================================
// CORE TYPES
// ============================================================================

/**
 * LLM usage statistics
 */
export interface UsageStats {
  prompt_tokens: number;
  completion_tokens: number;
}

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

/**
 * Chat source type - distinguishes between different chat systems
 */
export type ChatSourceType = 'sibil' | 'agent';

// ============================================================================
// MEMORY TYPES
// ============================================================================

/**
 * Memory entry for conversation history with optional enhancement metadata
 */
export interface MemoryEntry {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: number;
  // Enhancement fields (previously in EnhancedMemoryEntry)
  importance?: number;
  summary?: string;
}

/**
 * Memory search result
 */
export interface MemorySearchResult {
  entries: MemoryEntry[];
  relevanceScores: number[];
}

// ============================================================================
// CHAT REQUEST/RESPONSE TYPES
// ============================================================================

/**
 * Unified chat request (works for both REST API and Socket.IO)
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
  
  // Streaming control
  stream?: boolean;
  
  // Socket.IO specific fields (optional for REST API)
  stream_id?: string;
  typewriter_enabled?: boolean;
  typing_speed?: number; // characters per second (default: 75)
}

/**
 * Unified chat response (works for both REST API and Socket.IO)
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
  
  // Socket.IO specific fields (optional for REST API)
  stream_id?: string;
}

/**
 * Unified streaming chunk (works for both REST API and Socket.IO)
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
  
  // Socket.IO specific fields (optional for REST API)
  stream_id?: string;
  timestamp?: number;
  typewriter?: TypewriterData;
  typing_speed?: number;
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
  source: ChatSourceType;
  created_by: string;
  created_at: string;
  last_activity_at: string;
  total_tokens: number;
  
  // Session metadata (via relationships)
  starship_id?: string;
  agent_id?: string;
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
// ERROR HANDLING
// ============================================================================

/**
 * Stream error interface
 */
export interface ChatStreamError {
  source: ChatSourceType;
  stream_id?: string;
  agent_id?: string;
  error_code: string;
  message: string;
  timestamp: number;
  recoverable: boolean;
}

// ============================================================================
// SOCKET EVENT DEFINITIONS
// ============================================================================

/**
 * Unified Chat Socket.IO events
 */
export interface ChatSocketEvents {
  // Connection events
  'connection-status': (event: ConnectionStatusEvent) => void;
  'ping': () => void;
  'pong': () => void;

  // Chat Client to Server events
  'chat:start-stream': (request: ChatRequest) => void;
  'chat:stop-stream': (streamId: string) => void;
  'chat:join-room': (data: { userId: string; agentId?: string; source: ChatSourceType }) => void;
  'chat:leave-room': (data: { userId: string; agentId?: string; source: ChatSourceType }) => void;

  // Chat Server to Client events
  'chat:stream-start': (data: { streamId: string; source: ChatSourceType; agentId?: string }) => void;
  'chat:stream-chunk': (chunk: ChatStreamChunk) => void;
  'chat:stream-complete': (response: ChatResponse) => void;
  'chat:stream-error': (error: ChatStreamError) => void;
  'chat:typing-start': (data: { source: ChatSourceType; agentId?: string }) => void;
  'chat:typing-stop': (data: { source: ChatSourceType; agentId?: string }) => void;
}

/**
 * Combined socket events interface
 */
export interface SocketEvents extends BaseSocketEvents, ChatSocketEvents {}

// ============================================================================
// TYPE ALIASES
// ============================================================================

/**
 * Session key for memory management
 */
export type SessionKey = string;

/**
 * Type helper for chat socket event data
 */
export type ChatSocketEventData<T extends keyof SocketEvents> = Parameters<SocketEvents[T]>[0];