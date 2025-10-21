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
  slug: string;
  createdAt: string;
  updatedAt: string;
  // Starship ownership (FK)
  starshipId: string;
  // Optional source template reference (FK)
  templateId?: string;
  // Optional example prompts surfaced on agents (may be inherited from template)
  previewPrompts?: string[];
}

// ============================================================================
// AGENT REQUEST/RESPONSE TYPES
// ============================================================================

/**
 * Request to create a new agent
 */
export type CreateAgentRequest = AgentParamsWithoutMetadata & {
  slug?: string; // Optional: if not provided, will be generated
  assignedToolSlugs?: string[]; // Temporary: used during creation to establish relationships
  // Optional template reference and prompts
  templateId?: string;
  previewPrompts?: string[];
};

/**
 * Request to update an agent
 */
export interface UpdateAgentRequest extends Partial<AgentParamsWithoutMetadata> {
  templateId?: string;
  previewPrompts?: string[];
}
