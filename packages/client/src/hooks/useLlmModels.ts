import { useQuery } from '@tanstack/react-query'
import api from '@/lib/api'
import type { LlmModelModel, LlmModelsResponse } from '@starships/protocol'
import { useAuth } from '@/hooks/useAuth'

/** Cache TTLs */
const LLM_MODELS_STALE_MS = 6 * 60 * 60 * 1000 // 6h
const LLM_MODELS_GC_MS = 24 * 60 * 60 * 1000 // 24h

async function fetchLlmModels(): Promise<LlmModelModel[]> {
  try {
    const res = await api.get<LlmModelsResponse>('/api/v1/llm/models')
    const payload = res?.data
    const models = payload && Array.isArray(payload.data) ? payload.data : undefined
    if (!models) {
      console.warn('[llm-models] Unexpected /llm/models response shape:', payload)
      return []
    }
    return models
  } catch (err: any) {
    const status = err?.response?.status
    if (status === 401) return []
    throw err
  }
}

export function useLlmModels() {
  const { isAuthenticated } = useAuth()
  return useQuery({
    queryKey: ['llm', 'models'],
    queryFn: () => fetchLlmModels(),
    staleTime: LLM_MODELS_STALE_MS,
    gcTime: LLM_MODELS_GC_MS,
    enabled: isAuthenticated,
  })
}

export function findMatchingLlmModel(models: LlmModelModel[], rawId: string | null | undefined): LlmModelModel | null {
  if (!rawId) return null
  const id = rawId.trim()
  if (!id) return null
  return models.find(m => m.model === id) || null
}

export function getModelContextLength(model: LlmModelModel | null | undefined): number | undefined {
  if (!model) return undefined
  return typeof model.contextLength === 'number' ? model.contextLength : undefined
}

export function useModelContextLength(modelId: string | null | undefined) {
  const { data: models, isLoading, error } = useLlmModels()
  const match = Array.isArray(models) ? findMatchingLlmModel(models, modelId || null) : null
  const contextLength = getModelContextLength(match || undefined)
  return { contextLength, isLoading, error, model: match }
}

