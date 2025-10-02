import api from '@/lib/api'
import { useQuery } from '@tanstack/react-query'
import type { ApiResponse, LLMUsage, UsageModel, PaginationMeta } from '@starships/protocol'
export const USAGE_QUERY_KEYS = {
  conversationTotals: (conversationId: string) => ['usage', 'conversation', conversationId, 'totals'] as const,
  starshipTotals: (starshipId: string) => ['usage', 'starship', starshipId, 'totals'] as const,
  userTotals: (userId: string) => ['usage', 'user', userId, 'totals'] as const,
  userList: (userId: string, page: number, limit: number, day?: string, model?: string, order?: 'ASC' | 'DESC') =>
    ['usage', 'user', userId, 'list', { page, limit, day: day || null, model: model || null, order: order || 'DESC' }] as const,
  userDaily: (userId: string, page: number, limit: number, order?: 'ASC' | 'DESC') => ['usage', 'user', userId, 'daily', { page, limit, order: order || 'DESC' }] as const,
  userDailyModel: (userId: string, page: number, limit: number, order?: 'ASC' | 'DESC') => ['usage', 'user', userId, 'daily-model', { page, limit, order: order || 'DESC' }] as const,
} as const

// Local client-side types (avoid build-order issues with protocol dist)
export interface UserUsageTotals {
  totals: LLMUsage
  requestCount: number
}

/**
 * Local shapes to avoid cross-package build-order issues
 */
export interface DailyUsageRow {
  day: string
  totals: LLMUsage
  requestCount: number
}

export interface DailyModelUsageRow {
  day: string
  model: string | null
  totals: LLMUsage
  requestCount: number
}

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
 * Get aggregate usage totals across all starships for a user
 */
export function useUserUsageTotals(userId: string | null) {
  return useQuery({
    queryKey: userId ? USAGE_QUERY_KEYS.userTotals(userId) : ['__noop__'],
    queryFn: async (): Promise<UserUsageTotals> => {
      const res = await api.get<ApiResponse<UserUsageTotals>>(`/api/v1/users/${userId}/usage/totals`)
      return res.data.data
    },
    enabled: !!userId,
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
  })
}

/**
 * Paginated daily aggregate usage list
 */
export interface DailyUsageListResult {
  records: DailyUsageRow[]
  pagination: PaginationMeta
}

export function useUserDailyUsageList(userId: string | null, opts?: { page?: number; limit?: number; order?: 'ASC' | 'DESC' }) {
  const page = opts?.page ?? 1
  const limit = opts?.limit ?? 20
  const order = opts?.order ?? 'DESC'

  return useQuery({
    queryKey: userId ? USAGE_QUERY_KEYS.userDaily(userId, page, limit, order) : ['__noop__'],
    queryFn: async (): Promise<DailyUsageListResult> => {
      const res = await api.get<ApiResponse<DailyUsageRow[]>>(`/api/v1/users/${userId}/usage/daily`, {
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
    enabled: !!userId,
    staleTime: 10 * 1000,
    gcTime: 60 * 1000,
  })
}

/**
 * Paginated daily+model aggregate usage list
 */
export interface DailyModelUsageListResult {
  records: DailyModelUsageRow[]
  pagination: PaginationMeta
}

export function useUserDailyModelUsageList(userId: string | null, opts?: { page?: number; limit?: number; order?: 'ASC' | 'DESC' }) {
  const page = opts?.page ?? 1
  const limit = opts?.limit ?? 20
  const order = opts?.order ?? 'DESC'

  return useQuery({
    queryKey: userId ? USAGE_QUERY_KEYS.userDailyModel(userId, page, limit, order) : ['__noop__'],
    queryFn: async (): Promise<DailyModelUsageListResult> => {
      const res = await api.get<ApiResponse<DailyModelUsageRow[]>>(`/api/v1/users/${userId}/usage/daily-model`, {
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
    enabled: !!userId,
    staleTime: 10 * 1000,
    gcTime: 60 * 1000,
  })
}

/**
 * Paginated usage list for a user with optional filters
 */
export interface UsageListResult {
  records: UsageModel[]
  pagination: PaginationMeta
}

export function useUserUsageList(userId: string | null, opts?: { page?: number; limit?: number; day?: string; model?: string; order?: 'ASC' | 'DESC' }) {
  const page = opts?.page ?? 1
  const limit = opts?.limit ?? 20
  const day = opts?.day
  const model = opts?.model
  const order = opts?.order ?? 'DESC'

  return useQuery({
    queryKey: userId ? USAGE_QUERY_KEYS.userList(userId, page, limit, day, model, order) : ['__noop__'],
    queryFn: async (): Promise<UsageListResult> => {
      const res = await api.get<ApiResponse<UsageModel[]>>(`/api/v1/users/${userId}/usage`, {
        params: { page, limit, day, model, order },
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
    enabled: !!userId,
    staleTime: 10 * 1000,
    gcTime: 60 * 1000,
  })
}
