/**
 * LLM Domain Types
 *
 * Consolidated language model type definitions for protocol contract.
 * Moved from contracts/llm.ts as LLM is now a domain concept.
 */

import type { UsageStats } from '../contracts/chat-socket';

// ============================================================================
// LLM TOOL INTERFACES
// ============================================================================

/**
 * Tool definition for LLM function calling
 */
export interface LLMToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, {
        type: string;
        description?: string;
        enum?: string[];
      }>;
      required?: string[];
    };
  };
}

// ============================================================================
// LLM PROVIDER INTERFACES
// ============================================================================

/**
 * LLM chat prompt structure
 */
export interface LLMChatPrompt {
  messages: Array<{ role: 'system' | 'assistant' | 'user'; content: string }>;
}

/**
 * LLM completion result
 */
export interface LLMResult {
  reply: string;
  usage?: UsageStats;
  toolCalls?: Array<{
    id: string;
    name: string;
    arguments: Record<string, unknown>;
  }>;
}

/**
 * LLM provider interface
 */
export interface LLMProvider {
  complete(
    prompt: LLMChatPrompt,
    opts?: {
      stream?: boolean;
      temperature?: number;
      maxTokens?: number;
      tools?: LLMToolDefinition[];
    }
  ): Promise<LLMResult>;
  
  completeStream(
    prompt: LLMChatPrompt,
    opts?: {
      temperature?: number;
      maxTokens?: number;
      tools?: LLMToolDefinition[];
    }
  ): AsyncGenerator<string, void, unknown>;
}

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