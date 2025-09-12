/**
 * Minimal Streaming Emitter Interface
 *
 * Provides a lean interface for external streaming implementations (like server)
 * to handle autopilot execution events without autopilot knowing about specific
 * streaming formats.
 */

import { Execution } from './execution';

/**
 * Events that can be emitted during workflow execution
 */
export interface ExecutionEvent {
  type:
    | 'workflow_started'
    | 'node_started'
    | 'node_completed'
    | 'node_failed'
    | 'workflow_paused'
    | 'workflow_resumed'
    | 'workflow_completed'
    | 'workflow_failed'
    | 'content_chunk'
    | 'content_complete';
  execution: Execution;
  timestamp: string;
  content?: string; // For streaming content chunks
  contentMetadata?: {
    accumulated?: string;
    isComplete?: boolean;
    nodeRef?: string;
    model?: string;
  };
}

/**
 * Interface for external streaming implementations
 */
export interface EngineEmitter {
  /**
   * Handle execution event from autopilot engine
   */
  emitExecutionEvent(event: ExecutionEvent): Promise<void>;

  /**
   * Check if streaming is currently enabled
   */
  isEnabled(): boolean;
}
