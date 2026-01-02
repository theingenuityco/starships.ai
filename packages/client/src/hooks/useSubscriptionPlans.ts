import api from '@/lib/api'
import type { ApiResponse } from '@starships/protocol'
import { useQuery } from '@tanstack/react-query'
import type { FetchResponse } from '@/lib/types'

export interface SubscriptionPlan {
  priceId: string
  productId?: string
  shipClass: string
  displayName: string
  description?: string
  currency: string
  unitAmount: number | null
  interval: string | null
  entitlements: {
    maxAgents: number
    maxConcurrentTurns: number
    monthlyCredits: number
  }
}

export const SUBSCRIPTION_PLANS_QUERY_KEYS = {
  all: ['subscription-plans'] as const,
} as const

export function useSubscriptionPlans(enabled: boolean = true) {
  return useQuery({
    queryKey: SUBSCRIPTION_PLANS_QUERY_KEYS.all,
    queryFn: async (): Promise<SubscriptionPlan[]> => {
      const response: FetchResponse<ApiResponse<{ plans: SubscriptionPlan[] }>> = await api.get('/api/v1/subscriptions/plans')
      return response.data.data.plans
    },
    enabled,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  })
}


