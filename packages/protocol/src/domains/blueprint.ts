/**
 * Database Blueprint Types
 *
 * Database-specific blueprint interfaces and API contract types.
 * Imports blueprint types from @starships/autopilot to avoid duplication.
 */

// Import autopilot types at the top level
import type {
  Blueprint
} from '@starships/autopilot';

// ============================================================================
// DATABASE BLUEPRINT INTERFACE
// ============================================================================

/**
 * Database Blueprint interface - core API contract type
 * Extends Blueprint to be a superset with additional database/workflow fields
 */
export interface BlueprintModel extends Blueprint {
  // Core database fields
  id: string;
  createdAt?: string;
  updatedAt?: string;
  
  // Template/workflow context fields
  name?: string;
  description?: string;
  category?: string;
  
  // Usage tracking
  usageCount?: number;
  
  // Additional metadata for database storage
  metadata?: Record<string, unknown>;
}

// ============================================================================
// BLUEPRINT REQUEST/RESPONSE TYPES
// ============================================================================

/**
 * Request to create a new blueprint
 */
export interface CreateBlueprintRequest {
  name: string;
  description?: string;
  category?: string;
  nodes: Blueprint['nodes'];
  edges: Blueprint['edges'];
  metadata?: Blueprint['metadata'];
}

/**
 * Request to update a blueprint
 */
export interface UpdateBlueprintRequest extends Partial<CreateBlueprintRequest> {
  usageCount?: number;
}

// ============================================================================
// BLUEPRINT COLLECTION-SPECIFIC TYPES
// ============================================================================

/**
 * Blueprint database response with pagination
 */
export interface BlueprintListResponse {
  blueprints: BlueprintModel[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * Blueprint response with single blueprint
 */
export interface BlueprintResponse {
  blueprint: BlueprintModel;
}

/**
 * Request to search blueprints
 */
export interface SearchBlueprintsRequest {
  query: string;
  category?: string;
  limit?: number;
  offset?: number;
}

/**
 * Response for search blueprints
 */
export interface SearchBlueprintsResponse {
  blueprints: BlueprintModel[];
  total: number;
  searchQuery: string;
}

/**
 * Request to filter blueprints
 */
export interface BlueprintFilters {
  category?: string;
  name?: string;
}

/**
 * Blueprint usage statistics
 */
export interface BlueprintUsageStats {
  blueprintId: string;
  totalUsage: number;
  last30Days: number;
  lastUsedAt: string | null;
}