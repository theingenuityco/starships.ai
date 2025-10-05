import api from '@/lib/api'
import { useQuery } from '@tanstack/react-query'
import type { ApiResponse, LLMUsage, UsageModel, PaginationMeta, DailyUsageRow, DailyModelUsageRow } from '@starships/protocol'
export const USAGE_QUERY_KEYS = {
  conversationTotals: (conversationId: string) => ['usage', 'conversation', conversationId, 'totals'] as const,
  starshipTotals: (starshipId: string) => ['usage', 'starship', starshipId, 'totals'] as const,
  starshipTotalsWithCount: (starshipId: string) => ['usage', 'starship', starshipId, 'totals-with-count'] as const,
} as const

export function useConversationUsageTotals(conversationId: string | null) {
  return useQuery({
    queryKey: conversationId ? USAGE_QUERY_KEYS.conversationTotals(conversationId) : ['__noop__'],
    queryFn: async (): Promise<LLMUsage> => {
      const res = await api.get<ApiResponse<LLMUsage>>(`/api/v1/conversations/${conversationId}/usage/totals`)
      return res.data.data
    },
    enabled: !!conversationId,
    staleTime: 0,
    gcTime: 2 * 60 * 1000,
  })
}

export function useStarshipUsageTotals(starshipId: string | null) {
  return useQuery({
    queryKey: starshipId ? USAGE_QUERY_KEYS.starshipTotals(starshipId) : ['__noop__'],
    queryFn: async (): Promise<LLMUsage> => {
      const res = await api.get<ApiResponse<LLMUsage>>(`/api/v1/starships/${starshipId}/usage/totals`)
      return res.data.data
    },
    enabled: !!starshipId,
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
  })
}

/**
 * Paginated daily aggregate usage list for a starship
 */
export interface StarshipDailyUsageListResult {
  records: DailyUsageRow[]
  pagination: PaginationMeta
}

export function useStarshipDailyUsageList(starshipId: string | null, opts?: { page?: number; limit?: number; order?: 'ASC' | 'DESC' }) {
  const page = opts?.page ?? 1
  const limit = opts?.limit ?? 20
  const order = opts?.order ?? 'DESC'

  return useQuery({
    queryKey: starshipId ? ['usage', 'starship', starshipId, 'daily', { page, limit, order }] : ['__noop__'],
    queryFn: async (): Promise<StarshipDailyUsageListResult> => {
      const res = await api.get<ApiResponse<DailyUsageRow[]>>(`/api/v1/starships/${starshipId}/usage/daily`, {
        params: { page, limit, order },
      })
      const data = res.data.data
      const meta = (res.data.meta?.pagination as PaginationMeta | undefined) || {
        page,
        limit,
        total: data.length,
        has_next: false,
        has_prev: page > 1,
      }
      return { records: data, pagination: meta }
    },
    enabled: !!starshipId,
    staleTime: 10 * 1000,
    gcTime: 60 * 1000,
  })
}

/**
 * Paginated daily+model aggregate usage list for a starship
 */
export interface StarshipDailyModelUsageListResult {
  records: DailyModelUsageRow[]
  pagination: PaginationMeta
}

export function useStarshipDailyModelUsageList(starshipId: string | null, opts?: { page?: number; limit?: number; order?: 'ASC' | 'DESC' }) {
  const page = opts?.page ?? 1
  const limit = opts?.limit ?? 20
  const order = opts?.order ?? 'DESC'

  return useQuery({
    queryKey: starshipId ? ['usage', 'starship', starshipId, 'daily-model', { page, limit, order }] : ['__noop__'],
    queryFn: async (): Promise<StarshipDailyModelUsageListResult> => {
      const res = await api.get<ApiResponse<DailyModelUsageRow[]>>(`/api/v1/starships/${starshipId}/usage/daily-model`, {
        params: { page, limit, order },
      })
      const data = res.data.data
      const meta = (res.data.meta?.pagination as PaginationMeta | undefined) || {
        page,
        limit,
        total: data.length,
        has_next: false,
        has_prev: page > 1,
      }
      return { records: data, pagination: meta }
    },
    enabled: !!starshipId,
    staleTime: 10 * 1000,
    gcTime: 60 * 1000,
  })
}
