/**
 * Database Agent Types
 *
 * Database-specific agent interfaces and API contract types.
 * Imports workflow and memory types from @starships/autopilot to avoid duplication.
 */

// Import autopilot types at the top level
import type { AgentParams } from '@starships/autopilot';

// ============================================================================
// DATABASE AGENT INTERFACE
// ============================================================================

/**
 * Database Agent interface - core API contract type
 * Extends AgentParams to be a superset with additional database/marketplace fields
 */

export type AgentParamsWithoutMetadata = Omit<AgentParams, 'metadata' | 'tools'>;

export interface AgentModel extends AgentParamsWithoutMetadata {
  // Core database fields
  id: string;
  createdAt: string;
  updatedAt: string;

  // Tool assignment - reference by slugs instead of embedding
  assignedToolSlugs?: string[];
}

// ============================================================================
// AGENT REQUEST/RESPONSE TYPES
// ============================================================================

/**
 * Request to create a new agent
 */
export type CreateAgentRequest = AgentParamsWithoutMetadata & {
  assignedToolSlugs?: string[];
};

/**
 * Request to update an agent
 */
export type UpdateAgentRequest = Partial<
  AgentParamsWithoutMetadata & {
    assignedToolSlugs?: string[];
  }
>;
