/**
 * Database Workflow Types
 *
 * Database-specific workflow interfaces and API contract types.
 * Imports workflow types from @starships/autopilot to avoid duplication.
 */

import type { Blueprint, WorkflowNodeParameters } from '@starships/autopilot';

// ============================================================================
// CORE WORKFLOW MODEL TYPES (following Agent pattern)
// ============================================================================

/**
 * Database Workflow interface - core API contract type
 * Extends WorkflowNodeParameters to be a superset with additional database/marketplace fields
 */
export interface WorkflowModel extends WorkflowNodeParameters {
  // Core database fields
  id: string;
  createdAt: string;
  updatedAt: string;

  // Ownership and deployment
  authorId: string;
  starshipId?: string;

  // Marketplace fields
  isPublic: boolean;
  category: string;
  tags: string[];
  version: string;
  usageCount: number;
  rating?: number;

  // Execution settings
  executionMode: 'simple' | 'workflow';
  allowedStarshipClasses?: string[];
}

/**
 * Create workflow request
 */
export interface CreateWorkflowRequest {
  name: string;
  description?: string;
  category: WorkflowModel['category'];
  starshipId?: string;
  isPublic?: boolean;
  tags?: string[];
  executionMode?: 'simple' | 'workflow';

  // Core WorkflowNodeParameters fields
  blueprint?: Blueprint;
  timeout?: number;
}

/**
 * Update workflow request
 */
export interface UpdateWorkflowRequest extends Partial<CreateWorkflowRequest> {
  version?: string;
}

// ============================================================================
// API RESPONSE TYPES
// ============================================================================

/**
 * Workflow database response with pagination
 */
export interface WorkflowListResponse {
  workflows: WorkflowModel[];
  total: number;
  page?: number;
  limit?: number;
}

/**
 * Workflow response with single workflow
 */
export interface WorkflowResponse {
  workflow: WorkflowModel;
}

/**
 * Search workflows request
 */
export interface SearchWorkflowsRequest {
  query: string;
  category?: string;
  tags?: string[];
  limit?: number;
  offset?: number;
}

/**
 * Search workflows response
 */
export interface SearchWorkflowsResponse {
  workflows: WorkflowModel[];
  total: number;
}

/**
 * Workflow filters for querying
 */
export interface WorkflowFilters {
  category?: string;
  authorId?: string;
  starshipId?: string;
  isPublic?: boolean;
  tags?: string[];
}

/**
 * Workflow deployment request
 */
export interface DeployWorkflowRequest {
  workflowId: string;
  starshipId: string;
}

/**
 * Workflow deployment response
 */
export interface DeployWorkflowResponse {
  success: boolean;
  message?: string;
  deployedAt?: string;
}

/**
 * Workflow execution request
 */
export interface ExecuteWorkflowRequest {
  workflowId: string;
  initialData?: Record<string, unknown>;
  timeout?: number;
}

/**
 * Workflow usage statistics
 */
export interface WorkflowUsageStats {
  workflowId: string;
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  averageExecutionTime: number;
}

/**
 * Workflow performance analytics
 */
export interface WorkflowAnalytics {
  workflowId: string;
  usageStats: WorkflowUsageStats;
  popularityScore: number;
  lastExecuted?: string;
}
