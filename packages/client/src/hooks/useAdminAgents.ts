'use client'

import api from '@/lib/api'
import type { AgentModel, ApiResponse } from '@starships/protocol'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { FetchResponse } from '@/lib/types'
import { toast } from 'sonner'
import { AGENT_QUERY_KEYS } from './useAgents'
import { formatAgentDisplayName } from '@/lib/agentDisplay'

export const ADMIN_AGENT_QUERY_KEYS = {
  all: ['admin', 'agents'] as const,
} as const

/**
 * Generate marketing content for an agent (instance admin only).
 * This is decoupled from publication/publishing.
 */
export function useGenerateAgentMarketingContent() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (agentId: string): Promise<{
      agent: AgentModel
      marketingContent: {
        avatarUrl?: string
        problemStatementsText?: string[]
        problemStatementsImageUrl?: string
        capabilitiesImageUrl?: string
        tryThesePromptsImageUrl?: string
      }
    }> => {
      const response: FetchResponse<ApiResponse<{
        agent: AgentModel
        marketingContent: {
          avatarUrl?: string
          problemStatementsText?: string[]
          problemStatementsImageUrl?: string
          capabilitiesImageUrl?: string
          tryThesePromptsImageUrl?: string
        }
      }>> = await api.post(`/api/v1/admin/agents/${agentId}/marketing/generate`)
      return response.data.data
    },
    onSuccess: result => {
      queryClient.invalidateQueries({ queryKey: ADMIN_AGENT_QUERY_KEYS.all })
      queryClient.invalidateQueries({ queryKey: AGENT_QUERY_KEYS.detail(result.agent.id) })
      toast.success('Marketing content generated')
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


/**
 * Prepare publication: Generate missing marketing content (instance admin only).
 */
export function usePrepareAgentPublication() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (agentId: string): Promise<{
      agent: AgentModel
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
        agent: AgentModel
        templateId: string
        marketingContent: {
          avatarUrl?: string
          problemStatementsText?: string[]
          problemStatementsImageUrl?: string
          capabilitiesImageUrl?: string
          tryThesePromptsImageUrl?: string
        }
      }>> = await api.post(`/api/v1/agents/${agentId}/publication/prepare`)
      return response.data.data
    },
    onSuccess: result => {
      queryClient.invalidateQueries({ queryKey: ADMIN_AGENT_QUERY_KEYS.all })
      queryClient.invalidateQueries({ queryKey: AGENT_QUERY_KEYS.detail(result.agent.id) })
    },
    onError: (error: unknown) => {
      const err = error as { response?: { data?: { error?: string } }; message?: string }
      const message = err?.response?.data?.error || err?.message || 'Failed to prepare publication'
      toast.error('Failed to prepare publication', {
        description: message,
      })
    },
  })
}

/**
 * Regenerate specific marketing content item (instance admin only).
 */
export function useRegenerateMarketingContent() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: {
      agentId: string
      templateId: string
      type: 'avatar' | 'problem_statements_text' | 'problem_statements_image' | 'capabilities_image' | 'try_these_prompts_image'
    }): Promise<{
      agent: AgentModel
      marketingContent: {
        avatarUrl?: string
        problemStatementsText?: string[]
        problemStatementsImageUrl?: string
        capabilitiesImageUrl?: string
        tryThesePromptsImageUrl?: string
      }
    }> => {
      const response: FetchResponse<ApiResponse<{
        agent: AgentModel
        marketingContent: {
          avatarUrl?: string
          problemStatementsText?: string[]
          problemStatementsImageUrl?: string
          capabilitiesImageUrl?: string
          tryThesePromptsImageUrl?: string
        }
      }>> = await api.post(`/api/v1/agents/${input.agentId}/publication/regenerate`, {
        templateId: input.templateId,
        type: input.type,
      })
      return response.data.data
    },
    onSuccess: result => {
      queryClient.invalidateQueries({ queryKey: ADMIN_AGENT_QUERY_KEYS.all })
      queryClient.invalidateQueries({ queryKey: AGENT_QUERY_KEYS.detail(result.agent.id) })
      toast.success('Marketing content regenerated')
    },
    onError: (error: unknown) => {
      const err = error as { response?: { data?: { error?: string } }; message?: string }
      const message = err?.response?.data?.error || err?.message || 'Failed to regenerate content'
      toast.error('Failed to regenerate content', {
        description: message,
      })
    },
  })
}

/**
 * Update problem statements (instance admin only).
 */
export function useUpdateProblemStatements() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: {
      agentId: string
      templateId: string
      statements: string[]
    }): Promise<{ problemStatementsText: string[] }> => {
      const response: FetchResponse<ApiResponse<{ problemStatementsText: string[] }>> = await api.put(
        `/api/v1/agents/${input.agentId}/publication/problem-statements`,
        {
          templateId: input.templateId,
          statements: input.statements,
        }
      )
      return response.data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ADMIN_AGENT_QUERY_KEYS.all })
      toast.success('Problem statements updated')
    },
    onError: (error: unknown) => {
      const err = error as { response?: { data?: { error?: string } }; message?: string }
      const message = err?.response?.data?.error || err?.message || 'Failed to update problem statements'
      toast.error('Failed to update problem statements', {
        description: message,
      })
    },
  })
}

/**
 * Confirm publication: Final publish step (instance admin only).
 */
export function useConfirmAgentPublication() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (agentId: string): Promise<AgentModel> => {
      const response: FetchResponse<ApiResponse<{ message: string; agent: AgentModel }>> = await api.post(
        `/api/v1/agents/${agentId}/publication/confirm`
      )
      return response.data.data.agent
    },
    onSuccess: agent => {
      queryClient.invalidateQueries({ queryKey: ADMIN_AGENT_QUERY_KEYS.all })
      queryClient.invalidateQueries({ queryKey: AGENT_QUERY_KEYS.detail(agent.id) })

      toast.success('Agent publication confirmed', {
        description: `${formatAgentDisplayName(agent)} is now published and available as a template.`,
      })
    },
    onError: (error: unknown) => {
      const err = error as { response?: { data?: { error?: string } }; message?: string }
      const message = err?.response?.data?.error || err?.message || 'Failed to confirm publication'
      toast.error('Failed to confirm publication', {
        description: message,
      })
    },
  })
}

/**
 * Approve agent publication (instance admin only) - Legacy endpoint, now uses two-step flow.
 */
export function useApproveAgentPublication() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (agentId: string): Promise<AgentModel> => {
      const response: FetchResponse<ApiResponse<{ message: string; agent: AgentModel }>> = await api.post(`/api/v1/admin/agents/${agentId}/approve`)
      return response.data.data.agent
    },
    onSuccess: agent => {
      // Invalidate pending list and agent details
      queryClient.invalidateQueries({ queryKey: ADMIN_AGENT_QUERY_KEYS.all })
      queryClient.invalidateQueries({ queryKey: AGENT_QUERY_KEYS.detail(agent.id) })

      toast.success('Agent publication approved', {
        description: `${formatAgentDisplayName(agent)} is now published and available as a template.`,
      })
    },
    onError: (error: unknown) => {
      const err = error as { response?: { data?: { error?: string } }; message?: string }
      const message = err?.response?.data?.error || err?.message || 'Failed to approve agent'
      toast.error('Failed to approve agent', {
        description: message,
      })
    },
  })
}

/**
 * Reject agent publication (instance admin only).
 */
export function useRejectAgentPublication() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (agentId: string): Promise<AgentModel> => {
      const response: FetchResponse<ApiResponse<{ message: string; agent: AgentModel }>> = await api.post(`/api/v1/admin/agents/${agentId}/reject`)
      return response.data.data.agent
    },
    onSuccess: agent => {
      // Invalidate pending list and agent details
      queryClient.invalidateQueries({ queryKey: ADMIN_AGENT_QUERY_KEYS.all })
      queryClient.invalidateQueries({ queryKey: AGENT_QUERY_KEYS.detail(agent.id) })

      toast.success('Agent publication rejected', {
        description: `${formatAgentDisplayName(agent)} has been moved back to draft.`,
      })
    },
    onError: (error: unknown) => {
      const err = error as { response?: { data?: { error?: string } }; message?: string }
      const message = err?.response?.data?.error || err?.message || 'Failed to reject agent'
      toast.error('Failed to reject agent', {
        description: message,
      })
    },
  })
}
