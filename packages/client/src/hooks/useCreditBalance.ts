import { useQuery } from '@tanstack/react-query'
import api from '@/lib/api'
import { useAuth } from './useAuth'

export function useCreditBalance() {
  const { userId } = useAuth()

  return useQuery({
    queryKey: ['credit-balance', userId],
    queryFn: async () => {
      if (!userId) throw new Error('User not authenticated')
      const response = await api.get(`/api/v1/users/${userId}/credits/balance`)
      return response.data.data.balance
    },
    enabled: !!userId,
    staleTime: 30000, // 30 seconds
    gcTime: 5 * 60 * 1000, // 5 minutes
  })
}

export default useCreditBalance
