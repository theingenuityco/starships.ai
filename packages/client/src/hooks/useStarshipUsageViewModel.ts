import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import api from '@/lib/api'
import { useStarshipDailyUsageList, useStarshipDailyModelUsageList } from '@/hooks/useUsage'
import type { ApiResponse, LLMUsage, PaginationMeta, DailyUsageRow, DailyModelUsageRow } from '@starships/protocol'

export const numberCompact = (n: number): string => new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(n)

export const numberGroup = (n: number): string => new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(n)

export const usd = (n: number): string => `$${(Number.isFinite(n) ? n : 0).toFixed(2)}`

export const formatDay = (isoDay: string): string => {
  try {
    const [yStr, mStr, dStr] = isoDay.split('-')
    const y = Number(yStr)
    const m = Number(mStr) - 1
    const d = Number(dStr)
    const dt = new Date(Date.UTC(y, m, d))
    return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  } catch {
    return isoDay
  }
}

export type UsageRow = DailyUsageRow | DailyModelUsageRow

/**
 * ViewModel/Service for the StarshipUsage component (Layered Architecture)
 * - Encapsulates state, data fetching and derived computations
 * - Keeps the React component focused on presentation only
 */
export function useStarshipUsageViewModel(starshipId: string | null) {
  // UI state
  const [modeDayModel, setModeDayModel] = useState(false)
  const [page, setPage] = useState(1)
  const limit = 20

  // Data queries - using the totals with request count
  const { data: totalsWithCount, isLoading: loadingTotals } = useQuery({
    queryKey: starshipId ? ['usage', 'starship', starshipId, 'totals-with-count'] : ['__noop__'],
    queryFn: async (): Promise<{ totals: LLMUsage; requestCount: number }> => {
      const res = await api.get<ApiResponse<{ totals: LLMUsage; requestCount: number }>>(`/api/v1/starships/${starshipId}/usage/totals-with-count`)
      return res.data.data
    },
    enabled: !!starshipId,
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
  })

  const daily = useStarshipDailyUsageList(starshipId, { page, limit, order: 'DESC' })
  const dailyModel = useStarshipDailyModelUsageList(starshipId, { page, limit, order: 'DESC' })

  // Derived totals
  const totals = totalsWithCount?.totals
  const totalTokens = Number(totals?.totalTokens ?? 0)
  const promptTokens = Number(totals?.promptTokens ?? 0)
  const completionTokens = Number(totals?.completionTokens ?? 0)
  const totalCost = Number(totals?.cost ?? 0)
  const totalRequests = Number(totalsWithCount?.requestCount ?? 0)
  const avgTokensPerRequest = totalRequests > 0 ? Math.round(totalTokens / totalRequests) : 0
  const avgCostPerRequest = totalRequests > 0 ? totalCost / totalRequests : 0

  const isDaily = !modeDayModel
  const list = isDaily ? daily.data : dailyModel.data
  const loadingList = isDaily ? daily.isLoading : dailyModel.isLoading

  const pagination: PaginationMeta | undefined = list?.pagination
  const rows = (list?.records ?? []) as UsageRow[]
  const total = pagination?.total ?? 0
  const hasNext = pagination?.has_next ?? false
  const hasPrev = pagination?.has_prev ?? false

  return {
    starshipId,
    totals,
    isLoading: loadingTotals,
    totalTokens,
    promptTokens,
    completionTokens,
    totalCost,
    totalRequests,
    avgTokensPerRequest,
    avgCostPerRequest,
    // pagination + mode
    modeDayModel,
    setModeDayModel,
    page,
    setPage,
    // listing
    isDaily,
    rows,
    loadingList,
    pagination,
    total,
    hasNext,
    hasPrev,
    // formatters for convenience
    numberCompact,
    numberGroup,
    usd,
    formatDay,
  }
}
