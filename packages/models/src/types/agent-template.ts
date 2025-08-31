/**
 * Agent Template Collection Types
 *
 * Clean agent template type definitions for model types.
 */

import type { Blueprint, AgentMemoryConfig } from '@starships/autopilot';

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
export interface AgentTemplateModel {
  id: string;
  name: string;
  description: string;
  category: AgentTemplateCategory;
  tags: string[];

  // Template configuration
  systemPrompt: string;
  model: string; // References LLM.id
  temperature?: number;
  maxTokens?: number;

  // Autopilot-specific fields
  blueprint: Blueprint;
  memory: AgentMemoryConfig;
  executionMode: 'simple' | 'workflow';
  timeout: number;

  // Template metadata
  authorId: string;
  isPublic: boolean;
  usageCount: number;
  rating?: number;

  // Template preview
  icon?: string;
  previewPrompts?: string[]; // Example prompts to show what the template can do

  createdAt: string;
  updatedAt: string;
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
  tags: string[];
  systemPrompt: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  blueprint: Blueprint;
  memory: AgentMemoryConfig;
  executionMode: 'simple' | 'workflow';
  timeout: number;
  isPublic: boolean;
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
  tags?: string[];
  systemPrompt?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  blueprint?: Blueprint;
  memory?: AgentMemoryConfig;
  executionMode?: 'simple' | 'workflow';
  timeout?: number;
  isPublic?: boolean;
  rating?: number;
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
  authorId?: string;
  isPublic?: boolean;
  tags?: string[];
  minRating?: number;
}

/**
 * Sorting options for agent templates
 */
export interface AgentTemplateSort {
  field: 'createdAt' | 'updatedAt' | 'name' | 'usageCount' | 'rating';
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
  averageRating?: number;
  totalRatings: number;
  lastUsed?: string;
}

/**
 * Request to increment template usage
 */
export interface IncrementTemplateUsageRequest {
  templateId: string;
  userId: string;
}

/**
 * Request to rate a template
 */
export interface RateTemplateRequest {
  templateId: string;
  userId: string;
  rating: number; // 1-5 stars
}