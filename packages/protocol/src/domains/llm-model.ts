/**
 * LLM Model Catalog domain types
 *
 * Canonical model IDs are OpenRouter-style strings (e.g. "openai/gpt-4o", "anthropic/claude-sonnet-4.5").
 * A canonical model may map to multiple provider routes (openrouter, aws_bedrock, google_vertex, ...).
 */

import type { ApiResponse } from '@/contracts/api-response';

/**
 * Known provider identifiers (extensible).
 */
export type LlmProvider =
  | 'openrouter'
  | 'aws_bedrock'
  | 'google_vertex'
  | 'google_gemini'
  | 'azure_openai'
  | (string & {});

/**
 * Canonical model row (what agents reference).
 */
export interface LlmModelModel {
  model: string;
  displayName?: string;
  description?: string;

  contextLength?: number;
  inputModalities?: string[];
  outputModalities?: string[];
  supportedParameters?: string[];

  metadata?: Record<string, unknown>;

  isEnabled: boolean;
  isDeprecated: boolean;

  createdAt: string;
  updatedAt: string;
}

/**
 * Provider route for a canonical model.
 */
export interface LlmModelProviderModel {
  model: string;
  provider: LlmProvider;
  providerModelId: string;

  priority: number;
  isEnabled: boolean;

  pricing?: Record<string, unknown> | null;
  metadata?: Record<string, unknown>;
  lastSyncedAt?: string | null;

  createdAt: string;
  updatedAt: string;
}

export type LlmModelsResponse = ApiResponse<LlmModelModel[]>;
export type LlmModelProvidersResponse = ApiResponse<LlmModelProviderModel[]>;

