import api from '@/lib/api'
import type { ApiResponse, StarshipDocDetailResponse, StarshipDocListResponse, StarshipDocModel } from '@starships/protocol'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { getSafeErrorMessage } from '@/lib/error-utils'

interface FetchResponse<T = unknown> {
  data: T
}

export const DOC_QUERY_KEYS = {
  all: ['docs'] as const,
  byStarship: (starshipId: string) => [...DOC_QUERY_KEYS.all, 'starship', starshipId] as const,
  byId: (starshipId: string, docId: string) => [...DOC_QUERY_KEYS.byStarship(starshipId), 'detail', docId] as const,
} as const

export function useStarshipDocs(starshipId: string, enabled: boolean = true, opts?: { includeArchived?: boolean }) {
  return useQuery({
    queryKey: [...DOC_QUERY_KEYS.byStarship(starshipId), { includeArchived: Boolean(opts?.includeArchived) }] as const,
    queryFn: async (): Promise<StarshipDocModel[]> => {
      const response: FetchResponse<ApiResponse<StarshipDocListResponse>> = await api.get(`/api/v1/starships/${starshipId}/docs`, {
        params: opts,
      })
      return response.data.data.docs
    },
    enabled: Boolean(starshipId) && enabled,
    staleTime: 10 * 1000,
    gcTime: 2 * 60 * 1000,
  })
}

export function useDoc(starshipId: string, docId: string, enabled: boolean = true) {
  return useQuery({
    queryKey: DOC_QUERY_KEYS.byId(starshipId, docId),
    queryFn: async (): Promise<StarshipDocModel> => {
      const response: FetchResponse<ApiResponse<StarshipDocDetailResponse>> = await api.get(`/api/v1/starships/${starshipId}/docs/${docId}`)
      return response.data.data.doc
    },
    enabled: Boolean(starshipId) && Boolean(docId) && enabled,
    staleTime: 10 * 1000,
    gcTime: 2 * 60 * 1000,
  })
}

export function useCreateDoc(starshipId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (args: { title: string; content?: string }) => {
      const response: FetchResponse<ApiResponse<StarshipDocDetailResponse>> = await api.post(`/api/v1/starships/${starshipId}/docs`, {
        title: args.title,
        ...(args.content !== undefined ? { content: args.content } : {}),
      })
      return response.data.data.doc
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: DOC_QUERY_KEYS.byStarship(starshipId) })
    },
    onError: (error: unknown) => {
      toast.error('Failed to create doc', { description: getSafeErrorMessage(error) })
    },
  })
}

export function useUpdateDoc(starshipId: string, docId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (args: { title?: string; content?: string; archived?: boolean }) => {
      const response: FetchResponse<ApiResponse<StarshipDocDetailResponse>> = await api.patch(`/api/v1/starships/${starshipId}/docs/${docId}`, args)
      return response.data.data.doc
    },
    onSuccess: async (doc) => {
      qc.setQueryData(DOC_QUERY_KEYS.byId(starshipId, docId), doc)
      await qc.invalidateQueries({ queryKey: DOC_QUERY_KEYS.byStarship(starshipId) })
    },
    onError: (error: unknown) => {
      toast.error('Failed to update doc', { description: getSafeErrorMessage(error) })
    },
  })
}

export function useHardDeleteDoc(starshipId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (docId: string) => {
      const response: FetchResponse<ApiResponse<{ removed: boolean }>> = await api.delete(`/api/v1/starships/${starshipId}/docs/${docId}`)
      return response.data.data
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: DOC_QUERY_KEYS.byStarship(starshipId) })
    },
    onError: (error: unknown) => {
      toast.error('Failed to delete doc', { description: getSafeErrorMessage(error) })
    },
  })
}
