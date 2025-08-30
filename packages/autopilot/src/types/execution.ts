/**
 * Execution Types
 * 
 * Types related to workflow execution runtime state and context
 */

/**
 * Runtime state of workflow execution
 */
export interface RuntimeState {
  currentNodeRef?: string;
  status: ExecutionStatus;
  executionResults: Map<string, NodeResult>;
  error?: ExecutionError;
}

/**
 * Result of executing a workflow node
 */
export interface NodeResult {
  nodeRef: string;
  success: boolean;
  data?: unknown;
  error?: string;
  executedAt: string;
  duration?: number;
  nextEdgeCondition?: string;
  metadata?: Record<string, unknown>;
}


/**
 * Workflow execution status
 */
export type ExecutionStatus = 
  | 'not_started'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled';

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