/**
 * Streaming Event Contracts
 *
 * Ultra-simplified streaming using DeltaChunk (RFC6902 JSON Patch) directly.
 * No wrappers - just pure delta operations streamed as-is.
 */

/**
 * DeltaChunk - Pure RFC6902 JSON Patch Operation for streaming
 * This is sent directly as SSE data - no wrapper, no metadata
 */
export interface StreamingDeltaChunk {
  op: 'add' | 'remove' | 'replace' | 'move' | 'copy' | 'test';
  path: string;
  value?: unknown;
  from?: string;
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
 * Union type of all possible streaming events
 */
export type StreamingEvent =
  | { type: 'connection'; data: StreamingConnection }
  | { type: 'heartbeat'; data: StreamingHeartbeat }
  | { type: 'delta'; data: StreamingDeltaChunk }
  | { type: 'complete'; data: void }
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
  error: StreamingError | null;
  isStreaming: boolean;
  version: number;
}

/**
 * SSE event types
 */
export type SSEEventType = 'connection' | 'heartbeat' | 'delta' | 'complete' | 'error';
