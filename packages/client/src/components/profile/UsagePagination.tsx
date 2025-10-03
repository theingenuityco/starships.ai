'use client'

import React from 'react'
import { Button } from '@/components/ui/button'
import type { PaginationMeta } from '@starships/protocol'

export interface UsagePaginationProps {
  page: number
  setPage: React.Dispatch<React.SetStateAction<number>>
  pagination?: PaginationMeta
  hasPrev: boolean
  hasNext: boolean
}

export function UsagePagination({ page, setPage, pagination, hasPrev, hasNext }: UsagePaginationProps): React.JSX.Element {
  const totalPages = pagination ? Math.max(1, Math.ceil(pagination.total / pagination.limit)) : undefined

  return (
    <div className="flex items-center justify-between mt-4">
      <Button variant="outline" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={!hasPrev}>
        Previous
      </Button>
      <div className="text-sm text-muted-foreground">Page {pagination?.page ?? page} of {totalPages ?? '—'}</div>
      <Button variant="outline" onClick={() => setPage(p => p + 1)} disabled={!hasNext}>
        Next
      </Button>
    </div>
  )
}

export default UsagePagination
