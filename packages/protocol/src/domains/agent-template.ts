/**
 * Agent Template Collection Types
 *
 * Clean agent template type definitions for model types.
 */

import { AgentParamsWithoutMetadata } from './agent';

// ============================================================================
// AGENT TEMPLATE TYPES
// ============================================================================

import type { TemplateCategory } from '../index';

/**
 * Agent template category options (using shared TemplateCategory)
 */
export type AgentTemplateCategory = TemplateCategory;

/**
 * Core agent template entity
 */
export interface AgentTemplateModel extends AgentParamsWithoutMetadata {
  // Core template fields
  id: string;
  slug: string;
  /**
   * Human-readable role label for the template (required).
   * Deployed agents inherit this role.
   */
  role: string;
  createdAt: string;
  updatedAt: string;

  // Tool assignment - reference by slugs instead of embedding
  assignedToolSlugs?: string[];

  // Template metadata
  category: AgentTemplateCategory;
  usageCount: number;
  version: string; // Semantic version (e.g., '1.0.2')

  // Template preview
  icon?: string;
  previewPrompts?: string[]; // Example prompts to show what the template can do

  /**
   * Optional public avatar URL for marketplace display.
   * Served by the API (not a raw S3 URL).
   */
  avatarUrl?: string;

  /**
   * Optional timestamp indicating when the avatar last changed.
   * Useful for cache-busting.
   */
  avatarUpdatedAt?: string;
}

// ============================================================================
// REQUEST/RESPONSE TYPES
// ============================================================================

/**
 * Request to create a new agent template
 */
export interface CreateAgentTemplateRequest extends AgentParamsWithoutMetadata {
  /**
   * Human-readable role label for the template (required).
   */
  role: string;
  category: AgentTemplateCategory;
  icon?: string;
  previewPrompts?: string[];
  assignedToolSlugs?: string[]; // Tool templates to assign to this agent template
  version?: string; // Semantic version (defaults to '1.0.0' if not provided)
}

/**
 * Request to update agent template information
 */
export interface UpdateAgentTemplateRequest extends Partial<AgentParamsWithoutMetadata> {
  /**
   * Slugs are server-generated and not directly editable.
   */
  slug?: never;
  role?: string;
  category?: AgentTemplateCategory;
  icon?: string;
  previewPrompts?: string[];
  assignedToolSlugs?: string[];
  version?: string;
}
