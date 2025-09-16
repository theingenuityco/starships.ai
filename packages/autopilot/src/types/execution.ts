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
 * Engine execution
 *
 * This interface is serializable and contains no callback functions.
 * Streaming is handled by the Engine's injected StreamingEmitter.
 */
export interface Execution {
  currentNodeRef?: string;
  status: ExecutionStatus;
  state: ExecutionState;
  nodeOutputs: Record<string, unknown>;
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
