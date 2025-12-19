/**
 * Database Tool Types
 *
 * Database-specific tool interfaces and API contract types.
 * Builds upon ToolParams from @starships/autopilot for tool definitions.
 *
 * Follows the Agent/AgentTemplate pattern:
 * - ToolTemplate: Reusable marketplace templates
 * - Tool: User's configured instances deployed to starships
 */

// Import autopilot types
import type { ToolParams } from '@starships/autopilot';

// ============================================================================
// TOOL TEMPLATE TYPES (Marketplace)
// ============================================================================

import type { TemplateCategory } from '../index';

/**
 * Tool template category options (using shared TemplateCategory)
 */
export type ToolTemplateCategory = TemplateCategory;

/**
 * Core tool template entity - marketplace/gallery items
 */
export interface ToolTemplateModel extends ToolParams {
  // Core template fields
  id: string;
  createdAt: string;
  updatedAt: string;

  // Template metadata
  category: ToolTemplateCategory;
  usageCount: number;

  // Versioning
  version: string; // Semantic version (e.g., '1.0.2')

  // Template preview
  exampleUsage?: string; // Example of how to use the tool

  // Configuration hints
  requiresApiKey?: boolean;
  configurationFields?: Array<{
    name: string;
    type: 'string' | 'number' | 'boolean';
    description: string;
    required: boolean;
  }>;
}

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
export interface ToolModel extends Omit<ToolParams, 'parameters' | 'blueprint'> {
  // Core database fields
  id: string;
  createdAt: string;
  updatedAt: string;

  // Foreign key relationships
  starshipId: string; // Tool belongs to a starship

  /** Template relationships (optional) */
  sourceTemplateId?: string;
  publishedTemplateId?: string;

  /**
   * Convenience fields populated by some listing endpoints.
   * These allow clients to reason about template-backed behavior without
   * additional round trips.
   */
  sourceTemplateSlug?: string;
  publishedTemplateSlug?: string;

  // ToolParams fields (made optional for draft support)
  parameters?: ToolParams['parameters'];
  blueprint?: ToolParams['blueprint'];

  // User configuration
  configuration?: Record<string, unknown>; // API keys, custom parameters, etc.
  isEnabled?: boolean;
  status?: ToolStatus; // Tool status: 'draft' for incomplete tools, 'active' for ready tools

  // Versioning fields
  version: string; // Semantic version (e.g., '1.0.2')
  templateSnapshotAt?: string; // When tool last synced with template
  // Update availability info (populated in listing endpoints)
  updateInfo?: {
    needsUpdate: boolean;
    latestVersion: string; // Template's latest version
    templateUpdatedAt?: string; // When template was last updated
  };

  /**
   * Publication workflow fields (mirror AgentModel)
   *
   * - draft: default state, only visible to owner
   * - pending_approval: owner requested publish; waiting for instance admin review
   * - published: approved by instance admin and visible as a published template-backed tool
   * - rejected: rejected by instance admin (owner can revise and request again)
   */
  publicationStatus: 'draft' | 'pending_approval' | 'published' | 'rejected';
  publicationRequestedBy?: string;
  publicationApprovedBy?: string;
  publicationApprovedAt?: string;

  /**
   * Optional publication metadata chosen by the owner when requesting publish.
   *
   * - publicationVersionBump: how the owner wants to bump from the current version
   * - publicationRequestedVersion: the exact target version string (e.g. '1.2.3')
   * - publicationChangelog: human-readable notes about what changed
   */
  publicationVersionBump?: 'patch' | 'minor' | 'major';
  publicationRequestedVersion?: string;
  publicationChangelog?: string;
}

// ============================================================================
// TOOL TEMPLATE REQUEST/RESPONSE TYPES
// ============================================================================

/**
 * Request to create a new tool template
 */
export interface CreateToolTemplateRequest extends Omit<ToolParams, 'slug'> {
  slug?: string; // Optional explicit slug (if not provided, will be generated from name)
  category: ToolTemplateCategory;
  version?: string; // Semantic version (defaults to '1.0.0' if not provided)
  exampleUsage?: string;
  requiresApiKey?: boolean;
  configurationFields?: Array<{
    name: string;
    type: 'string' | 'number' | 'boolean';
    description: string;
    required: boolean;
  }>;
}

/**
 * Request to update a tool template
 */
export type UpdateToolTemplateRequest = Partial<CreateToolTemplateRequest> & {
  version?: string;
};

// ============================================================================
// TOOL REQUEST/RESPONSE TYPES
// ============================================================================

/**
 * Request to create a new tool instance
 * For draft tools (status='draft'), only name and slug are required
 */
export interface CreateToolRequest extends Omit<ToolParams, 'parameters' | 'blueprint'> {
  parameters?: ToolParams['parameters']; // Optional for draft tools
  blueprint?: ToolParams['blueprint']; // Optional for draft tools
  configuration?: Record<string, unknown>;
  isEnabled?: boolean;
  status?: ToolStatus; // Tool status: 'draft' or 'active'
  // Template linkage (optional)
  sourceTemplateId?: string;
  publishedTemplateId?: string;
  version?: string; // Semantic version (defaults to '1.0.0' if not provided)
  templateSnapshotAt?: string; // When tool was created/synced from template
}

/**
 * Request to update a tool instance
 */
export type UpdateToolRequest = Partial<CreateToolRequest> & {
  sourceTemplateId?: string;
  publishedTemplateId?: string;
  version?: string;
  templateSnapshotAt?: string;
};

/**
 * Response type for update check
 */
export interface ToolUpdateCheckResponse {
  needsUpdate: boolean;
  currentVersion: string; // Tool's current version
  latestVersion: string; // Template's latest version
  templateUpdatedAt?: string;
}

/**
 * Response type for update from template (minimal response)
 */
export interface ToolUpdateResponse {
  id: string;
  name: string;
  version: string;
  templateSnapshotAt?: string;
  updatedAt: string;
  message: string;
}

/**
 * DTO for admin pending tools listing.
 * Wraps the tool plus denormalized metadata needed only for that view.
 */
export interface PendingToolSummary {
  tool: ToolModel;
  requestedBy?: {
    id: string;
    name?: string;
    avatar?: string;
  };
  requestedByStarship?: {
    id: string;
    name?: string;
    slug?: string;
  };
}

// ============================================================================
// SEARCH/FILTER TYPES
// ============================================================================

/**
 * Tool template search/filter parameters
 */
export interface ToolTemplateSearchParams {
  category?: ToolTemplateCategory;
  query?: string; // For text search across name/description
  requiresApiKey?: boolean;
}

/**
 * Tool search/filter parameters
 */
export interface ToolSearchParams {
  isEnabled?: boolean;
  status?: ToolStatus;
  query?: string; // For text search across name/description
}
