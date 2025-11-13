import api from '@/lib/api'
import type { AgentUpdateResponse, ApiResponse } from '@starships/protocol'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { FetchResponse } from '@/lib/types'
import { toast } from 'sonner'
import { AGENT_QUERY_KEYS } from './useAgents'

/**
 * Update agent from its template
 */
export function useUpdateAgentFromTemplate() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (agentId: string): Promise<AgentUpdateResponse> => {
      const response: FetchResponse<ApiResponse<AgentUpdateResponse>> = await api.post(`/api/v1/agents/${agentId}/update-from-template`)
      return response.data.data
    },
    onSuccess: (updateResponse) => {
      // Invalidate relevant queries to trigger refetch of full agent data
      queryClient.invalidateQueries({ queryKey: AGENT_QUERY_KEYS.all })
      queryClient.invalidateQueries({ queryKey: AGENT_QUERY_KEYS.detail(updateResponse.id) })

      toast.success('Agent updated successfully!', {
        description: `Updated to version ${updateResponse.version}`,
      })
    },
    onError: (error: Error) => {
      toast.error('Failed to update agent', {
        description: error.message || 'An error occurred while updating the agent',
      })
    },
  })
}
