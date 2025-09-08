/**
 * Streaming Event Contracts
 *
 * Shared streaming event definitions between client and server
 * for real-time conversation streaming via Server-Sent Events (SSE).
 */

import type { ConversationResponse } from '../domains/conversation';

/**
 * Real-time streaming chunk sent via SSE during conversation processing
 */
export interface StreamingChunk {
  id: string;
  streamId: string;
  conversationId: string;
  agentId: string;
  type: 'content' | 'thinking' | 'node_start' | 'node_complete' | 'error' | 'complete';
  content: string;
  timestamp: string;
  metadata?: {
    nodeRef?: string;
    tokenCount?: number;
    model?: string;
    processingTimeMs?: number;
    eventType?: string;
    status?: string;
    errorCode?: string;
    [key: string]: unknown;
  };
}

/**
 * Streaming error event sent via SSE when processing fails
 */
export interface StreamingError {
  streamId: string;
  errorCode: string;
  message: string;
  timestamp: string;
  recoverable: boolean;
  context?: Record<string, unknown>;
}

/**
 * Final streaming response sent when conversation processing completes
 */
export interface StreamingResponse extends ConversationResponse {
  streamId: string;
  processingTimeMs?: number;
}

/**
 * SSE connection confirmation event
 */
export interface StreamingConnection {
  streamId: string;
  status: 'connected' | 'disconnected';
  timestamp: string;
}

/**
 * SSE heartbeat event to keep connection alive
 */
export interface StreamingHeartbeat {
  timestamp: string;
}

/**
 * Streaming request parameters
 */
export interface StreamingRequest {
  conversationId: string;
  agentId: string;
  message: string;
  stream: boolean;
  streamId?: string;
}

/**
 * Union type of all possible streaming events
 */
export type StreamingEvent =
  | { type: 'connection'; data: StreamingConnection }
  | { type: 'heartbeat'; data: StreamingHeartbeat }
  | { type: 'chunk'; data: StreamingChunk }
  | { type: 'complete'; data: StreamingResponse }
  | { type: 'error'; data: StreamingError };

/**
 * Streaming status types for UI state management
 */
export type StreamingStatus = 'idle' | 'connecting' | 'streaming' | 'complete' | 'error';

/**
 * Client-side streaming state
 */
export interface StreamingState {
  status: StreamingStatus;
  streamId: string | null;
  content: string;
  error: StreamingError | null;
  isStreaming: boolean;
}

/**
 * Streaming chunk type mappings for event handling
 */
export type StreamingChunkType = 'content' | 'thinking' | 'node_start' | 'node_complete' | 'error' | 'complete';

/**
 * SSE event types
 */
export type SSEEventType = 'connection' | 'heartbeat' | 'chunk' | 'complete' | 'error';
