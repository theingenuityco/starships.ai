'use client'

import api from '@/lib/api'
import type { AgentModel, ApiResponse, PendingAgentSummary as ProtocolPendingAgentSummary, ToolModel } from '@starships/protocol'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { FetchResponse } from '@/lib/types'
import { toast } from 'sonner'
import { AGENT_QUERY_KEYS } from './useAgents'

export interface PaginationMeta {
  page: number
  limit: number
  total: number
  has_next: boolean
  has_prev: boolean
}

export type PendingAgentSummary = ProtocolPendingAgentSummary & {
  requestedBy?: {
    id: string
    name?: string
    avatar?: string
  }
  requestedByStarship?: {
    id: string
    name?: string
    slug?: string
  }
}

export interface PendingAgentsResponse {
  agents: PendingAgentSummary[]
  pagination: PaginationMeta
}

export const ADMIN_AGENT_QUERY_KEYS = {
  all: ['admin', 'agents'] as const,
  pending: (page: number, limit: number) => [...ADMIN_AGENT_QUERY_KEYS.all, 'pending', { page, limit }] as const,
  pendingTools: (agentId: string) => [...ADMIN_AGENT_QUERY_KEYS.all, 'pending-tools', agentId] as const,
} as const

/**
 * Fetch agents that are pending publication approval (instance admin only).
 */
export function usePendingAgents(page: number = 1, limit: number = 20) {
  return useQuery({
    queryKey: ADMIN_AGENT_QUERY_KEYS.pending(page, limit),
    queryFn: async (): Promise<PendingAgentsResponse> => {
      const response: FetchResponse<ApiResponse<PendingAgentSummary[]>> = await api.get('/api/v1/admin/agents/pending', {
        params: { page, limit },
      })

      const agents = response.data.data
      const pagination = (response.data.meta?.pagination || {
        page,
        limit,
        total: agents.length,
        has_next: false,
        has_prev: page > 1,
      }) as PaginationMeta

      return { agents, pagination }
    },
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
  })
}

/**
 * Fetch tools that are pending publication for the given agent (instance admin only).
 * Only tools with publicationStatus === 'pending_approval' are returned.
 */
export function usePendingAgentTools(agentId?: string) {
  return useQuery({
    queryKey: agentId ? ADMIN_AGENT_QUERY_KEYS.pendingTools(agentId) : [...ADMIN_AGENT_QUERY_KEYS.all, 'pending-tools', 'none'],
    enabled: !!agentId,
    queryFn: async (): Promise<ToolModel[]> => {
      const response: FetchResponse<ApiResponse<ToolModel[]>> = await api.get(`/api/v1/admin/agents/${agentId}/tools`)
      return response.data.data || []
    },
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
  })
}

/**
 * Approve agent publication (instance admin only).
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
        description: `${agent.name} is now published and available as a template.`,
      })
    },
    onError: (error: any) => {
      const message = error?.response?.data?.error || error?.message || 'Failed to approve agent'
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
        description: `${agent.name} has been moved back to draft.`,
      })
    },
    onError: (error: any) => {
      const message = error?.response?.data?.error || error?.message || 'Failed to reject agent'
      toast.error('Failed to reject agent', {
        description: message,
      })
    },
  })
}
