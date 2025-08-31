/**
 * Agent Template Collection Types
 *
 * Clean agent template type definitions for model types.
 */

import type { Blueprint, AgentMemoryConfig, AgentNodeParameters } from '@starships/autopilot';

// ============================================================================
// AGENT TEMPLATE TYPES
// ============================================================================

/**
 * Agent template category options
 */
export type AgentTemplateCategory = 'general' | 'coding' | 'creative' | 'analysis' | 'support';

/**
 * Core agent template entity
 */
export interface AgentTemplateModel extends AgentNodeParameters {
  // Core template fields
  id: string;
  createdAt: string;
  updatedAt: string;

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
export interface CreateAgentTemplateRequest {
  name: string;
  description: string;
  category: AgentTemplateCategory;
  model: string;
  temperature?: number;
  maxTokens?: number;
  blueprint: Blueprint;
  memory: AgentMemoryConfig;
  timeout: number;
  icon?: string;
  previewPrompts?: string[];
}

/**
 * Request to update agent template information
 */
export interface UpdateAgentTemplateRequest {
  name?: string;
  description?: string;
  category?: AgentTemplateCategory;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  blueprint?: Blueprint;
  memory?: AgentMemoryConfig;
  timeout?: number;
  icon?: string;
  previewPrompts?: string[];
}

/**
 * Agent template response structure
 */
export interface AgentTemplateResponse {
  template: AgentTemplateModel;
}

/**
 * Agent template list response
 */
export interface AgentTemplateListResponse {
  templates: AgentTemplateModel[];
  total: number;
}

// ============================================================================
// FILTER AND QUERY TYPES
// ============================================================================

/**
 * Filters for querying agent templates
 */
export interface AgentTemplateFilters {
  category?: AgentTemplateCategory;
}

/**
 * Sorting options for agent templates
 */
export interface AgentTemplateSort {
  field: 'createdAt' | 'updatedAt' | 'name' | 'usageCount';
  direction: 'asc' | 'desc';
}

// ============================================================================
// USAGE AND ANALYTICS TYPES
// ============================================================================

/**
 * Agent template usage statistics
 */
export interface AgentTemplateUsage {
  templateId: string;
  usageCount: number;
  lastUsed?: string;
}

/**
 * Request to increment template usage
 */
export interface IncrementTemplateUsageRequest {
  templateId: string;
  userId: string;
}
