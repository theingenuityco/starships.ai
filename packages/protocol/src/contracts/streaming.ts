/**
 * Streaming Event Contracts
 *
 * Using fast-json-patch Operation type for RFC6902 JSON Patch operations.
 * Clean implementation without custom wrappers.
 */

import { Operation } from 'fast-json-patch';
import type { MessageModel } from '../domains/message';

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
 * UI action payload for out-of-band UI instructions over SSE
 */
export interface UIActionPayload {
  __ui_action: 'open_tool_form' | 'update_tool_form' | 'submit_tool_form' | 'close_tool_form';
  formData?: Record<string, unknown>;
  patch?: Record<string, unknown>;
  data?: Record<string, unknown>;
}

/**
 * Union type of all possible streaming events
 */
export type StreamingEvent =
  | { type: 'connection'; data: StreamingConnection }
  | { type: 'heartbeat'; data: StreamingHeartbeat }
  | { type: 'delta'; data: Operation }
  | { type: 'message'; data: MessageModel }
  | { type: 'ui_action'; data: UIActionPayload }
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
export type SSEEventType = 'connection' | 'heartbeat' | 'delta' | 'message' | 'ui_action' | 'complete' | 'error';
