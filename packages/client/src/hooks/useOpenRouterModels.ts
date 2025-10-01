import { useQuery } from '@tanstack/react-query'
import api from '@/lib/api'
import type { OpenRouterModel, OpenRouterModelsResponse } from '@starships/protocol'

/** Cache TTLs */
const OPENROUTER_MODELS_STALE_MS = 6 * 60 * 60 * 1000 // 6h
const OPENROUTER_MODELS_GC_MS = 24 * 60 * 60 * 1000 // 24h

/**
 * Fetch OpenRouter models via server proxy (uses OpenRouter /api/v1/models/user).
 * Returns an empty array on unexpected shapes (and logs a warning) instead of throwing.
 */
async function fetchOpenRouterModels(): Promise<OpenRouterModel[]> {
  const res = await api.get<OpenRouterModelsResponse>('/api/v1/openrouter/models')

  // Explicit guards against undefined/null shapes
  const payload = res?.data
  const models = payload && Array.isArray(payload.data) ? payload.data : undefined

  if (!models) {
    console.warn('[openrouter] Unexpected /models response shape:', payload)
    return []
  }

  return models
}

/**
 * Cache-aware hook for the OpenRouter model catalog (filtered by account Provider Preferences).
 */
export function useOpenRouterModels() {
  return useQuery({
    queryKey: ['openrouter', 'models'],
    queryFn: () => fetchOpenRouterModels(),
    staleTime: OPENROUTER_MODELS_STALE_MS,
    gcTime: OPENROUTER_MODELS_GC_MS,
  })
}

/**
 * Find a model by exact OpenRouter slug.
 * Matches against id or canonical_slug (e.g., "openai/gpt-4o-mini").
 */
export function findMatchingModel(models: OpenRouterModel[], rawId: string | null | undefined): OpenRouterModel | null {
  if (!rawId) return null
  const id = rawId.trim()
  if (!id) return null
  return models.find(m => m.id === id || m.canonical_slug === id) || null
}

/**
 * Resolve the effective context window for a model.
 * Prefers provider-specific context_length (top_provider) and falls back to model-level context_length.
 */
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
