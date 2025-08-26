/**
 * Sibil Contract Types
 * 
 * Interface definitions for Sibil AI assistant communication.
 */

import type { UsageStats } from './chat';
import type { ConnectionStatus } from './socket';

// ============================================================================
// SIBIL CORE INTERFACES
// ============================================================================

/**
 * Content block for structured Sibil responses
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

// ============================================================================
// STREAMING INTERFACES
// ============================================================================

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

// ============================================================================
// SOCKET.IO INTERFACES
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
  typewriter?: any; // Client-side typewriter functionality
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

// ============================================================================
// AGENT CHAT INTERFACES
// ============================================================================

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
  typewriter?: any; // Client-side typewriter functionality
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
// LEGACY SOCKET EVENTS (For backward compatibility)
// ============================================================================

/**
 * Legacy Socket.IO event definitions for non-expedition events
 */
export interface LegacySocketIOEvents {
  // Sibil Client to Server events
  'sibil:start-stream': (request: SibilSocketRequest) => void;
  'sibil:stop-stream': (streamId: string) => void;
  'sibil:join-room': (userId: string) => void;
  'sibil:leave-room': (userId: string) => void;

  // Sibil Server to Client events
  'sibil:stream-start': (streamId: string) => void;
  'sibil:stream-chunk': (chunk: SibilSocketStreamChunk) => void;
  'sibil:stream-complete': (response: SibilResponse) => void;
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

  // Common events
  'connection-status': (status: ConnectionStatus) => void;
}