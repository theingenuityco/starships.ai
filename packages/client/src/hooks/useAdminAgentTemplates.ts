'use client'

import api from '@/lib/api'
import type { ApiResponse } from '@starships/protocol'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { FetchResponse } from '@/lib/types'
import { toast } from 'sonner'

export const ADMIN_AGENT_TEMPLATE_QUERY_KEYS = {
  all: ['admin', 'agent-templates'] as const,
  marketingJob: (jobId: string) => [...ADMIN_AGENT_TEMPLATE_QUERY_KEYS.all, 'marketing-job', jobId] as const,
} as const

export type AgentTemplateMarketingJobStepStatus = 'pending' | 'running' | 'completed' | 'failed'
export type AgentTemplateMarketingJobStatus = 'running' | 'completed' | 'failed'

export type AgentTemplateMarketingJob = {
  id: string
  templateId: string
  startedByUserId: string
  status: AgentTemplateMarketingJobStatus
  createdAt: string
  updatedAt: string
  steps: Array<{
    key: string
    label: string
    status: AgentTemplateMarketingJobStepStatus
    startedAt?: string
    endedAt?: string
    error?: string
  }>
  result?: {
    templateId: string
    marketingContent: {
      avatarUrl?: string
      problemStatementsText?: string[]
      problemStatementsImageUrl?: string
      capabilitiesImageUrl?: string
      tryThesePromptsImageUrl?: string
    }
  }
  error?: string
}

/**
 * Generate marketing content for an agent template (instance admin only).
 * This powers the public marketplace agent marketing pages.
 */
export function useGenerateAgentTemplateMarketingContent() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (templateId: string): Promise<{ jobId: string; job: AgentTemplateMarketingJob }> => {
      const response: FetchResponse<ApiResponse<{
        jobId: string
        job: AgentTemplateMarketingJob
      }>> = await api.post(`/api/v1/admin/agent-templates/${templateId}/marketing/generate`)
      return response.data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ADMIN_AGENT_TEMPLATE_QUERY_KEYS.all })
      toast.success('Started marketing generation')
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

export function useAgentTemplateMarketingJob(jobId?: string | null) {
  return useQuery({
    queryKey: jobId ? ADMIN_AGENT_TEMPLATE_QUERY_KEYS.marketingJob(String(jobId)) : [...ADMIN_AGENT_TEMPLATE_QUERY_KEYS.all, 'marketing-job', 'none'],
    enabled: !!jobId,
    queryFn: async (): Promise<AgentTemplateMarketingJob> => {
      const response: FetchResponse<ApiResponse<AgentTemplateMarketingJob>> = await api.get(`/api/v1/admin/agent-templates/marketing/jobs/${jobId}`)
      return response.data.data
    },
    refetchInterval: query => {
      const status = (query.state.data as AgentTemplateMarketingJob | undefined)?.status
      return status === 'running' ? 1000 : false
    },
    staleTime: 250,
    gcTime: 5 * 60 * 1000,
  })
}

export function useRevalidateMarketplaceMarketingCaches() {
  return useMutation({
    mutationFn: async (templateId: string): Promise<{ ok: true }> => {
      const response: FetchResponse<ApiResponse<{ ok: true }>> = await api.post(`/api/v1/admin/agent-templates/${templateId}/marketing/revalidate`)
      return response.data.data
    },
    onSuccess: () => {
      toast.success('Revalidated marketplace cache')
    },
    onError: (error: unknown) => {
      const err = error as { response?: { data?: { error?: string } }; message?: string }
      const message = err?.response?.data?.error || err?.message || 'Failed to revalidate marketplace cache'
      toast.error('Failed to revalidate marketplace cache', { description: message })
    },
  })
}

