/**
 * Minimal Streaming Emitter Interface
 *
 * Provides a lean interface for external streaming implementations (like server)
 * to handle autopilot execution events without autopilot knowing about specific
 * streaming formats.
 */

import { Execution } from './execution';

export interface LLMEvent {
  type: 'content_chunk' | 'content_complete';
  timestamp: string;
  data?: {
    chunk?: Record<string, unknown>;
  };
}

export interface ToolEvent {
  type: 'tool_started' | 'tool_complete';
  timestamp: string;
  data?: {
    toolName?: string;
    toolCallId?: string;
    arguments?: Record<string, unknown>;
    result?: Record<string, unknown>;
    error?: string;
  };
}

export type ExecutionEventType =
  | 'workflow_started'
  | 'node_started'
  | 'node_completed'
  | 'node_failed'
  | 'workflow_paused'
  | 'workflow_resumed'
  | 'workflow_completed'
  | 'workflow_failed';

/**
 * Events that can be emitted during workflow execution
 */
export interface ExecutionEvent {
  type: ExecutionEventType;
  timestamp: string;
  data?: {
    execution: Execution;
  };
}

export type AutopilotEvent = ExecutionEvent | LLMEvent | ToolEvent;

export interface EventCallback {
  (event: AutopilotEvent): Promise<void>;
}
