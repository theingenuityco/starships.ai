import api from '@/lib/api'
import type { AgentHeartbeatModel, ApiResponse } from '@starships/protocol'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { FetchResponse } from '@/lib/types'
import { toast } from 'sonner'
import { getSafeErrorMessage } from '@/lib/error-utils'

export type { AgentHeartbeatModel }

export interface CreateHeartbeatInput {
  name?: string
  commandType: string
  payload?: Record<string, unknown>
  intervalSeconds: number
  enabled?: boolean
}

export interface UpdateHeartbeatInput {
  id: string
  name?: string | null
  commandType?: string
  payload?: Record<string, unknown>
  intervalSeconds?: number
  enabled?: boolean
}

export const AGENT_HEARTBEAT_QUERY_KEYS = {
  all: ['agent-heartbeats'] as const,
  byAgent: (starshipId: string, agentId: string) =>
    [...AGENT_HEARTBEAT_QUERY_KEYS.all, starshipId, agentId] as const,
}

/** List the heartbeats configured for an agent. */
export function useAgentHeartbeats(starshipId: string, agentId: string, enabled: boolean = true) {
  return useQuery({
    queryKey: AGENT_HEARTBEAT_QUERY_KEYS.byAgent(starshipId, agentId),
    queryFn: async (): Promise<AgentHeartbeatModel[]> => {
      const response: FetchResponse<ApiResponse<AgentHeartbeatModel[]>> = await api.get(
        `/api/v1/starships/${starshipId}/agents/${agentId}/heartbeats`
      )
      return response.data.data
    },
    enabled: !!starshipId && !!agentId && enabled,
    staleTime: 10 * 1000,
    gcTime: 2 * 60 * 1000,
  })
}

/** Create a recurring heartbeat for an agent. */
export function useCreateHeartbeat(starshipId: string, agentId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: CreateHeartbeatInput): Promise<AgentHeartbeatModel> => {
      const response: FetchResponse<ApiResponse<AgentHeartbeatModel>> = await api.post(
        `/api/v1/starships/${starshipId}/agents/${agentId}/heartbeats`,
        input
      )
      return response.data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: AGENT_HEARTBEAT_QUERY_KEYS.byAgent(starshipId, agentId) })
      toast.success('Heartbeat created')
    },
    onError: (error: unknown) => {
      toast.error('Failed to create heartbeat', { description: getSafeErrorMessage(error) })
    },
  })
}

/** Update a heartbeat (e.g. pause/resume, change cadence). */
export function useUpdateHeartbeat(starshipId: string, agentId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, ...patch }: UpdateHeartbeatInput): Promise<AgentHeartbeatModel> => {
      const response: FetchResponse<ApiResponse<AgentHeartbeatModel>> = await api.put(
        `/api/v1/agent-heartbeats/${id}`,
        patch
      )
      return response.data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: AGENT_HEARTBEAT_QUERY_KEYS.byAgent(starshipId, agentId) })
    },
    onError: (error: unknown) => {
      toast.error('Failed to update heartbeat', { description: getSafeErrorMessage(error) })
    },
  })
}

/** Delete a heartbeat. */
export function useDeleteHeartbeat(starshipId: string, agentId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string): Promise<{ deleted: boolean }> => {
      const response: FetchResponse<ApiResponse<{ deleted: boolean }>> = await api.delete(`/api/v1/agent-heartbeats/${id}`)
      return response.data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: AGENT_HEARTBEAT_QUERY_KEYS.byAgent(starshipId, agentId) })
      toast.success('Heartbeat deleted')
    },
    onError: (error: unknown) => {
      toast.error('Failed to delete heartbeat', { description: getSafeErrorMessage(error) })
    },
  })
}
