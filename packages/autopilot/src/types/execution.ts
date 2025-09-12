/**
 * Execution Types
 *
 * Types related to workflow execution runtime state and context
 */

export type ExecutionState = Record<string, unknown>;

/**
 * Workflow execution
 *
 * This interface is serializable and contains no callback functions.
 * Streaming is handled by the Engine's injected StreamingEmitter.
 */
export interface Execution {
  currentNodeRef?: string;
  status: ExecutionStatus;
  state: ExecutionState;
  results: Map<string, NodeResult>;
  error?: ExecutionError;
}

/**
 * Result of executing a workflow node
 */
export interface NodeResult {
  nodeRef: string;
  data?: unknown;
  error?: string;
  nextEdgeCondition?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Workflow execution status
 */
export type ExecutionStatus = 'not_started' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';

/**
 * Workflow execution error
 */
export interface ExecutionError {
  code: WorkflowErrorCode;
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
export type WorkflowErrorCode =
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
