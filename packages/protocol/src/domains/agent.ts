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
  // Versioning fields
  version: string; // Semantic version (e.g., '1.0.2')
  templateSnapshotAt?: string; // When agent last synced with template
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
  // Versioning fields
  version?: string;
  templateSnapshotAt?: string;
};

/**
 * Request to update an agent
 */
export interface UpdateAgentRequest extends Partial<AgentParamsWithoutMetadata> {
  templateId?: string;
  previewPrompts?: string[];
  version?: string;
  templateSnapshotAt?: string;
}

/**
 * Response type for update check
 */
export interface AgentUpdateCheckResponse {
  needsUpdate: boolean;
  currentVersion: string; // Agent's current version
  latestVersion: string; // Template's latest version
  templateUpdatedAt?: string;
}

/**
 * Response type for update from template (minimal response)
 */
export interface AgentUpdateResponse {
  id: string;
  name: string;
  version: string;
  templateSnapshotAt?: string;
  updatedAt: string;
  message: string;
}
