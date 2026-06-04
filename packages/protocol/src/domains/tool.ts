/**
 * Database Tool Types
 *
 * Database-specific tool interfaces and API contract types.
 * Builds upon ToolParams from @starships/autopilot for tool definitions.
 */

import type { ToolParams } from './llm';
import type { Blueprint, TransformOperation } from './workflow';

// ============================================================================
// TOOL TYPES (Deployed Instances)
// ============================================================================

/**
 * Tool status type
 */
export type ToolStatus = 'draft' | 'active';

/**
 * Database Tool interface - user's configured tool instances
 * For draft tools, parameters and blueprint are optional and can be completed later
 */
export interface ToolModel extends Omit<ToolParams, 'parameters'> {
  // Core database fields
  id: string;
  createdAt: string;
  updatedAt: string;

  // Foreign key relationships
  starshipId: string; // Tool belongs to a starship

  // ToolParams fields (made optional for draft support)
  parameters?: ToolParams['parameters'];

  // Inert legacy workflow fields (DAG engine removed; columns dropped separately).
  blueprint?: Blueprint;
  transforms?: TransformOperation[];
  mutations?: TransformOperation[];
  condition?: string;

  // User configuration
  configuration?: Record<string, unknown>; // API keys, custom parameters, etc.
  isEnabled?: boolean;
  status?: ToolStatus; // Tool status: 'draft' for incomplete tools, 'active' for ready tools

  // Versioning fields
  version: string; // Semantic version (e.g., '1.0.2')

  /** Connector providers used by this tool's blueprint (connector_action nodes) */
  requiredConnectorProviders?: string[];
}

// ============================================================================
// TOOL REQUEST/RESPONSE TYPES
// ============================================================================

/**
 * Request to create a new tool instance
 * For draft tools (status='draft'), only name and slug are required
 */
export interface CreateToolRequest extends Omit<ToolParams, 'slug' | 'parameters'> {
  parameters?: ToolParams['parameters']; // Optional for draft tools
  // Inert legacy workflow fields (DAG engine removed; columns dropped separately).
  blueprint?: Blueprint;
  transforms?: TransformOperation[];
  mutations?: TransformOperation[];
  condition?: string;
  configuration?: Record<string, unknown>;
  isEnabled?: boolean;
  status?: ToolStatus; // Tool status: 'draft' or 'active'
  version?: string; // Semantic version (defaults to '1.0.0' if not provided)
  /** Connector providers */
  requiredConnectorProviders?: string[];
}

/**
 * Request to update a tool instance
 */
export type UpdateToolRequest = Partial<Omit<CreateToolRequest, 'slug'>> & {
  /**
   * Slugs are immutable after creation.
   * Disallow providing `slug` in updates at the type level.
   */
  slug?: never;
  version?: string;
};

// ============================================================================
// SEARCH/FILTER TYPES
// ============================================================================

/**
 * Tool search/filter parameters
 */
export interface ToolSearchParams {
  isEnabled?: boolean;
  status?: ToolStatus;
  query?: string; // For text search across name/description
}
