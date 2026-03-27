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
  mode: (mode: 'authenticated' | 'public') => [...SUBSCRIPTION_PLANS_QUERY_KEYS.all, mode] as const,
} as const

export function useSubscriptionPlans(enabled: boolean = true, options?: { publicAccess?: boolean }) {
  const publicAccess = Boolean(options?.publicAccess)
  return useQuery({
    queryKey: SUBSCRIPTION_PLANS_QUERY_KEYS.mode(publicAccess ? 'public' : 'authenticated'),
    queryFn: async (): Promise<SubscriptionPlan[]> => {
      const endpoint = publicAccess ? '/api/v1/subscriptions/public-plans' : '/api/v1/subscriptions/plans'
      const response: FetchResponse<ApiResponse<{ plans: SubscriptionPlan[] }>> = await api.get(endpoint)
      return response.data.data.plans
    },
    enabled,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  })
}


