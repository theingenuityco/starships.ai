'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import api, { type FetchResponse } from '@/lib/api'
import type { ApiResponse } from '@starships/protocol'
import { AUTH_QUERY_KEYS } from './useAuth'

/**
 * Mark wizard onboarding as completed.
 * On success, invalidates auth/me so user state reflects wizardOnboardingCompleted.
 * Caller is responsible for redirect (e.g. router.push to ship or marketplace).
 */
export function useCompleteWizardOnboarding() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (): Promise<void> => {
      const response: FetchResponse<ApiResponse<unknown>> = await api.post('/api/v1/users/me/onboarding/wizard/complete')
      return response.data.data as void
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: AUTH_QUERY_KEYS.me() })
      await queryClient.refetchQueries({ queryKey: AUTH_QUERY_KEYS.me() })
    },
  })
}
