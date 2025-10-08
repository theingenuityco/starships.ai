import api from '@/lib/api'
import type { FetchResponse } from '@/lib/types'
import type { ApiResponse, WalletModel } from '@starships/protocol'
import { useQuery } from '@tanstack/react-query'

export const WALLET_QUERY_KEYS = {
  detail: (starshipId: string) => ['wallet', starshipId] as const,
} as const

export function useWallet(starshipId: string, enabled: boolean = true) {
  return useQuery({
    queryKey: WALLET_QUERY_KEYS.detail(starshipId),
    queryFn: async (): Promise<WalletModel> => {
      const response: FetchResponse<ApiResponse<WalletModel>> = await api.get(`/api/v1/wallets/${starshipId}`)
      return response.data.data
    },
    enabled: !!starshipId && enabled,
    staleTime: 5 * 1000, // Reduced to 5s for more real-time balance checking
    gcTime: 30 * 1000, // Reduced cache time for responsive updates
    refetchInterval: 10 * 1000, // Poll every 10s for balance updates during active usage
  })
}
