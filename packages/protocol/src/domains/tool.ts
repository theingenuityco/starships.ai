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

  // Template relationship (optional)
  templateId?: string;

  // ToolParams fields (made optional for draft support)
  parameters?: ToolParams['parameters'];
  blueprint?: ToolParams['blueprint'];

  // User configuration
  configuration?: Record<string, unknown>; // API keys, custom parameters, etc.
  isEnabled?: boolean;
  status?: ToolStatus; // Tool status: 'draft' for incomplete tools, 'active' for ready tools
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
 * For draft tools (status='draft'), only name and slug are required
 */
export interface CreateToolRequest extends Omit<ToolParams, 'parameters' | 'blueprint'> {
  parameters?: ToolParams['parameters']; // Optional for draft tools
  blueprint?: ToolParams['blueprint']; // Optional for draft tools
  configuration?: Record<string, unknown>;
  isEnabled?: boolean;
  status?: ToolStatus; // Tool status: 'draft' or 'active'
  templateId?: string; // optional template reference when creating directly from a template
}

/**
 * Request to update a tool instance
 */
export type UpdateToolRequest = Partial<CreateToolRequest> & { templateId?: string };

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
