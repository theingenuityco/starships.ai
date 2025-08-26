/**
 * LLM Entity Types
 *
 * Clean language model type definitions for protocol contract.
 */

// ============================================================================
// LLM TYPES
// ============================================================================

/**
 * LLM provider options
 */
export type LLMProviderType = 'openai' | 'anthropic';

/**
 * Core LLM entity
 */
export interface LLM {
  id: string;
  name: string;
  provider: LLMProviderType;
  maxTokens?: number;
  temperature?: number;
  
  // Capabilities
  supportsStreaming?: boolean;
  supportsTools?: boolean;
  
  // Pricing
  costPer1kTokens?: number;
  
  createdAt: string;
}

// ============================================================================
// REQUEST/RESPONSE TYPES
// ============================================================================

/**
 * Request to create a new LLM model
 */
export interface CreateLLMRequest {
  name: string;
  provider: LLMProviderType;
  maxTokens?: number;
  temperature?: number;
  supportsStreaming?: boolean;
  supportsTools?: boolean;
  costPer1kTokens?: number;
}

/**
 * Request to update LLM model information
 */
export interface UpdateLLMRequest {
  name?: string;
  provider?: LLMProviderType;
  maxTokens?: number;
  temperature?: number;
  supportsStreaming?: boolean;
  supportsTools?: boolean;
  costPer1kTokens?: number;
}

/**
 * LLM response structure
 */
export interface LLMResponse {
  llm: LLM;
}

/**
 * LLM list response
 */
export interface LLMListResponse {
  llms: LLM[];
  total: number;
}

// ============================================================================
// FILTER AND QUERY TYPES
// ============================================================================

/**
 * Filters for querying LLM models
 */
export interface LLMFilters {
  provider?: LLMProviderType;
  supportsStreaming?: boolean;
  supportsTools?: boolean;
}

/**
 * Sorting options for LLM models
 */
export interface LLMSort {
  field: 'createdAt' | 'name' | 'provider' | 'costPer1kTokens';
  direction: 'asc' | 'desc';
}