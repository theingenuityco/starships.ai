/**
 * Sibil Contract Types
 * 
 * Interface definitions for Sibil AI assistant communication.
 */

import type { UsageStats } from './chat';

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

/**
 * Sibil stream completion response - extends SibilResponse with stream info
 */
export interface SibilStreamCompleteResponse extends SibilResponse {
  stream_id?: string;
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
