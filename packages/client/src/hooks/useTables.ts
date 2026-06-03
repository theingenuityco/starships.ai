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
import type { TableRowFilter } from '@starships/models'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { FetchResponse } from '@/lib/types'

export type { TableRowFilter }

export const TABLE_QUERY_KEYS = {
  all: ['tables'] as const,
  byStarship: (starshipId: string) => [...TABLE_QUERY_KEYS.all, 'starship', starshipId] as const,
  byId: (starshipId: string, tableId: string) => [...TABLE_QUERY_KEYS.byStarship(starshipId), 'detail', tableId] as const,
  rows: (starshipId: string, tableId: string, limit: number, offset: number, expand?: string, search?: string, filters?: TableRowFilter[]) =>
    [...TABLE_QUERY_KEYS.byId(starshipId, tableId), 'rows', { limit, offset, expand: expand ?? '', search: search ?? '', filters: filters ?? [] }] as const,
} as const

export function useStarshipTables(starshipId: string, enabled: boolean = true, opts?: { includeArchived?: boolean }) {
  return useQuery({
    queryKey: [...TABLE_QUERY_KEYS.byStarship(starshipId), { includeArchived: Boolean(opts?.includeArchived) }] as const,
    queryFn: async (): Promise<StarshipTableModel[]> => {
      const response: FetchResponse<ApiResponse<StarshipTableListResponse>> = await api.get(`/api/v1/starships/${starshipId}/tables`, {
        params: opts,
      })
      return response.data.data.tables
    },
    enabled: Boolean(starshipId) && enabled,
    staleTime: 10 * 1000,
    gcTime: 2 * 60 * 1000,
  })
}

export function useTable(starshipId: string, tableId: string, enabled: boolean = true) {
  return useQuery({
    queryKey: TABLE_QUERY_KEYS.byId(starshipId, tableId),
    queryFn: async (): Promise<StarshipTableModel> => {
      const response: FetchResponse<ApiResponse<StarshipTableDetailsResponse>> = await api.get(
        `/api/v1/starships/${starshipId}/tables/${tableId}`
      )
      return response.data.data.table
    },
    enabled: Boolean(starshipId) && Boolean(tableId) && enabled,
    staleTime: 10 * 1000,
    gcTime: 2 * 60 * 1000,
  })
}

export function useTableRows(
  starshipId: string,
  tableId: string,
  limit: number,
  offset: number,
  search: string | undefined,
  enabled: boolean = true,
  filters?: TableRowFilter[]
) {
  return useQuery({
    queryKey: TABLE_QUERY_KEYS.rows(starshipId, tableId, limit, offset, 'refs', search, filters),
    queryFn: async (): Promise<StarshipTableRowsPageResponse> => {
      const response: FetchResponse<ApiResponse<StarshipTableRowsPageResponse>> = await api.get(
        `/api/v1/starships/${starshipId}/tables/${tableId}/rows`,
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
    enabled: Boolean(starshipId) && Boolean(tableId) && enabled,
    staleTime: 5 * 1000,
    gcTime: 2 * 60 * 1000,
  })
}

export function useCreateTable(starshipId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: Omit<CreateStarshipTableRequest, 'starshipId'>): Promise<StarshipTableModel> => {
      const response: FetchResponse<ApiResponse<StarshipTableDetailsResponse>> = await api.post(
        `/api/v1/starships/${starshipId}/tables`,
        payload
      )
      return response.data.data.table
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TABLE_QUERY_KEYS.byStarship(starshipId) })
    },
  })
}

export function useUpdateTable(starshipId: string, tableId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (updates: UpdateStarshipTableRequest): Promise<StarshipTableModel> => {
      const response: FetchResponse<ApiResponse<StarshipTableDetailsResponse>> = await api.patch(
        `/api/v1/starships/${starshipId}/tables/${tableId}`,
        updates
      )
      return response.data.data.table
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TABLE_QUERY_KEYS.byStarship(starshipId) })
      queryClient.invalidateQueries({ queryKey: TABLE_QUERY_KEYS.byId(starshipId, tableId) })
    },
  })
}

export function useArchiveTable(starshipId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (tableIdOrSlug: string): Promise<StarshipTableModel> => {
      const id = encodeURIComponent(String(tableIdOrSlug || '').trim())
      const response: FetchResponse<ApiResponse<StarshipTableDetailsResponse>> = await api.post(
        `/api/v1/starships/${starshipId}/tables/${id}/archive`,
        {}
      )
      return response.data.data.table
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TABLE_QUERY_KEYS.byStarship(starshipId) })
    },
  })
}

export function useHardDeleteTable(starshipId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (tableIdOrSlug: string): Promise<void> => {
      const id = encodeURIComponent(String(tableIdOrSlug || '').trim())
      await api.delete(`/api/v1/starships/${starshipId}/tables/${id}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TABLE_QUERY_KEYS.byStarship(starshipId) })
    },
  })
}

export function useUpsertTableRows(starshipId: string, tableId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: UpsertStarshipTableRowsRequest): Promise<UpsertStarshipTableRowsResponse> => {
      const response: FetchResponse<ApiResponse<UpsertStarshipTableRowsResponse>> = await api.post(
        `/api/v1/starships/${starshipId}/tables/${tableId}/rows:upsert`,
        payload
      )
      return response.data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TABLE_QUERY_KEYS.byId(starshipId, tableId) })
      queryClient.invalidateQueries({ queryKey: [...TABLE_QUERY_KEYS.byId(starshipId, tableId), 'rows'] as const })
    },
  })
}

export function useDeleteTableRow(starshipId: string, tableId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (rowKey: string): Promise<void> => {
      const rk = encodeURIComponent(String(rowKey || '').trim())
      if (!rk) return
      await api.delete(`/api/v1/starships/${starshipId}/tables/${tableId}/rows/${rk}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TABLE_QUERY_KEYS.byId(starshipId, tableId) })
      queryClient.invalidateQueries({ queryKey: [...TABLE_QUERY_KEYS.byId(starshipId, tableId), 'rows'] as const })
    },
  })
}
