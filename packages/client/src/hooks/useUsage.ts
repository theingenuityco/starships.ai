import api from '@/lib/api'
import { useQuery } from '@tanstack/react-query'
import type { ApiResponse } from '@starships/protocol'

type UsageTotals = {
  promptTokens: number
  completionTokens: number
  totalTokens: number
  cost: number
}

export const USAGE_QUERY_KEYS = {
  conversationTotals: (conversationId: string) => ['usage', 'conversation', conversationId, 'totals'] as const,
  starshipTotals: (starshipId: string) => ['usage', 'starship', starshipId, 'totals'] as const,
} as const

export function useConversationUsageTotals(conversationId: string | null) {
  return useQuery({
    queryKey: conversationId ? USAGE_QUERY_KEYS.conversationTotals(conversationId) : ['__noop__'],
    queryFn: async (): Promise<UsageTotals> => {
      const res = await api.get<ApiResponse<UsageTotals>>(`/api/v1/conversations/${conversationId}/usage/totals`)
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
    queryFn: async (): Promise<UsageTotals> => {
      const res = await api.get<ApiResponse<UsageTotals>>(`/api/v1/starships/${starshipId}/usage/totals`)
      return res.data.data
    },
    enabled: !!starshipId,
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
  })
}
