'use client'

import api from '@/lib/api'
import type { ApiResponse, LlmModelModel, LlmModelProviderModel } from '@starships/protocol'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { FetchResponse } from '@/lib/types'
import { toast } from 'sonner'

export const ADMIN_LLM_MODELS_QUERY_KEYS = {
  all: ['admin', 'llm-models'] as const,
  models: () => [...ADMIN_LLM_MODELS_QUERY_KEYS.all, 'models'] as const,
  providers: (model: string) => [...ADMIN_LLM_MODELS_QUERY_KEYS.all, 'providers', model] as const,
} as const

export function useAdminLlmModels(enabled: boolean) {
  return useQuery({
    queryKey: ADMIN_LLM_MODELS_QUERY_KEYS.models(),
    enabled,
    queryFn: async (): Promise<LlmModelModel[]> => {
      const resp: FetchResponse<ApiResponse<LlmModelModel[]>> = await api.get('/api/v1/llm/models?enabledOnly=false')
      return resp.data.data || []
    },
    staleTime: 10 * 1000,
    gcTime: 5 * 60 * 1000,
  })
}

export function useAdminLlmModelProviders(model: string | null | undefined, enabled: boolean) {
  return useQuery({
    queryKey: model ? ADMIN_LLM_MODELS_QUERY_KEYS.providers(model) : ADMIN_LLM_MODELS_QUERY_KEYS.providers('missing'),
    enabled: enabled && !!model,
    queryFn: async (): Promise<LlmModelProviderModel[]> => {
      const resp: FetchResponse<ApiResponse<LlmModelProviderModel[]>> = await api.get(`/api/v1/llm/models/${encodeURIComponent(model!)}/providers?enabledOnly=false`)
      return resp.data.data || []
    },
    staleTime: 10 * 1000,
    gcTime: 5 * 60 * 1000,
  })
}

export function useAdminCreateLlmModel() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: { model: string }): Promise<void> => {
      await api.post('/api/v1/llm/models', payload)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ADMIN_LLM_MODELS_QUERY_KEYS.all })
      toast.success('Model added')
    },
    onError: (error: any) => {
      const message = error?.response?.data?.error || error?.message || 'Failed to add model'
      toast.error('Failed to add model', { description: message })
    },
  })
}

export function useAdminUpdateLlmModel() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ model, updates }: { model: string; updates: Partial<LlmModelModel> }): Promise<void> => {
      await api.put(`/api/v1/llm/models/${encodeURIComponent(model)}`, updates)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ADMIN_LLM_MODELS_QUERY_KEYS.all })
      toast.success('Model updated')
    },
    onError: (error: any) => {
      const message = error?.response?.data?.error || error?.message || 'Failed to update model'
      toast.error('Failed to update model', { description: message })
    },
  })
}

export function useAdminUpsertLlmProviderRoute() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (args: { model: string; provider: string; providerModelId: string; priority?: number; isEnabled?: boolean }): Promise<void> => {
      const { model, ...payload } = args
      await api.post(`/api/v1/llm/models/${encodeURIComponent(model)}/providers`, payload)
    },
    onSuccess: async (_data, vars) => {
      await queryClient.invalidateQueries({ queryKey: ADMIN_LLM_MODELS_QUERY_KEYS.all })
      if (vars?.model) {
        await queryClient.invalidateQueries({ queryKey: ADMIN_LLM_MODELS_QUERY_KEYS.providers(vars.model) })
      }
      toast.success('Provider route saved')
    },
    onError: (error: any) => {
      const message = error?.response?.data?.error || error?.message || 'Failed to save provider route'
      toast.error('Failed to save provider route', { description: message })
    },
  })
}

export function useAdminDeleteLlmProviderRoute() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (args: { model: string; provider: string; providerModelId: string }): Promise<void> => {
      const qs = new URLSearchParams({ provider: args.provider, providerModelId: args.providerModelId })
      await api.delete(`/api/v1/llm/models/${encodeURIComponent(args.model)}/providers?${qs.toString()}`)
    },
    onSuccess: async (_data, vars) => {
      await queryClient.invalidateQueries({ queryKey: ADMIN_LLM_MODELS_QUERY_KEYS.all })
      if (vars?.model) {
        await queryClient.invalidateQueries({ queryKey: ADMIN_LLM_MODELS_QUERY_KEYS.providers(vars.model) })
      }
      toast.success('Provider route deleted')
    },
    onError: (error: any) => {
      const message = error?.response?.data?.error || error?.message || 'Failed to delete provider route'
      toast.error('Failed to delete provider route', { description: message })
    },
  })
}

export function useAdminSyncOpenRouterModels() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (): Promise<{ syncedModels?: number }> => {
      const resp: FetchResponse<ApiResponse<any>> = await api.post('/api/v1/llm/models/sync/openrouter', {})
      return resp.data.data || {}
    },
    onSuccess: async data => {
      await queryClient.invalidateQueries({ queryKey: ADMIN_LLM_MODELS_QUERY_KEYS.all })
      toast.success('Synced from OpenRouter', { description: typeof data?.syncedModels === 'number' ? `${data.syncedModels} models updated` : undefined })
    },
    onError: (error: any) => {
      const message = error?.response?.data?.error || error?.message || 'Failed to sync from OpenRouter'
      toast.error('Sync failed', { description: message })
    },
  })
}

