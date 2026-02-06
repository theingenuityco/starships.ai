'use client'

import api from '@/lib/api'
import type { ApiResponse } from '@starships/protocol'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { FetchResponse } from '@/lib/types'
import { toast } from 'sonner'

export const ADMIN_AGENT_TEMPLATE_QUERY_KEYS = {
  all: ['admin', 'agent-templates'] as const,
} as const

/**
 * Generate marketing content for an agent template (instance admin only).
 * This powers the public marketplace agent marketing pages.
 */
export function useGenerateAgentTemplateMarketingContent() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (templateId: string): Promise<{
      templateId: string
      marketingContent: {
        avatarUrl?: string
        problemStatementsText?: string[]
        problemStatementsImageUrl?: string
        capabilitiesImageUrl?: string
        tryThesePromptsImageUrl?: string
      }
    }> => {
      const response: FetchResponse<ApiResponse<{
        templateId: string
        marketingContent: {
          avatarUrl?: string
          problemStatementsText?: string[]
          problemStatementsImageUrl?: string
          capabilitiesImageUrl?: string
          tryThesePromptsImageUrl?: string
        }
      }>> = await api.post(`/api/v1/admin/agent-templates/${templateId}/marketing/generate`)
      return response.data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ADMIN_AGENT_TEMPLATE_QUERY_KEYS.all })
      toast.success('Marketplace marketing content generated')
    },
    onError: (error: unknown) => {
      const err = error as { response?: { data?: { error?: string } }; message?: string }
      const message = err?.response?.data?.error || err?.message || 'Failed to generate marketing content'
      toast.error('Failed to generate marketing content', {
        description: message,
      })
    },
  })
}

