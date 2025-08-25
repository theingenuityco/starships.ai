// ============================================================================
// MAIN PROTOCOL EXPORTS
// ============================================================================

// Export contract types (API boundaries)
export * from './contracts/agent';
export * from './contracts/chat';
export * from './contracts/llm';

// Export domain types (business entities)
export * from './domain/mission';
export * from './domain/starship';

// Import types for remaining definitions
import type { UsageStats } from './contracts/chat';

// Sibil-specific interfaces
export interface ContentBlock {
  type: 'text' | 'markdown' | 'code' | 'table';
  content: string;
  metadata?: {
    language?: string;
    headers?: string[];
  };
}

export interface SibilRequest {
  provider: 'openai' | 'anthropic';
  model?: string;
  message: string;
  user_id: string;
  session_id?: string;
  starship_id?: string;
}

export interface SibilResponse {
  content: string;
  structured_content?: ContentBlock[];
  provider: 'openai' | 'anthropic';
  model: string;
  usage?: UsageStats;
}

// Streaming interfaces for Sibil
export interface SibilStreamRequest extends SibilRequest {
  stream: true;
}

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

export interface SibilStreamResponse {
  stream_id: string;
  status: 'started' | 'streaming' | 'completed' | 'error';
}

// Legacy Socket.IO Event Definitions for non-expedition events
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

// Enhanced request for Socket.IO
export interface SibilSocketRequest extends SibilRequest {
  stream_id: string;
  typewriter_enabled?: boolean;
  typing_speed?: number; // characters per second (default: 75)
}

// Typewriter-specific types
export interface TypewriterChunk {
  type: 'character' | 'word' | 'line' | 'complete';
  content: string;
  position: number;
  total_length?: number;
  delay?: number; // milliseconds
  is_code?: boolean;
  is_markdown?: boolean;
}

// Enhanced streaming chunk for Socket.IO
export interface SibilSocketStreamChunk extends SibilStreamChunk {
  stream_id: string;
  typewriter?: TypewriterChunk;
  typing_speed?: number;
  timestamp: number;
}

// Connection and error types
export type ConnectionStatus = 'connected' | 'disconnected' | 'reconnecting' | 'error';

export interface SibilStreamError {
  stream_id?: string;
  error_code: string;
  message: string;
  timestamp: number;
  recoverable: boolean;
}

// Socket.IO client state
export interface SocketConnectionState {
  connected: boolean;
  authenticated: boolean;
  room_joined: boolean;
  user_id?: string;
  connection_id?: string;
  last_ping?: number;
}

// Agent Chat Socket.IO Interfaces
export interface AgentSocketRequest {
  agent_id: string;
  session_id: string;
  message: string;
  stream_id: string;
  typewriter_enabled?: boolean;
  typing_speed?: number; // characters per second (default: 75)
  user_id: string; // From auth context
}

export interface AgentSocketStreamChunk {
  stream_id: string;
  agent_id: string;
  type: 'content' | 'complete' | 'error';
  content?: string;
  typewriter?: TypewriterChunk;
  timestamp: number;
}

export interface AgentChatResponse {
  content: string;
  agent_id: string;
  session_id: string;
  timestamp: string;
  usage?: UsageStats;
}

export interface AgentStreamError {
  stream_id?: string;
  agent_id?: string;
  error_code: string;
  message: string;
  timestamp: number;
  recoverable: boolean;
}

// Legacy exports - these will be removed after migration completes
// export * from './types/starship';
// export * from './types/mission';
// export * from './constants/mission-phases';

// Export workflow DSL types
export * from './types/workflow';

// Export agent communication types
export * from './types/agent-communication';

// Export enhanced Socket.IO event types
export * from './types/socket-events';

// Export vision refinement types
export * from './types/vision-refinement';

// Export standardized error handling types and classes
export * from './types/errors';

// Export error classes with explicit naming to avoid conflicts
export {
  StandardError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  DatabaseError,
  NetworkError,
  BusinessLogicError,
  ErrorFactory,
  isStandardError
} from './types/error-classes';


// Re-export specific types to avoid conflicts
export type {
  EnhancedSocketIOEvents,
  EventEmissionOptions,
  EventEmissionResult,
} from './types/socket-events';
