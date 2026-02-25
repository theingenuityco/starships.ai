import api from '@/lib/api'
import type { ApiResponse, CreateViewRequest, UpdateViewRequest, ViewModel } from '@starships/protocol'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { FetchResponse } from '@/lib/types'

export const VIEW_QUERY_KEYS = {
  all: ['views'] as const,
  byStarship: (starshipId: string, filters?: { name?: string; slug?: string }) => [...VIEW_QUERY_KEYS.all, 'starship', starshipId, { filters }] as const,
  byId: (id: string) => [...VIEW_QUERY_KEYS.all, 'detail', id] as const,
} as const

export function useStarshipViews(starshipId: string, enabled: boolean = true, filters?: { name?: string; slug?: string }) {
  return useQuery({
    queryKey: VIEW_QUERY_KEYS.byStarship(starshipId, filters),
    queryFn: async (): Promise<ViewModel[]> => {
      const response: FetchResponse<ApiResponse<ViewModel[]>> = await api.get(`/api/v1/starships/${starshipId}/views`, {
        params: filters,
      })
      return response.data.data
    },
    enabled: Boolean(starshipId) && enabled,
    staleTime: 10 * 1000,
    gcTime: 2 * 60 * 1000,
  })
}

export function useView(viewId: string, enabled: boolean = true) {
  return useQuery({
    queryKey: VIEW_QUERY_KEYS.byId(viewId),
    queryFn: async (): Promise<ViewModel> => {
      const response: FetchResponse<ApiResponse<ViewModel>> = await api.get(`/api/v1/views/${viewId}`)
      return response.data.data
    },
    enabled: Boolean(viewId) && enabled,
    staleTime: 10 * 1000,
    gcTime: 10 * 60 * 1000,
  })
}

export function useCreateView() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: CreateViewRequest): Promise<ViewModel> => {
      const response: FetchResponse<ApiResponse<ViewModel>> = await api.post('/api/v1/views', payload)
      return response.data.data
    },
    onSuccess: (view) => {
      queryClient.invalidateQueries({ queryKey: VIEW_QUERY_KEYS.byStarship(view.starshipId) })
    },
  })
}

export function useUpdateView(viewId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (updates: UpdateViewRequest): Promise<ViewModel> => {
      const response: FetchResponse<ApiResponse<ViewModel>> = await api.put(`/api/v1/views/${viewId}`, updates)
      return response.data.data
    },
    onSuccess: (view) => {
      queryClient.invalidateQueries({ queryKey: VIEW_QUERY_KEYS.byId(view.id) })
      queryClient.invalidateQueries({ queryKey: VIEW_QUERY_KEYS.byStarship(view.starshipId) })
    },
  })
}

export function useDeleteView() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ viewId }: { viewId: string }): Promise<void> => {
      await api.delete(`/api/v1/views/${viewId}`)
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: VIEW_QUERY_KEYS.all })
      queryClient.removeQueries({ queryKey: VIEW_QUERY_KEYS.byId(vars.viewId) })
    },
  })
}

