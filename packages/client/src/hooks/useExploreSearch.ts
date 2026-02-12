import { useQuery } from '@tanstack/react-query'
import api from '@/lib/api'
import type { AgentTemplateModel, ConnectorCatalogItem, ToolTemplateModel, ApiResponse } from '@starships/protocol'
import type { FetchResponse } from '@/lib/types'

export type ExploreSearchType = 'all' | 'agents' | 'tools' | 'connectors'

export type ExploreSearchResponse = {
  q: string
  type: ExploreSearchType
  limit: number
  totals: { agents: number; tools: number; connectors: number }
  agents: AgentTemplateModel[]
  tools: ToolTemplateModel[]
  connectors: ConnectorCatalogItem[]
}

export const EXPLORE_SEARCH_QUERY_KEYS = {
  all: ['explore-search'] as const,
  search: (args: { q: string; type: ExploreSearchType; limit: number }) => [...EXPLORE_SEARCH_QUERY_KEYS.all, args] as const,
} as const

export function useExploreSearch(args: { q: string; type: ExploreSearchType; limit?: number; enabled?: boolean }) {
  const q = String(args.q || '').trim()
  const type = args.type
  const limit = typeof args.limit === 'number' && Number.isFinite(args.limit) ? args.limit : 24
  const enabled = args.enabled ?? true

  return useQuery({
    queryKey: EXPLORE_SEARCH_QUERY_KEYS.search({ q, type, limit }),
    queryFn: async (): Promise<ExploreSearchResponse> => {
      const response: FetchResponse<ApiResponse<ExploreSearchResponse>> = await api.get('/api/v1/explore/search', {
        params: { q: q || undefined, type, limit },
      })
      return response.data.data
    },
    enabled: enabled && q.length > 0,
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  })
}

