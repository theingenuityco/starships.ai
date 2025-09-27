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
  slug: string;
  createdAt: string;
  updatedAt: string;

  // Template metadata
  category: ToolTemplateCategory;
  usageCount: number;

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
 * Database Tool interface - user's configured tool instances
 */
export interface ToolModel extends ToolParams {
  // Core database fields
  id: string;
  slug: string; // Human-readable identifier for tool instances (copied from template)
  createdAt: string;
  updatedAt: string;

  // User configuration
  configuration?: Record<string, unknown>; // API keys, custom parameters, etc.
  isEnabled?: boolean;
}

// ============================================================================
// TOOL TEMPLATE REQUEST/RESPONSE TYPES
// ============================================================================

/**
 * Request to create a new tool template
 */
export interface CreateToolTemplateRequest extends ToolParams {
  slug?: string; // Optional explicit slug (if not provided, will be generated from name)
  category: ToolTemplateCategory;
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
export type UpdateToolTemplateRequest = Partial<CreateToolTemplateRequest>;

// ============================================================================
// TOOL REQUEST/RESPONSE TYPES
// ============================================================================

/**
 * Request to create a new tool instance
 */
export interface CreateToolRequest extends ToolParams {
  slug: string; // Required for creating tool instances (copied from template)
  configuration?: Record<string, unknown>;
  isEnabled?: boolean;
}

/**
 * Request to update a tool instance
 */
export type UpdateToolRequest = Partial<CreateToolRequest>;

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
  query?: string; // For text search across name/description
}
