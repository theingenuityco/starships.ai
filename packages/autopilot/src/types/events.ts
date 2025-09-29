/**
 * Minimal Streaming Emitter Interface
 *
 * Provides a lean interface for external streaming implementations (like server)
 * to handle autopilot execution events without autopilot knowing about specific
 * streaming formats.
 */

import { Execution } from './execution';
import type { LLMUsage } from './llm';

export interface BaseEvent {
  timestamp: string;
  executionDepth: number;
}

export interface LLMEvent extends BaseEvent {
  type: 'content_chunk' | 'content_complete';
  data?: {
    chunk?: Record<string, unknown>;
    /** Model identifier (if available from headers) */
    model?: string;
    /**
     * Provider-reported usage/cost metadata, emitted on content_complete.
     * Uses OpenRouter/OpenAI-style snake_case for token fields to match upstream payloads.
     */
    usage?: Partial<LLMUsage>;
  };
}

export interface ToolEvent extends BaseEvent {
  type: 'tool_started' | 'tool_complete';
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
export interface ExecutionEvent extends BaseEvent {
  type: ExecutionEventType;
  data?: {
    execution: Execution;
  };
}

export type AutopilotEvent = ExecutionEvent | LLMEvent | ToolEvent;

export interface EventCallback {
  (event: AutopilotEvent): Promise<void>;
}
