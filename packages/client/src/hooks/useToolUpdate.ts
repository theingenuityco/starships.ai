import api from '@/lib/api'
import type { ToolModel, ToolUpdateCheckResponse, ToolUpdateResponse, ApiResponse } from '@starships/protocol'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { FetchResponse } from '@/lib/types'
import { toast } from 'sonner'
import { TOOL_QUERY_KEYS } from './useTools'

// Query keys for tool updates
export const TOOL_UPDATE_QUERY_KEYS = {
  checkUpdate: (toolId: string) => [...TOOL_QUERY_KEYS.all, 'update-check', toolId] as const,
  toolsWithUpdates: (starshipId: string) => [...TOOL_QUERY_KEYS.byStarship(starshipId), 'with-updates'] as const,
} as const

/**
 * Check if tool has updates available from its template
 */
export function useToolUpdateCheck(toolId: string, enabled: boolean = true) {
  return useQuery({
    queryKey: TOOL_UPDATE_QUERY_KEYS.checkUpdate(toolId),
    queryFn: async (): Promise<ToolUpdateCheckResponse> => {
      const response: FetchResponse<ApiResponse<ToolUpdateCheckResponse>> = await api.get(`/api/v1/tools/${toolId}/check-update`)
      return response.data.data
    },
    enabled: !!toolId && enabled,
    staleTime: 30 * 1000, // 30 seconds - consistent with other tool queries
    gcTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: true, // Recheck when user returns to window
  })
}

/**
 * Update tool from its template
 */
export function useUpdateToolFromTemplate() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (toolId: string): Promise<ToolUpdateResponse> => {
      const response: FetchResponse<ApiResponse<ToolUpdateResponse>> = await api.post(`/api/v1/tools/${toolId}/update-from-template`)
      return response.data.data
    },
    onSuccess: (updateResponse) => {
      // Invalidate relevant queries to trigger refetch of full tool data
      queryClient.invalidateQueries({ queryKey: TOOL_QUERY_KEYS.all })
      queryClient.invalidateQueries({ queryKey: TOOL_UPDATE_QUERY_KEYS.checkUpdate(updateResponse.id) })

      toast.success('Tool updated successfully!', {
        description: `Updated to version ${updateResponse.version}`,
      })
    },
    onError: (error: Error) => {
      toast.error('Failed to update tool', {
        description: error.message || 'An error occurred while updating the tool',
      })
    },
  })
}

/**
 * Get tools with available updates for a starship
 */
export function useToolsWithUpdates(starshipId: string, enabled: boolean = true) {
  return useQuery({
    queryKey: TOOL_UPDATE_QUERY_KEYS.toolsWithUpdates(starshipId),
    queryFn: async (): Promise<ToolModel[]> => {
      const response: FetchResponse<ApiResponse<{ tools: ToolModel[] }>> = await api.get(`/api/v1/starships/${starshipId}/tools/with-updates`)
      return response.data.data.tools
    },
    enabled: !!starshipId && enabled,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    gcTime: 10 * 60 * 1000, // Keep in memory for 10 minutes
    refetchOnWindowFocus: true,
  })
}
