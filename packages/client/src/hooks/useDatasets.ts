import api from '@/lib/api'
import type {
  ApiResponse,
  CreateStarshipTableRequest,
  StarshipTableDetailsResponse,
  StarshipTableListResponse,
  StarshipTableModel,
  StarshipTableRowsPageResponse,
  UpsertStarshipTableRowsRequest,
  UpsertStarshipTableRowsResponse,
  UpdateStarshipTableRequest,
} from '@starships/protocol'
import type { TableRowFilter as DatasetRowFilter } from '@starships/models'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { FetchResponse } from '@/lib/types'

export type { DatasetRowFilter }

export const DATASET_QUERY_KEYS = {
  all: ['datasets'] as const,
  byStarship: (starshipId: string) => [...DATASET_QUERY_KEYS.all, 'starship', starshipId] as const,
  byId: (starshipId: string, datasetId: string) => [...DATASET_QUERY_KEYS.byStarship(starshipId), 'detail', datasetId] as const,
  rows: (starshipId: string, datasetId: string, limit: number, offset: number, expand?: string, search?: string, filters?: DatasetRowFilter[]) =>
    [...DATASET_QUERY_KEYS.byId(starshipId, datasetId), 'rows', { limit, offset, expand: expand ?? '', search: search ?? '', filters: filters ?? [] }] as const,
} as const

export function useStarshipTables(starshipId: string, enabled: boolean = true, opts?: { includeArchived?: boolean }) {
  return useQuery({
    queryKey: [...DATASET_QUERY_KEYS.byStarship(starshipId), { includeArchived: Boolean(opts?.includeArchived) }] as const,
    queryFn: async (): Promise<StarshipTableModel[]> => {
      const response: FetchResponse<ApiResponse<StarshipTableListResponse>> = await api.get(`/api/v1/starships/${starshipId}/datasets`, {
        params: opts,
      })
      return response.data.data.datasets
    },
    enabled: Boolean(starshipId) && enabled,
    staleTime: 10 * 1000,
    gcTime: 2 * 60 * 1000,
  })
}

export function useDataset(starshipId: string, datasetId: string, enabled: boolean = true) {
  return useQuery({
    queryKey: DATASET_QUERY_KEYS.byId(starshipId, datasetId),
    queryFn: async (): Promise<StarshipTableModel> => {
      const response: FetchResponse<ApiResponse<StarshipTableDetailsResponse>> = await api.get(
        `/api/v1/starships/${starshipId}/datasets/${datasetId}`
      )
      return response.data.data.dataset
    },
    enabled: Boolean(starshipId) && Boolean(datasetId) && enabled,
    staleTime: 10 * 1000,
    gcTime: 2 * 60 * 1000,
  })
}

export function useDatasetRows(
  starshipId: string,
  datasetId: string,
  limit: number,
  offset: number,
  search: string | undefined,
  enabled: boolean = true,
  filters?: DatasetRowFilter[]
) {
  return useQuery({
    queryKey: DATASET_QUERY_KEYS.rows(starshipId, datasetId, limit, offset, 'refs', search, filters),
    queryFn: async (): Promise<StarshipTableRowsPageResponse> => {
      const response: FetchResponse<ApiResponse<StarshipTableRowsPageResponse>> = await api.get(
        `/api/v1/starships/${starshipId}/datasets/${datasetId}/rows`,
        {
          params: {
            limit,
            offset,
            expand: 'refs',
            ...(search && search.trim() ? { search: search.trim() } : null),
            ...(filters && filters.length > 0 ? { filters: JSON.stringify(filters) } : null),
          },
        }
      )
      return response.data.data
    },
    enabled: Boolean(starshipId) && Boolean(datasetId) && enabled,
    staleTime: 5 * 1000,
    gcTime: 2 * 60 * 1000,
  })
}

export function useCreateDataset(starshipId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: Omit<CreateStarshipTableRequest, 'starshipId'>): Promise<StarshipTableModel> => {
      const response: FetchResponse<ApiResponse<StarshipTableDetailsResponse>> = await api.post(
        `/api/v1/starships/${starshipId}/datasets`,
        payload
      )
      return response.data.data.dataset
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: DATASET_QUERY_KEYS.byStarship(starshipId) })
    },
  })
}

export function useUpdateDataset(starshipId: string, datasetId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (updates: UpdateStarshipTableRequest): Promise<StarshipTableModel> => {
      const response: FetchResponse<ApiResponse<StarshipTableDetailsResponse>> = await api.patch(
        `/api/v1/starships/${starshipId}/datasets/${datasetId}`,
        updates
      )
      return response.data.data.dataset
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: DATASET_QUERY_KEYS.byStarship(starshipId) })
      queryClient.invalidateQueries({ queryKey: DATASET_QUERY_KEYS.byId(starshipId, datasetId) })
    },
  })
}

export function useArchiveDataset(starshipId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (datasetIdOrSlug: string): Promise<StarshipTableModel> => {
      const id = encodeURIComponent(String(datasetIdOrSlug || '').trim())
      const response: FetchResponse<ApiResponse<StarshipTableDetailsResponse>> = await api.post(
        `/api/v1/starships/${starshipId}/datasets/${id}/archive`,
        {}
      )
      return response.data.data.dataset
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: DATASET_QUERY_KEYS.byStarship(starshipId) })
    },
  })
}

export function useHardDeleteDataset(starshipId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (datasetIdOrSlug: string): Promise<void> => {
      const id = encodeURIComponent(String(datasetIdOrSlug || '').trim())
      await api.delete(`/api/v1/starships/${starshipId}/datasets/${id}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: DATASET_QUERY_KEYS.byStarship(starshipId) })
    },
  })
}

export function useUpsertDatasetRows(starshipId: string, datasetId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: UpsertStarshipTableRowsRequest): Promise<UpsertStarshipTableRowsResponse> => {
      const response: FetchResponse<ApiResponse<UpsertStarshipTableRowsResponse>> = await api.post(
        `/api/v1/starships/${starshipId}/datasets/${datasetId}/rows:upsert`,
        payload
      )
      return response.data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: DATASET_QUERY_KEYS.byId(starshipId, datasetId) })
      queryClient.invalidateQueries({ queryKey: [...DATASET_QUERY_KEYS.byId(starshipId, datasetId), 'rows'] as const })
    },
  })
}

export function useDeleteDatasetRow(starshipId: string, datasetId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (rowKey: string): Promise<void> => {
      const rk = encodeURIComponent(String(rowKey || '').trim())
      if (!rk) return
      await api.delete(`/api/v1/starships/${starshipId}/datasets/${datasetId}/rows/${rk}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: DATASET_QUERY_KEYS.byId(starshipId, datasetId) })
      queryClient.invalidateQueries({ queryKey: [...DATASET_QUERY_KEYS.byId(starshipId, datasetId), 'rows'] as const })
    },
  })
}

