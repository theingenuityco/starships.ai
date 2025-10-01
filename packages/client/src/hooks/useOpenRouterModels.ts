import { useQuery } from '@tanstack/react-query'
import api from '@/lib/api'
import type { ApiResponse } from '@starships/protocol'

// Types for OpenRouter models response
export interface OpenRouterModel {
  id: string
  canonical_slug?: string
  name?: string
  description?: string
  context_length?: number
  architecture?: {
    modality?: string
    input_modalities?: string[]
    output_modalities?: string[]
    tokenizer?: string | null
    instruct_type?: string | null
  }
  pricing?: {
    prompt?: string
    completion?: string
    request?: string
    image?: string
    web_search?: string
    internal_reasoning?: string
    input_cache_read?: string
    input_cache_write?: string
  }
  top_provider?: {
    context_length?: number
    max_completion_tokens?: number | null
    is_moderated?: boolean
  } | null
  per_request_limits?: Record<string, unknown> | null
  supported_parameters?: string[]
}

type OpenRouterModelsResponse = ApiResponse<OpenRouterModel[]>

// Fetch OpenRouter models catalog (public endpoint)
async function fetchOpenRouterModels(): Promise<OpenRouterModel[]> {
  // Server proxy uses OpenRouter: GET /api/v1/models/user (Provider Preferences)
  const res = await api.get<OpenRouterModelsResponse>('/api/v1/openrouter/models')
  const data = res.data.data
  return Array.isArray(data) ? data : []
}

// Hook to cache models catalog
export function useOpenRouterModels() {
  return useQuery({
    queryKey: ['openrouter', 'models'],
    queryFn: () => fetchOpenRouterModels(),
    staleTime: 6 * 60 * 60 * 1000, // 6 hours
    gcTime: 24 * 60 * 60 * 1000, // 24 hours
  })
}

// Exact match only: require canonical OpenRouter IDs
export function findMatchingModel(models: OpenRouterModel[], rawId: string | null | undefined): OpenRouterModel | null {
  if (!rawId) return null
  const id = rawId.trim()
  if (!id) return null
  return models.find(m => m.id === id || m.canonical_slug === id) || null
}

export function getModelContextLength(model: OpenRouterModel | null | undefined): number | undefined {
  if (!model) return undefined
  const providerCtx = model.top_provider?.context_length
  const modelCtx = model.context_length
  return providerCtx ?? modelCtx ?? undefined
}

// Convenience hook: resolve context length for a given agent model id
export function useModelContextLength(modelId: string | null | undefined) {
  const { data: models, isLoading, error } = useOpenRouterModels()
  const match = Array.isArray(models) ? findMatchingModel(models, modelId || null) : null
  const contextLength = getModelContextLength(match || undefined)
  return { contextLength, isLoading, error, model: match }
}
