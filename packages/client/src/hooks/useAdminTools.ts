'use client'

import api from '@/lib/api'
import type { ApiResponse, PendingToolSummary as ProtocolPendingToolSummary, ToolModel } from '@starships/protocol'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { FetchResponse } from '@/lib/types'
import { toast } from 'sonner'
import { TOOL_QUERY_KEYS } from './useTools'

export interface PaginationMeta {
  page: number
  limit: number
  total: number
  has_next: boolean
  has_prev: boolean
}

export type PendingToolSummary = ProtocolPendingToolSummary

export interface PendingToolsResponse {
  tools: PendingToolSummary[]
  pagination: PaginationMeta
}

export const ADMIN_TOOL_QUERY_KEYS = {
  all: ['admin', 'tools'] as const,
  pending: (page: number, limit: number) => [...ADMIN_TOOL_QUERY_KEYS.all, 'pending', { page, limit }] as const,
} as const

/**
 * Fetch tools that are pending publication approval (instance admin only).
 */
export function usePendingTools(page: number = 1, limit: number = 20) {
  return useQuery({
    queryKey: ADMIN_TOOL_QUERY_KEYS.pending(page, limit),
    queryFn: async (): Promise<PendingToolsResponse> => {
      const response: FetchResponse<ApiResponse<PendingToolSummary[]>> = await api.get('/api/v1/admin/tools/pending', {
        params: { page, limit },
      })

      const tools = response.data.data
      const pagination = (response.data.meta?.pagination || {
        page,
        limit,
        total: tools.length,
        has_next: false,
        has_prev: page > 1,
      }) as PaginationMeta

      return { tools, pagination }
    },
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
  })
}

/**
 * Approve tool publication (instance admin only).
 */
export function useApproveToolPublication() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (toolId: string): Promise<ToolModel> => {
      const response: FetchResponse<ApiResponse<{ message: string; tool: ToolModel }>> = await api.post(`/api/v1/admin/tools/${toolId}/approve`)
      return response.data.data.tool
    },
    onSuccess: tool => {
      // Invalidate pending list and tool details
      queryClient.invalidateQueries({ queryKey: ADMIN_TOOL_QUERY_KEYS.all })
      queryClient.invalidateQueries({ queryKey: TOOL_QUERY_KEYS.all })

      toast.success('Tool publication approved', {
        description: `${tool.name} is now published and available as a reusable template.`,
      })
    },
    onError: (error: any) => {
      const message = error?.response?.data?.error || error?.message || 'Failed to approve tool'
      toast.error('Failed to approve tool', {
        description: message,
      })
    },
  })
}

/**
 * Reject tool publication (instance admin only).
 */
export function useRejectToolPublication() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (toolId: string): Promise<ToolModel> => {
      const response: FetchResponse<ApiResponse<{ message: string; tool: ToolModel }>> = await api.post(`/api/v1/admin/tools/${toolId}/reject`)
      return response.data.data.tool
    },
    onSuccess: tool => {
      // Invalidate pending list and tool details
      queryClient.invalidateQueries({ queryKey: ADMIN_TOOL_QUERY_KEYS.all })
      queryClient.invalidateQueries({ queryKey: TOOL_QUERY_KEYS.all })

      toast.success('Tool publication rejected', {
        description: `${tool.name} has been moved back to draft.`,
      })
    },
    onError: (error: any) => {
      const message = error?.response?.data?.error || error?.message || 'Failed to reject tool'
      toast.error('Failed to reject tool', {
        description: message,
      })
    },
  })
}


