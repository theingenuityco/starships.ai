'use client'

import api from '@/lib/api'
import { useMutation } from '@tanstack/react-query'
import type { ApiResponse } from '@starships/protocol'

export function useOnboardingChatStart() {
  return useMutation({
    mutationFn: async (payload: { starshipName?: string }): Promise<{
      starship: { id: string; slug: string; name: string }
      ariaAgent: { id: string; slug: string; name: string }
      conversation: { id: string; title: string }
    }> => {
      const res = await api.post<ApiResponse<any>>('/api/v1/onboarding/chat/start', payload)
      return res.data.data
    },
  })
}

