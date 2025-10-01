/**
 * OpenRouter domain types
 *
 * Shared types for the OpenRouter model catalog across client and server.
 */

import type { ApiResponse } from '@/contracts/api-response';

/**
 * OpenRouter model metadata as returned by https://openrouter.ai/api/v1/models(/user)
 */
export interface OpenRouterModel {
  id: string;
  canonical_slug?: string;
  name?: string;
  description?: string;
  context_length?: number;
  architecture?: {
    modality?: string;
    input_modalities?: string[];
    output_modalities?: string[];
    tokenizer?: string | null;
    instruct_type?: string | null;
  };
  pricing?: {
    prompt?: string;
    completion?: string;
    request?: string;
    image?: string;
    web_search?: string;
    internal_reasoning?: string;
    input_cache_read?: string;
    input_cache_write?: string;
  };
  top_provider?: {
    context_length?: number;
    max_completion_tokens?: number | null;
    is_moderated?: boolean;
  } | null;
  per_request_limits?: Record<string, unknown> | null;
  supported_parameters?: string[];
}

/**
 * Standardized API response shape for OpenRouter models endpoint
 */
export type OpenRouterModelsResponse = ApiResponse<OpenRouterModel[]>;
