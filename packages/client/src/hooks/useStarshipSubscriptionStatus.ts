import api from '@/lib/api'
import type { ApiResponse, StarshipSubscriptionStatusResponse } from '@starships/protocol'
import { useQuery } from '@tanstack/react-query'
import type { FetchResponse } from '@/lib/types'

export const STARSHIP_SUBSCRIPTION_QUERY_KEYS = {
  all: ['starship-subscription'] as const,
  status: (starshipId: string) => [...STARSHIP_SUBSCRIPTION_QUERY_KEYS.all, 'status', starshipId] as const,
} as const

export function useStarshipSubscriptionStatus(starshipId: string, enabled: boolean = true) {
  return useQuery({
    queryKey: STARSHIP_SUBSCRIPTION_QUERY_KEYS.status(starshipId),
    queryFn: async (): Promise<StarshipSubscriptionStatusResponse> => {
      const response: FetchResponse<ApiResponse<StarshipSubscriptionStatusResponse>> = await api.get(
        `/api/v1/starships/${starshipId}/subscription/status`
      )
      return response.data.data
    },
    enabled: Boolean(starshipId) && enabled,
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
  })
}


