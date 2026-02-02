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
    // #region agent log (hypothesis D)
    try {
      if (typeof window !== 'undefined') {
        const w = window as any
        if (!w.__dbg_llm_models_logged) {
          w.__dbg_llm_models_logged = 1
          fetch('http://127.0.0.1:7242/ingest/f94efb64-8fc4-4319-97c1-245fc1440b35', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sessionId: 'debug-session',
              runId: 'ring-pre',
              hypothesisId: 'D',
              location: 'useLlmModels.ts:fetchLlmModels',
              message: 'llm_models_loaded',
              data: {
                count: models.length,
                sample: models.slice(0, 10).map(m => (typeof (m as any)?.model === 'string' ? String((m as any).model) : null)).filter(Boolean),
              },
              timestamp: Date.now(),
            }),
          }).catch(() => {})
        }
      }
    } catch {}
    // #endregion
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
  // #region agent log (hypothesis D/E)
  try {
    if (typeof window !== 'undefined') {
      const w = window as any
      w.__dbg_ctxlen_seen ??= {}
      const key = `${String(modelId || 'null')}:${String((match as any)?.model || 'no-match')}:${String(contextLength ?? 'none')}:${String(isLoading)}:${String(Boolean(error))}`
      if (!w.__dbg_ctxlen_seen[key]) {
        w.__dbg_ctxlen_seen[key] = 1
        fetch('http://127.0.0.1:7242/ingest/f94efb64-8fc4-4319-97c1-245fc1440b35', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: 'debug-session',
            runId: 'ring-pre',
            hypothesisId: 'D/E',
            location: 'useLlmModels.ts:useModelContextLength',
            message: 'ctxlen_lookup',
            data: {
              modelId: modelId ?? null,
              modelsLoaded: Array.isArray(models) ? models.length : null,
              isLoading,
              hasError: Boolean(error),
              matchedModel: (match as any)?.model ?? null,
              contextLength: contextLength ?? null,
            },
            timestamp: Date.now(),
          }),
        }).catch(() => {})
      }
    }
  } catch {}
  // #endregion
  return { contextLength, isLoading, error, model: match }
}

