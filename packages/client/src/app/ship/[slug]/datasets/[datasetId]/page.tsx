'use client'

import { useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'

import Icon from '@/components/primitives/Icon'
import { MobileNavToggleButton } from '@/components/navigation/MobileNavToggleButton'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { DataTable } from '@/components/widgets/DataTable'
import { cn } from '@/lib/utils'

import { useStarshipBySlug } from '@/hooks/useStarships'
import { useDataset, useDatasetRows } from '@/hooks/useDatasets'

function toDataTableColumns(cols: unknown): Array<{ key: string; label: string; format?: any }> {
  const arr = Array.isArray(cols) ? cols : []
  const out: Array<{ key: string; label: string; format?: any }> = []
  for (const raw of arr) {
    if (!raw || typeof raw !== 'object') continue
    const r = raw as Record<string, any>
    const key = typeof r.name === 'string' && r.name.trim() ? r.name.trim() : typeof r.key === 'string' && r.key.trim() ? r.key.trim() : ''
    if (!key) continue
    out.push({ key, label: key, format: r.format })
  }
  return out
}

export default function DatasetViewerPage(): React.JSX.Element {
  const router = useRouter()
  const params = useParams<{ slug: string; datasetId: string }>()
  const slug = typeof params.slug === 'string' ? params.slug : ''
  const datasetId = typeof params.datasetId === 'string' ? params.datasetId : ''

  const { data: starship } = useStarshipBySlug(slug, Boolean(slug))
  const starshipId = starship?.id ? String(starship.id) : ''

  const { data: dataset, isLoading: datasetLoading } = useDataset(starshipId, datasetId, Boolean(starshipId && datasetId))

  const [limit, setLimit] = useState(50)
  const [offset, setOffset] = useState(0)

  const { data: rowsPage, isLoading: rowsLoading } = useDatasetRows(starshipId, datasetId, limit, offset, Boolean(starshipId && datasetId))

  const total = rowsPage?.pagination?.total ?? 0
  const canPrev = offset > 0
  const canNext = offset + limit < total

  const columns = useMemo(() => {
    const cols = rowsPage?.columns ?? dataset?.columns ?? []
    return Array.isArray(cols) ? cols : []
  }, [dataset?.columns, rowsPage?.columns])

  const tableColumns = useMemo(() => toDataTableColumns(columns), [columns])

  const data = useMemo(() => {
    const d = rowsPage?.data ?? []
    return Array.isArray(d) ? (d as Array<Record<string, any>>) : []
  }, [rowsPage?.data])

  return (
    <div className="relative flex flex-col min-h-full min-w-0">
      <div className="sticky top-0 z-10 border-b border-border/60 bg-card">
        <div className="px-4 pt-3.5 pb-2 md:py-2">
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1 min-w-0 flex flex-col justify-center gap-1">
              <div className="flex min-w-0 w-full gap-2 items-center">
                <span className="flex-shrink-0 self-center md:hidden">
                  <MobileNavToggleButton className="mx-2" />
                </span>
                <div className="min-w-0 flex-1 flex flex-col justify-center gap-1">
                  <div className="flex items-baseline gap-2 min-w-0 w-full">
                    <span aria-hidden="true" className="flex-shrink-0 self-center text-foreground leading-none">
                      <Icon name="database" weight="bold" className="h-4 w-4" />
                    </span>
                    <h3 className="flex-1 text-base font-medium text-foreground truncate leading-tight min-w-0">
                      {dataset?.name || 'Dataset'}
                    </h3>
                  </div>
                  <div className="min-w-0 text-xs leading-snug text-muted-foreground min-h-6">
                    <span className="block min-w-0 truncate font-medium leading-snug text-muted-foreground">
                      {dataset?.description || '—'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => router.push(`/ship/${encodeURIComponent(slug)}/datasets`)}>
                <Icon name="chevron-left" className="h-4 w-4 mr-1.5" />
                Back
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-visible md:overflow-y-auto px-4 pt-6 pb-8 md:pb-8">
        <div className="w-full bg-transparent max-w-6xl mx-auto min-h-full flex flex-col gap-4">
          {datasetLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-7 w-56" />
              <Skeleton className="h-4 w-80" />
              <div className="h-64 rounded-xl border border-border/60 bg-card animate-pulse" />
            </div>
          ) : !dataset ? (
            <Card className="border-border/60 p-6">
              <div className="text-sm text-muted-foreground">Dataset not found.</div>
            </Card>
          ) : (
            <>
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="text-xs text-muted-foreground">
                  Showing {Math.min(total, offset + 1)}–{Math.min(total, offset + limit)} of {total}
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => setOffset(o => Math.max(0, o - limit))} disabled={!canPrev}>
                    <Icon name="chevron-left" className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setOffset(o => o + limit)} disabled={!canNext}>
                    <Icon name="chevron-right" className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setLimit(50)
                      setOffset(0)
                    }}
                    className={cn('ml-1')}
                  >
                    Reset
                  </Button>
                </div>
              </div>

              <DataTable
                title={dataset.name}
                description={dataset.slug}
                columns={tableColumns as any}
                data={data as any}
                pageSize={0}
                striped={true}
                className={rowsLoading ? 'opacity-70 pointer-events-none' : undefined}
              />
            </>
          )}
        </div>
      </div>
    </div>
  )
}

