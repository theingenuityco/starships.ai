'use client'

import api from '@/lib/api'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { ApiResponse } from '@starships/protocol'
import { AUTH_QUERY_KEYS, type AuthUser } from '@/hooks/useAuth'

export function useOnboardingChatStart() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: { starshipName?: string }): Promise<{
      starship: { id: string; slug: string; name: string }
      ariaAgent: { id: string; slug: string; name: string }
      conversation: { id: string; title: string }
    }> => {
      const res = await api.post<ApiResponse<any>>('/api/v1/onboarding/chat/start', payload)
      return res.data.data
    },
    onSuccess: async () => {
      // The server treats `onboardingCompleted` as "initial provisioning complete" (starship exists).
      // If we don't update the auth cache here, the client can get stuck in a redirect loop for up to
      // the auth query staleTime.
      queryClient.setQueryData<AuthUser | null>(AUTH_QUERY_KEYS.me(), prev => (prev ? { ...prev, onboardingCompleted: true } : prev))
      await queryClient.invalidateQueries({ queryKey: AUTH_QUERY_KEYS.me() })
    },
  })
}

