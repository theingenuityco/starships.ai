import api from '@/lib/api'
import { useQuery } from '@tanstack/react-query'
import type { ApiResponse, LedgerEntryModel, PaginationMeta } from '@starships/protocol'

export const LEDGER_QUERY_KEYS = {
  list: (walletId: string, page: number, limit: number, order: 'ASC' | 'DESC') => ['ledger', walletId, { page, limit, order }] as const,
} as const

export interface LedgerListResult {
  records: LedgerEntryModel[]
  pagination: PaginationMeta
}

/**
 * Offset-based paginated ledger list for a wallet
 * Follows same pagination style as other APIs (page, limit, order) with PaginationMeta in response.meta
 */
export function useLedger(walletId: string | null, opts?: { page?: number; limit?: number; order?: 'ASC' | 'DESC' }) {
  const page = opts?.page ?? 1
  const limit = opts?.limit ?? 20
  const order: 'ASC' | 'DESC' = opts?.order ?? 'DESC'

  return useQuery<LedgerListResult>({
    queryKey: walletId ? LEDGER_QUERY_KEYS.list(walletId, page, limit, order) : ['__noop__'],
    queryFn: async (): Promise<LedgerListResult> => {
      const res = await api.get<ApiResponse<LedgerEntryModel[]>>(`/api/v1/ledger/${walletId}`, {
        params: { page, limit, order },
      })
      const data = res.data.data
      const meta = (res.data.meta?.pagination as PaginationMeta | undefined) || {
        page,
        limit,
        total: data.length,
        has_next: page * limit < data.length,
        has_prev: page > 1,
      }
      return { records: data, pagination: meta }
    },
    enabled: !!walletId,
    staleTime: 10 * 1000,
    gcTime: 60 * 1000,
  })
}
