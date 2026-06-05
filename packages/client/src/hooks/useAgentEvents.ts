import api from '@/lib/api'
import type { AgentEventModel, ApiResponse } from '@starships/protocol'
import { useQuery } from '@tanstack/react-query'
import type { FetchResponse } from '@/lib/types'

export type { AgentEventModel }

export const AGENT_EVENT_QUERY_KEYS = {
  all: ['agent-events'] as const,
  byStarship: (starshipId: string) => [...AGENT_EVENT_QUERY_KEYS.all, starshipId] as const,
}

/**
 * The starship's append-only agent activity log (most recent first). Pass
 * `refetchInterval` to poll while a view is open so new events surface live.
 */
export function useAgentEvents(
  starshipId: string,
  opts: { enabled?: boolean; limit?: number; refetchInterval?: number | false } = {}
) {
  const { enabled = true, limit = 100, refetchInterval = false } = opts
  return useQuery({
    queryKey: [...AGENT_EVENT_QUERY_KEYS.byStarship(starshipId), limit] as const,
    queryFn: async (): Promise<AgentEventModel[]> => {
      const response: FetchResponse<ApiResponse<AgentEventModel[]>> = await api.get(
        `/api/v1/starships/${starshipId}/agent-events`,
        { params: { limit } }
      )
      return response.data.data
    },
    enabled: !!starshipId && enabled,
    staleTime: 5 * 1000,
    gcTime: 2 * 60 * 1000,
    refetchInterval,
  })
}
