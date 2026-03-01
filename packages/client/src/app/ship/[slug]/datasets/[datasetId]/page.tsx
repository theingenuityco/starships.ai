'use client'

import { useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'

import Icon from '@/components/primitives/Icon'
import { MobileNavToggleButton } from '@/components/navigation/MobileNavToggleButton'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { DataTable } from '@/components/widgets/DataTable'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { getSafeErrorMessage } from '@/lib/error-utils'

import { useStarshipBySlug } from '@/hooks/useStarships'
import { useDataset, useDatasetRows, useUpdateDataset } from '@/hooks/useDatasets'
import type { StarshipDatasetColumn } from '@starships/protocol'

function toDataTableColumns(cols: unknown): Array<{ key: string; label: string; format?: any }> {
  const arr = Array.isArray(cols) ? cols : []
  const out: Array<{ key: string; label: string; format?: any }> = []
  for (const raw of arr) {
    if (!raw || typeof raw !== 'object') continue
    const r = raw as Record<string, any>
    const key = typeof r.name === 'string' && r.name.trim() ? r.name.trim() : ''
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
  const updateDataset = useUpdateDataset(starshipId, datasetId)

  const [limit, setLimit] = useState(50)
  const [offset, setOffset] = useState(0)

  const { data: rowsPage, isLoading: rowsLoading } = useDatasetRows(starshipId, datasetId, limit, offset, Boolean(starshipId && datasetId))

  const [schemaOpen, setSchemaOpen] = useState(false)
  const [primaryKeyText, setPrimaryKeyText] = useState('')
  const [columnsJsonText, setColumnsJsonText] = useState('[]')

  const canSaveSchema = Boolean(starshipId && datasetId) && !updateDataset.isPending

  function openSchemaEditor() {
    const pk = dataset?.primaryKey ? String(dataset.primaryKey) : ''
    setPrimaryKeyText(pk)
    setColumnsJsonText(JSON.stringify(dataset?.columns ?? [], null, 2))
    setSchemaOpen(true)
  }

  async function onSaveSchema() {
    if (!canSaveSchema) return
    let parsed: unknown
    try {
      parsed = JSON.parse(columnsJsonText)
    } catch (e) {
      toast.error('Invalid columns JSON', { description: getSafeErrorMessage(e) })
      return
    }
    if (!Array.isArray(parsed)) {
      toast.error('Columns JSON must be an array')
      return
    }
    const cols: StarshipDatasetColumn[] = []
    for (const raw of parsed) {
      if (!raw || typeof raw !== 'object') {
        toast.error('Each column must be an object')
        return
      }
      cols.push(raw as StarshipDatasetColumn)
    }
    try {
      await updateDataset.mutateAsync({
        columns: cols,
        primaryKey: primaryKeyText.trim() ? primaryKeyText.trim() : null,
      })
      toast.success('Schema updated')
      setSchemaOpen(false)
    } catch (e) {
      toast.error('Failed to update schema', { description: getSafeErrorMessage(e) })
    }
  }

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
              <Button variant="outline" size="sm" onClick={openSchemaEditor} disabled={!dataset || updateDataset.isPending}>
                <Icon name="settings" className="h-4 w-4 mr-1.5" />
                Schema
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

      <Dialog open={schemaOpen} onOpenChange={setSchemaOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Edit dataset schema</DialogTitle>
            <DialogDescription>
              Update columns JSON and primary key. This controls validation, reference hydration, and formula projection.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <div className="text-sm font-medium">Primary key</div>
              <Input
                value={primaryKeyText}
                onChange={(e) => setPrimaryKeyText(e.target.value)}
                placeholder="e.g. id"
              />
              <div className="text-xs text-muted-foreground">
                Used for upsert mode and for dataset-row references (row_key).
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">Columns JSON</div>
              <Textarea
                value={columnsJsonText}
                onChange={(e) => setColumnsJsonText(e.target.value)}
                className="min-h-[320px] font-mono text-xs"
              />
              <div className="text-xs text-muted-foreground">
                Example: <code>{`[{ "name": "price", "type": "number", "format": "currency" }]`}</code>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSchemaOpen(false)}>
              Cancel
            </Button>
            <Button onClick={onSaveSchema} disabled={!canSaveSchema}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

