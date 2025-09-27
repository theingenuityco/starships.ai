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
  createdAt: string;
  updatedAt: string;

  // Tool assignment - reference by slugs instead of embedding
  assignedToolSlugs?: string[];

  // Template metadata
  category: AgentTemplateCategory;
  usageCount: number;

  // Template preview
  icon?: string;
  previewPrompts?: string[]; // Example prompts to show what the template can do
}

// ============================================================================
// REQUEST/RESPONSE TYPES
// ============================================================================

/**
 * Request to create a new agent template
 */
export interface CreateAgentTemplateRequest extends AgentParamsWithoutMetadata {
  slug?: string; // Optional explicit slug (if not provided, will be generated from name)
  category: AgentTemplateCategory;
  icon?: string;
  previewPrompts?: string[];
  assignedToolSlugs?: string[]; // Tool templates to assign to this agent template
}

/**
 * Request to update agent template information
 */
export interface UpdateAgentTemplateRequest extends Partial<AgentParamsWithoutMetadata> {
  category?: AgentTemplateCategory;
  icon?: string;
  previewPrompts?: string[];
  assignedToolSlugs?: string[];
}
