import api from '@/lib/api'
import { useQuery } from '@tanstack/react-query'
import type { ApiResponse, LLMUsage } from '@starships/protocol'
export const USAGE_QUERY_KEYS = {
  conversationTotals: (conversationId: string) => ['usage', 'conversation', conversationId, 'totals'] as const,
  starshipTotals: (starshipId: string) => ['usage', 'starship', starshipId, 'totals'] as const,
  userTotals: (userId: string) => ['usage', 'user', userId, 'totals'] as const,
} as const

// Local client-side types (avoid build-order issues with protocol dist)
export interface UserUsageTotals {
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
