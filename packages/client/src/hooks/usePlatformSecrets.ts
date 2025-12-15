'use client'

import api from '@/lib/api'
import type { ApiResponse, CreatePlatformSecretRequest, PlatformSecretListResponse, PlatformSecretResponse, PlatformSecretSummary, UpdatePlatformSecretRequest } from '@starships/protocol'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { FetchResponse } from '@/lib/types'
import { toast } from 'sonner'

export const PLATFORM_SECRETS_QUERY_KEYS = {
  all: ['admin', 'platform-secrets'] as const,
  list: () => [...PLATFORM_SECRETS_QUERY_KEYS.all, 'list'] as const,
} as const

export function usePlatformSecrets(enabled: boolean = true) {
  return useQuery({
    queryKey: PLATFORM_SECRETS_QUERY_KEYS.list(),
    enabled,
    queryFn: async (): Promise<PlatformSecretSummary[]> => {
      const response: FetchResponse<ApiResponse<PlatformSecretListResponse>> = await api.get('/api/v1/admin/platform-secrets')
      return response.data.data.secrets
    },
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
  })
}

export function useCreatePlatformSecret() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (data: CreatePlatformSecretRequest): Promise<PlatformSecretSummary> => {
      const response: FetchResponse<ApiResponse<PlatformSecretResponse>> = await api.post('/api/v1/admin/platform-secrets', data)
      return response.data.data.secret
    },
    onSuccess: secret => {
      queryClient.invalidateQueries({ queryKey: PLATFORM_SECRETS_QUERY_KEYS.all })
      toast.success('Platform secret created', { description: secret.key })
    },
    onError: (error: any) => {
      const message = error?.response?.data?.error || error?.message || 'Failed to create platform secret'
      toast.error('Failed to create platform secret', { description: message })
    },
  })
}

export function useUpdatePlatformSecret() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ key, updates }: { key: string; updates: UpdatePlatformSecretRequest }): Promise<PlatformSecretSummary> => {
      const response: FetchResponse<ApiResponse<PlatformSecretResponse>> = await api.put(`/api/v1/admin/platform-secrets/${key}`, updates)
      return response.data.data.secret
    },
    onSuccess: secret => {
      queryClient.invalidateQueries({ queryKey: PLATFORM_SECRETS_QUERY_KEYS.all })
      toast.success('Platform secret updated', { description: secret.key })
    },
    onError: (error: any) => {
      const message = error?.response?.data?.error || error?.message || 'Failed to update platform secret'
      toast.error('Failed to update platform secret', { description: message })
    },
  })
}

export function useDeletePlatformSecret() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (key: string) => {
      const response: FetchResponse<ApiResponse<{ message: string }>> = await api.delete(`/api/v1/admin/platform-secrets/${key}`)
      return response.data.data
    },
    onSuccess: (_data, key) => {
      queryClient.invalidateQueries({ queryKey: PLATFORM_SECRETS_QUERY_KEYS.all })
      toast.success('Platform secret deleted', { description: key })
    },
    onError: (error: any) => {
      const message = error?.response?.data?.error || error?.message || 'Failed to delete platform secret'
      toast.error('Failed to delete platform secret', { description: message })
    },
  })
}
