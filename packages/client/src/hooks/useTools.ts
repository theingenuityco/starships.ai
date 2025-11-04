'use client'

import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import type { FetchResponse } from '@/lib/types'
import type { ApiResponse, ToolModel } from '@starships/protocol'

export const TOOL_QUERY_KEYS = {
  all: ['tools'] as const,
  byStarship: (starshipId: string) => [...TOOL_QUERY_KEYS.all, 'starship', starshipId] as const,
  detail: (starshipId: string, slug: string) => [...TOOL_QUERY_KEYS.all, 'detail', starshipId, slug] as const,
} as const

export function getStarshipToolQuery(starshipId: string, slug: string) {
  return {
    queryKey: TOOL_QUERY_KEYS.detail(starshipId, slug) as const,
    queryFn: async (): Promise<ToolModel> => {
      const res: FetchResponse<ApiResponse<ToolModel>> = await api.get(`/api/v1/starships/${starshipId}/tools/${slug}`)
      return res.data.data
    },
    staleTime: 30 * 1000,
  }
}

export function useStarshipTool(starshipId: string, slug: string, enabled: boolean = true) {
  const query = getStarshipToolQuery(starshipId, slug)
  return useQuery({ ...query, enabled: !!starshipId && !!slug && enabled })
}

export async function fetchStarshipTool(queryClient: QueryClient, starshipId: string, slug: string): Promise<ToolModel> {
  const query = getStarshipToolQuery(starshipId, slug)
  return await queryClient.fetchQuery(query as any)
}


