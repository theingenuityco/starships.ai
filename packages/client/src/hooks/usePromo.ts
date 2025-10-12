import api from '@/lib/api'
import type { FetchResponse } from '@/lib/types'
import type { ApiResponse } from '@starships/protocol'

interface RedeemPromoRequest {
  code: string
  starshipId: string
}
interface RedeemPromoResponse {
  message: string
  newBalance: string
}
import { useMutation } from '@tanstack/react-query'

export const PROMO_MUTATION_KEYS = {
  redeem: (starshipId: string) => ['promo', 'redeem', starshipId] as const,
} as const

export function usePromoRedeem() {
  return useMutation({
    mutationFn: async ({ code, starshipId }: RedeemPromoRequest): Promise<RedeemPromoResponse> => {
      try {
        const response: FetchResponse<ApiResponse<RedeemPromoResponse>> = await api.post('/api/v1/promo/redeem', {
          code,
          starshipId,
        })
        return response.data.data
      } catch (err: any) {
        // Re-throw so the form can map error codes nicely
        throw err
      }
    },
  })
}
