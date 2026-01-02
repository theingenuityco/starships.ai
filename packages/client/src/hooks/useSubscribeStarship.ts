import api from '@/lib/api'
import type { ApiResponse } from '@starships/protocol'
import { useMutation } from '@tanstack/react-query'
import type { FetchResponse } from '@/lib/types'

export const SUBSCRIBE_STARSHIP_MUTATION_KEYS = {
  create: (starshipId: string) => ['subscribe-starship', starshipId] as const,
} as const

export function useSubscribeStarship() {
  return useMutation({
    mutationFn: async ({
      starshipId,
      priceId,
    }: {
      starshipId: string
      priceId: string
    }): Promise<{ mode: 'checkout' | 'updated'; checkoutUrl?: string }> => {
      const response: FetchResponse<ApiResponse<{ mode: 'checkout' | 'updated'; checkoutUrl?: string }>> = await api.post(
        `/api/v1/starships/${starshipId}/subscription/change`,
        {
        priceId,
        }
      )
      return response.data.data
    },
  })
}


