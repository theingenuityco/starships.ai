/**
 * Database Node Types
 *
 * Database-specific node interfaces and API contract types.
 * Imports node types from @starships/autopilot to avoid duplication.
 */

// Import autopilot types at the top level
import type { Node } from '@starships/autopilot';

// ============================================================================
// DATABASE NODE INTERFACE
// ============================================================================

/**
 * Database Node interface - core API contract type
 * Extends Node to be a superset with additional database/workflow fields
 */
export interface NodeModel extends Node {
  // Core database fields
  id: string;
  createdAt?: string;
  updatedAt?: string;

  // Workflow context fields
  workflowId?: string;

  // Additional metadata for database storage
  metadata?: Record<string, unknown>;
}

// ============================================================================
// NODE REQUEST/RESPONSE TYPES
// ============================================================================

/**
 * Request to create a new node
 */
export interface CreateNodeRequest {
  type: string;
  name: string;
  description?: string;
  parameters: Record<string, unknown>;
  ref?: string;
  workflowId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Request to update a node
 */
export type UpdateNodeRequest = Partial<CreateNodeRequest>;

// ============================================================================
// NODE COLLECTION-SPECIFIC TYPES
// ============================================================================

/**
 * Node database response with pagination
 */
export interface NodeListResponse {
  nodes: NodeModel[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * Node response with single node
 */
export interface NodeResponse {
  node: NodeModel;
}

/**
 * Request to search nodes
 */
export interface SearchNodesRequest {
  query: string;
  type?: string;
  workflowId?: string;
  limit?: number;
  offset?: number;
}

/**
 * Response for search nodes
 */
export interface SearchNodesResponse {
  nodes: NodeModel[];
  total: number;
  searchQuery: string;
}

/**
 * Request to filter nodes
 */
export interface NodeFilters {
  type?: string;
  workflowId?: string;
  name?: string;
}
