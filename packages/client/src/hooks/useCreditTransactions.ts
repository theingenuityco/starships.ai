import { useQuery } from '@tanstack/react-query'
import api from '@/lib/api'
import { useAuth } from './useAuth'

export function useCreditTransactions(userId?: string | null, options?: { limit?: number; page?: number }) {
  const { userId: currentUserId } = useAuth()
  const targetUserId = userId || currentUserId

  return useQuery({
    queryKey: ['credit-transactions', targetUserId, options?.limit, options?.page],
    queryFn: async () => {
      if (!targetUserId) throw new Error('User ID required')
      const response = await api.get(`/api/v1/users/${targetUserId}/credits/transactions`, {
        params: {
          limit: options?.limit || 20,
          page: options?.page || 1,
        },
      })
      return response.data.data
    },
    enabled: !!targetUserId,
    staleTime: 60000, // 1 minute
    gcTime: 10 * 60 * 1000, // 10 minutes
  })
}

export default useCreditTransactions
