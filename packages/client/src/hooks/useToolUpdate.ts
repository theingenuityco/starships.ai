import api from '@/lib/api'
import type { ToolUpdateResponse, ApiResponse } from '@starships/protocol'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { FetchResponse } from '@/lib/types'
import { toast } from 'sonner'
import { TOOL_QUERY_KEYS } from './useTools'

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
