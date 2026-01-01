import api from '@/lib/api'
import type { ApiResponse } from '@starships/protocol'
import { useMutation } from '@tanstack/react-query'
import type { FetchResponse } from '@/lib/types'

export const CANCEL_DOWNGRADE_STARSHIP_MUTATION_KEYS = {
  cancel: (starshipId: string) => ['cancel-downgrade-starship', starshipId] as const,
} as const

export function useCancelDowngradeStarship() {
  return useMutation({
    mutationFn: async ({ starshipId }: { starshipId: string }): Promise<{ ok: true }> => {
      const response: FetchResponse<ApiResponse<{ ok: true }>> = await api.post(`/api/v1/starships/${starshipId}/subscription/cancel-downgrade`)
      return response.data.data
    },
  })
}


