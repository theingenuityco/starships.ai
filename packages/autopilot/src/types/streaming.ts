/**
 * Streaming Types
 *
 * Types for streaming support in autopilot package, designed to integrate
 * with the server's StreamingService using Server-Sent Events (SSE)
 */

/**
 * Stream chunk types that align with server StreamingService
 */
export type StreamChunkType =
  | 'content' // LLM content generation
  | 'thinking' // Agent reasoning/planning
  | 'node_start' // Workflow node execution start
  | 'node_complete' // Workflow node execution complete
  | 'error' // Error during execution
  | 'complete'; // Full execution complete

/**
 * Stream chunk metadata
 */
export interface StreamChunkMetadata {
  nodeRef?: string;
  tokenCount?: number;
  model?: string;
  processingTimeMs?: number;
  [key: string]: unknown;
}

/**
 * Stream chunk from autopilot execution
 */
export interface AutopilotStreamChunk {
  type: StreamChunkType;
  content: string;
  metadata?: StreamChunkMetadata;
}

/**
 * Stream configuration options
 */
export interface StreamingOptions {
  enabled: boolean;
  streamId?: string;
  conversationId?: string;
  agentId?: string;
}

/**
 * Streaming callback function type
 */
export type StreamingCallback = (chunk: AutopilotStreamChunk) => Promise<void> | void;

/**
 * Streaming error information
 */
export interface StreamingError {
  code: string;
  message: string;
  recoverable: boolean;
  context?: Record<string, unknown>;
}

/**
 * LLM streaming response chunk
 */
export interface LLMStreamChunk {
  content: string;
  delta?: string;
  finishReason?: 'stop' | 'length' | 'content_filter' | null;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

/**
 * Extended execution event for streaming
 */
export interface StreamingExecutionEvent {
  type: 'stream_chunk' | 'stream_complete' | 'stream_error';
  chunk?: AutopilotStreamChunk;
  error?: StreamingError;
  timestamp: string;
}

/**
 * Streaming configuration for different components
 */
export interface ComponentStreamingConfig {
  llm?: {
    enabled: boolean;
    chunkSize?: number;
    bufferTimeout?: number;
  };
  agent?: {
    enabled: boolean;
    includeThinking?: boolean;
    includeNodeEvents?: boolean;
  };
  workflow?: {
    enabled: boolean;
    nodeEvents?: boolean;
    progressUpdates?: boolean;
  };
}
