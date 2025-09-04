/**
 * Database Edge Types
 *
 * Database-specific edge interfaces and API contract types.
 * Imports edge types from @starships/autopilot to avoid duplication.
 */

// Import autopilot types at the top level
import type { Edge } from '@starships/autopilot';

// ============================================================================
// DATABASE EDGE INTERFACE
// ============================================================================

/**
 * Database Edge interface - core API contract type
 * Extends Edge to be a superset with additional database/workflow fields
 */
export interface EdgeModel extends Edge {
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
// EDGE REQUEST/RESPONSE TYPES
// ============================================================================

/**
 * Request to create a new edge
 */
export interface CreateEdgeRequest {
  from: string;
  to: string;
  ref?: string;
  workflowId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Request to update an edge
 */
export type UpdateEdgeRequest = Partial<CreateEdgeRequest>;

// ============================================================================
// EDGE COLLECTION-SPECIFIC TYPES
// ============================================================================

/**
 * Edge database response with pagination
 */
export interface EdgeListResponse {
  edges: EdgeModel[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * Edge response with single edge
 */
export interface EdgeResponse {
  edge: EdgeModel;
}

/**
 * Request to search edges
 */
export interface SearchEdgesRequest {
  query: string;
  from?: string;
  to?: string;
  workflowId?: string;
  limit?: number;
  offset?: number;
}

/**
 * Response for search edges
 */
export interface SearchEdgesResponse {
  edges: EdgeModel[];
  total: number;
  searchQuery: string;
}

/**
 * Request to filter edges
 */
export interface EdgeFilters {
  from?: string;
  to?: string;
  workflowId?: string;
}
