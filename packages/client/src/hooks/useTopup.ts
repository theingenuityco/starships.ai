import api from '@/lib/api'
import type { FetchResponse } from '@/lib/types'
import type { ApiResponse, CreateTopupResponse } from '@starships/protocol'
import { useMutation } from '@tanstack/react-query'

export const TOPUP_MUTATION_KEYS = {
  create: (starshipId: string) => ['topup', 'create', starshipId] as const,
} as const

export function useTopup() {
  return useMutation({
    mutationFn: async ({ starshipId, amountUsd, walletId }: { starshipId: string; amountUsd: number; walletId: string }): Promise<CreateTopupResponse> => {
      const response: FetchResponse<ApiResponse<CreateTopupResponse>> = await api.post(`/api/v1/wallets/${starshipId}/topup`, {
        amount_usd: amountUsd,
        walletId,
      })
      return response.data.data
    },
  })
}
