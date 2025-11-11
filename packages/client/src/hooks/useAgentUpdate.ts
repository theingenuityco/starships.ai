import api, { agentAPI } from '@/lib/api'
import type { AgentModel, AgentUpdateCheckResponse, ApiResponse } from '@starships/protocol'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { FetchResponse } from '@/lib/types'
import { toast } from 'sonner'
import { AGENT_QUERY_KEYS } from './useAgents'

// Query keys for agent updates
export const AGENT_UPDATE_QUERY_KEYS = {
  checkUpdate: (agentId: string) => [...AGENT_QUERY_KEYS.detail(agentId), 'update-check'] as const,
  agentsWithUpdates: (starshipId: string) => [...AGENT_QUERY_KEYS.byStarship(starshipId), 'with-updates'] as const,
} as const

/**
 * Check if agent has updates available from its template
 */
export function useAgentUpdateCheck(agentId: string, enabled: boolean = true) {
  return useQuery({
    queryKey: AGENT_UPDATE_QUERY_KEYS.checkUpdate(agentId),
    queryFn: async (): Promise<AgentUpdateCheckResponse> => {
      const response: FetchResponse<ApiResponse<AgentUpdateCheckResponse>> = await api.get(`/api/v1/agents/${agentId}/check-update`)
      return response.data.data
    },
    enabled: !!agentId && enabled,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    gcTime: 10 * 60 * 1000, // Keep in memory for 10 minutes
    refetchOnWindowFocus: true, // Recheck when user returns to window
  })
}

/**
 * Update agent from its template
 */
export function useUpdateAgentFromTemplate() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (agentId: string): Promise<AgentModel> => {
      const response: FetchResponse<ApiResponse<AgentModel>> = await api.post(`/api/v1/agents/${agentId}/update-from-template`)
      return response.data.data
    },
    onSuccess: (updatedAgent) => {
      // Invalidate relevant queries to trigger refetch
      queryClient.invalidateQueries({ queryKey: AGENT_QUERY_KEYS.all })
      queryClient.invalidateQueries({ queryKey: AGENT_QUERY_KEYS.detail(updatedAgent.id) })
      queryClient.invalidateQueries({ queryKey: AGENT_UPDATE_QUERY_KEYS.checkUpdate(updatedAgent.id) })

      toast.success('Agent updated successfully!', {
        description: `Updated to version ${updatedAgent.version}`,
      })
    },
    onError: (error: Error) => {
      toast.error('Failed to update agent', {
        description: error.message || 'An error occurred while updating the agent',
      })
    },
  })
}

/**
 * Get agents with available updates for a starship
 */
export function useAgentsWithUpdates(starshipId: string, enabled: boolean = true) {
  return useQuery({
    queryKey: AGENT_UPDATE_QUERY_KEYS.agentsWithUpdates(starshipId),
    queryFn: async (): Promise<AgentModel[]> => {
      const response: FetchResponse<ApiResponse<AgentModel[]>> = await api.get(`/api/v1/starships/${starshipId}/agents/with-updates`)
      return response.data.data
    },
    enabled: !!starshipId && enabled,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    gcTime: 10 * 60 * 1000, // Keep in memory for 10 minutes
    refetchOnWindowFocus: true,
  })
}
