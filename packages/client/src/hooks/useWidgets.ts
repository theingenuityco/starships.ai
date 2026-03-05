import api from '@/lib/api'
import type { ApiResponse, WidgetModel } from '@starships/protocol'
import { useQuery } from '@tanstack/react-query'
import type { FetchResponse } from '@/lib/types'

export const WIDGET_QUERY_KEYS = {
  all: ['widgets'] as const,
  byStarship: (starshipId: string, filters?: { name?: string; slug?: string; widgetType?: string }) => [...WIDGET_QUERY_KEYS.all, 'starship', starshipId, { filters }] as const,
} as const

export function useStarshipWidgets(
  starshipId: string,
  enabled: boolean = true,
  filters?: { name?: string; slug?: string; widgetType?: string }
) {
  return useQuery({
    queryKey: WIDGET_QUERY_KEYS.byStarship(starshipId, filters),
    queryFn: async (): Promise<WidgetModel[]> => {
      const response: FetchResponse<ApiResponse<WidgetModel[]>> = await api.get(`/api/v1/starships/${starshipId}/widgets`, {
        params: filters,
      })
      return response.data.data
    },
    enabled: Boolean(starshipId) && enabled,
    staleTime: 10 * 1000,
    gcTime: 2 * 60 * 1000,
  })
}

