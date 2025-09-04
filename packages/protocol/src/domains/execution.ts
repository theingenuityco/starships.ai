/**
 * Database Execution Types
 *
 * Database-specific execution interfaces and API contract types.
 * Imports execution types from @starships/autopilot to avoid duplication.
 */

// Import autopilot types at the top level
import type { Execution, NodeResult, ExecutionStatus } from '@starships/autopilot';

// ============================================================================
// DATABASE EXECUTION INTERFACE
// ============================================================================

/**
 * Database Execution interface - core API contract type
 * Extends Execution to be a superset with additional database fields
 */
export interface ExecutionModel extends Execution {
  // Core database fields
  id: string;
  workflowId: string;
  createdAt: string;
  updatedAt: string;

  // Additional runtime tracking
  startTime?: string;
  endTime?: string;
  pausedAt?: string;
}

// ============================================================================
// EXECUTION ERROR TYPES (defined locally since not exported from autopilot)
// ============================================================================

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

// ============================================================================
// EXECUTION REQUEST/RESPONSE TYPES
// ============================================================================

/**
 * Request to create execution
 */
export interface CreateExecutionRequest {
  workflowId: string;
  currentNodeRef?: string;
  status?: ExecutionStatus;
  executionResults?: Map<string, NodeResult>;
  error?: ExecutionError;
  startTime?: string;
  endTime?: string;
  pausedAt?: string;
}

/**
 * Request to update execution
 */
export type UpdateExecutionRequest = Partial<CreateExecutionRequest>;

/**
 * Execution response with single execution
 */
export interface ExecutionResponse {
  execution: ExecutionModel;
}

/**
 * Execution list response with pagination
 */
export interface ExecutionListResponse {
  executions: ExecutionModel[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ============================================================================
// EXECUTION ANALYTICS TYPES
// ============================================================================

/**
 * Execution usage statistics
 */
export interface ExecutionUsageStats {
  workflowId: string;
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  averageExecutionTime: number;
  lastExecutedAt: string | null;
}

/**
 * Execution performance analytics
 */
export interface ExecutionAnalytics {
  workflowId: string;
  totalExecutions: number;
  successRate: number;
  averageExecutionTime: number;
  nodePerformance: Record<
    string,
    {
      executions: number;
      successRate: number;
      averageTime: number;
    }
  >;
  last30DaysUsage: number;
}
