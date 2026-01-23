'use client'

import api from '@/lib/api'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { ApiResponse } from '@starships/protocol'
import { CONVERSATION_QUERY_KEYS } from '@/hooks/useConversations'

export function useOnboardingChatSkip() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: { conversationId: string }): Promise<{ conversationId: string }> => {
      const res = await api.post<ApiResponse<{ conversationId: string }>>('/api/v1/onboarding/chat/skip', payload)
      return res.data.data
    },
    onSuccess: async (data, variables) => {
      const id = String(data?.conversationId || variables?.conversationId || '')
      if (id) {
        await queryClient.invalidateQueries({ queryKey: CONVERSATION_QUERY_KEYS.detail(id) })
      }
      // Starship-level nav + list styling can depend on conversation.state, so refresh all conversation queries.
      await queryClient.invalidateQueries({ queryKey: CONVERSATION_QUERY_KEYS.all })
    },
  })
}

