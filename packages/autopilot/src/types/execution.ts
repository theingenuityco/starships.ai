/**
 * Execution Types
 *
 * Types related to workflow execution runtime state and context
 */

export type ExecutionState = Record<string, unknown>;

/**
 * Engine execution status
 */
export type ExecutionStatus = 'not_started' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';

/**
 * Execution item representing a single data unit flowing through the workflow
 */
export interface ExecutionItem {
  json: unknown; // The actual data
  binary?: Record<string, unknown>; // File attachments (for future use)
  pairedItem?: { item: number }; // Source tracking for debugging
  error?: string; // Item-level error handling
}

/**
 * Engine execution
 *
 * This interface is serializable and contains no callback functions.
 * Streaming is handled by the Engine's injected StreamingEmitter.
 */
export interface Execution {
  currentNodeRef?: string;
  currentNodeInputRef?: string; // Which node's output should be used as input for current node
  status: ExecutionStatus;
  state: ExecutionState;
  results: Array<{ nodeRef: string; items: ExecutionItem[] }>; // Chronological execution results
  visitCounts?: Record<string, number>; // Track node visit counts for cycle support
  error?: ExecutionError;
}

/**
 * Workflow execution error
 */
export interface ExecutionError {
  code: ExecutionErrorCode;
  message: string;
  nodeRef?: string;
  details?: unknown;
  timestamp: string;
  recoverable: boolean;
  retryCount?: number;
}

/**
 * Workflow error codes
 */
export type ExecutionErrorCode =
  | 'NODE_EXECUTION_FAILED'
  | 'TIMEOUT_EXCEEDED'
  | 'USER_INPUT_TIMEOUT'
  | 'INVALID_CONDITION_RESULT'
  | 'AGENT_UNAVAILABLE'
  | 'RESOURCE_EXHAUSTED'
  | 'PERMISSION_DENIED'
  | 'WORKFLOW_CANCELLED'
  | 'SYSTEM_ERROR'
  | 'VALIDATION_FAILED'
  | 'JSONATA_ERROR';
