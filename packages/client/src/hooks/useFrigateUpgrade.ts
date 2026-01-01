import api from '@/lib/api'
import type { ApiResponse } from '@starships/protocol'
import { useMutation } from '@tanstack/react-query'
import type { FetchResponse } from '@/lib/types'

export const FRIGATE_UPGRADE_MUTATION_KEYS = {
  checkout: (starshipId: string) => ['frigate-upgrade', 'checkout', starshipId] as const,
} as const

export function useFrigateUpgradeCheckout() {
  return useMutation({
    mutationFn: async ({ starshipId }: { starshipId: string }): Promise<{ checkoutUrl: string }> => {
      const response: FetchResponse<ApiResponse<{ checkoutUrl: string }>> = await api.post(`/api/v1/starships/${starshipId}/upgrade/frigate`, {})
      return response.data.data
    },
  })
}


