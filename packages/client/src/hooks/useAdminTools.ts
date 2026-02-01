'use client'

import api from '@/lib/api'
import type { ApiResponse, ToolModel } from '@starships/protocol'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { FetchResponse } from '@/lib/types'

export type AdminToolRow = ToolModel & {
  starship?: { id: string; name?: string; slug?: string }
}

export const ADMIN_TOOLS_QUERY_KEYS = {
  all: ['admin', 'tools'] as const,
  list: () => [...ADMIN_TOOLS_QUERY_KEYS.all, 'list'] as const,
} as const

export function useAdminTools(enabled: boolean = true) {
  return useQuery({
    queryKey: ADMIN_TOOLS_QUERY_KEYS.list(),
    enabled,
    queryFn: async (): Promise<AdminToolRow[]> => {
      const response: FetchResponse<ApiResponse<{ tools: AdminToolRow[] }>> = await api.get('/api/v1/admin/tools')
      return response.data.data?.tools ?? []
    },
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
  })
}
