'use client'

import { useQuery } from '@tanstack/react-query'
import api from '@/lib/api'
import type { FetchResponse } from '@/lib/types'
import type { ApiResponse } from '@starships/protocol'

export type ToolPermission = 'allow' | 'ask' | 'deny'

export type StarshipToolPermissionRow = {
  starshipId: string
  toolId: string
  toolSlug: string
  permission: ToolPermission
}

export const STARSHIP_TOOL_PERMISSION_QUERY_KEYS = {
  all: ['starship-tool-permissions'] as const,
  byStarship: (starshipId: string) => [...STARSHIP_TOOL_PERMISSION_QUERY_KEYS.all, starshipId] as const,
} as const

export function useStarshipToolPermissions(starshipId: string, enabled: boolean = true) {
  return useQuery({
    queryKey: STARSHIP_TOOL_PERMISSION_QUERY_KEYS.byStarship(starshipId),
    queryFn: async (): Promise<StarshipToolPermissionRow[]> => {
      if (!starshipId) return []
      const res: FetchResponse<ApiResponse<StarshipToolPermissionRow[]>> = await api.get(
        `/api/v1/starships/${starshipId}/starship-tool-permissions`
      )
      return res.data.data || []
    },
    enabled: Boolean(starshipId) && enabled,
    staleTime: 30 * 1000,
  })
}

