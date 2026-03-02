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
import { Checkbox } from '@/components/ui/checkbox'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DataTable } from '@/components/widgets/DataTable'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { getSafeErrorMessage } from '@/lib/error-utils'

import { useStarshipBySlug } from '@/hooks/useStarships'
import { useDataset, useDatasetRows, useStarshipDatasets, useUpdateDataset, useUpsertDatasetRows } from '@/hooks/useDatasets'
import type { StarshipDatasetColumn, StarshipDatasetColumnFormat, StarshipDatasetColumnType } from '@starships/protocol'

const COLUMN_TYPES: Array<{ value: StarshipDatasetColumnType; label: string }> = [
  { value: 'string', label: 'String' },
  { value: 'number', label: 'Number' },
  { value: 'boolean', label: 'Boolean' },
  { value: 'date', label: 'Date' },
  { value: 'datetime', label: 'Datetime' },
  { value: 'enum', label: 'Enum (select)' },
  { value: 'reference', label: 'Reference' },
  { value: 'formula', label: 'Formula' },
  { value: 'json', label: 'JSON' },
]

const COLUMN_FORMATS: Array<{ value: StarshipDatasetColumnFormat; label: string }> = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'currency', label: 'Currency' },
  { value: 'date', label: 'Date' },
  { value: 'datetime', label: 'Datetime' },
  { value: 'percentage', label: 'Percentage' },
]

function normalizeEnumOptions(text: string): string[] {
  const raw = String(text || '')
  const parts = raw
    .split(/\r?\n|,/g)
    .map((s) => s.trim())
    .filter(Boolean)
  return Array.from(new Set(parts))
}

function toDataTableColumns(cols: unknown): Array<{
  key: string
  label: string
  format?: any
  dataType?: any
  enumOptions?: string[]
  referenceTarget?: any
}> {
  const arr = Array.isArray(cols) ? cols : []
  const out: Array<{
    key: string
    label: string
    format?: any
    dataType?: any
    enumOptions?: string[]
    referenceTarget?: any
  }> = []
  for (const raw of arr) {
    if (!raw || typeof raw !== 'object') continue
    const r = raw as Record<string, any>
    const key = typeof r.name === 'string' && r.name.trim() ? r.name.trim() : ''
    if (!key) continue
    const type = typeof r.type === 'string' ? r.type : ''
    const format =
      r.format ??
      (type === 'date'
        ? 'date'
        : type === 'datetime'
          ? 'datetime'
          : type === 'number'
            ? 'number'
            : type === 'boolean'
              ? 'text'
              : 'text')
    const enumOptions = Array.isArray(r.enum?.options) ? (r.enum.options as string[]) : undefined
    const referenceTarget = r.reference?.target ? r.reference.target : undefined
    out.push({
      key,
      label: key,
      format,
      dataType: type || undefined,
      enumOptions,
      referenceTarget,
    })
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
  const { data: datasets = [] } = useStarshipDatasets(starshipId, Boolean(starshipId))
  const upsertRows = useUpsertDatasetRows(starshipId, datasetId)

  const [limit, setLimit] = useState(50)
  const [offset, setOffset] = useState(0)

  const { data: rowsPage, isLoading: rowsLoading } = useDatasetRows(starshipId, datasetId, limit, offset, Boolean(starshipId && datasetId))

  const [schemaOpen, setSchemaOpen] = useState(false)
  const [schemaTab, setSchemaTab] = useState<'guided' | 'json'>('guided')
  const [primaryKeyText, setPrimaryKeyText] = useState('')
  const [columnsDraft, setColumnsDraft] = useState<StarshipDatasetColumn[]>([])
  const [columnsJsonText, setColumnsJsonText] = useState('[]')

  const canSaveSchema = Boolean(starshipId && datasetId) && !updateDataset.isPending

  function openSchemaEditor() {
    const pk = dataset?.primaryKey ? String(dataset.primaryKey) : ''
    setPrimaryKeyText(pk)
    const cols = (dataset?.columns ?? []) as StarshipDatasetColumn[]
    setColumnsDraft(Array.isArray(cols) ? cols : [])
    setColumnsJsonText(JSON.stringify(cols ?? [], null, 2))
    setSchemaTab('guided')
    setSchemaOpen(true)
  }

  async function onSaveSchema() {
    if (!canSaveSchema) return
    let cols: StarshipDatasetColumn[] = []
    if (schemaTab === 'json') {
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
      cols = parsed.filter((c) => c && typeof c === 'object') as StarshipDatasetColumn[]
    } else {
      cols = (Array.isArray(columnsDraft) ? columnsDraft : []).filter((c) => String(c?.name || '').trim().length > 0)
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

  const primaryKey = typeof dataset?.primaryKey === 'string' ? dataset.primaryKey.trim() : ''

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

              {!primaryKey && (
                <div className="text-xs text-muted-foreground">
                  Editing/paste is disabled until a dataset <span className="font-medium">primary key</span> is set (Schema → Primary key).
                </div>
              )}

              <DataTable
                title={dataset.name}
                description={dataset.slug}
                columns={tableColumns as any}
                data={data as any}
                pageSize={0}
                striped={true}
                excelLike={true}
                editable={Boolean(primaryKey)}
                primaryKey={primaryKey || null}
                onCommitRows={async ({ rows }) => {
                  if (!primaryKey) {
                    throw new Error('Dataset primaryKey is required to edit rows')
                  }
                  const resp = await upsertRows.mutateAsync({ rows, mode: 'upsert' })
                  if (Array.isArray((resp as any)?.errors) && (resp as any).errors.length > 0) {
                    const first = (resp as any).errors[0]
                    const msg = first?.message ? String(first.message) : 'Row validation failed'
                    const col = first?.column ? String(first.column) : ''
                    throw new Error(col ? `${col}: ${msg}` : msg)
                  }
                }}
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
              Update columns and primary key. This controls validation, reference hydration, and formula projection.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <div className="text-sm font-medium">Primary key</div>
                <Input value={primaryKeyText} onChange={(e) => setPrimaryKeyText(e.target.value)} placeholder="e.g. id" />
                <div className="text-xs text-muted-foreground">Used for upsert mode and dataset-row references (row_key).</div>
              </div>
              <div className="space-y-2">
                <div className="text-sm font-medium">Primary key helper</div>
                <Select value={primaryKeyText} onValueChange={(v) => setPrimaryKeyText(v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select from columns" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">(none)</SelectItem>
                    {(schemaTab === 'json' ? [] : columnsDraft)
                      .map((c) => String(c?.name || '').trim())
                      .filter(Boolean)
                      .map((n) => (
                        <SelectItem key={n} value={n}>
                          {n}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <div className="text-xs text-muted-foreground">Uniqueness is currently enforced only for this column.</div>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-medium">Columns</div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  const next = [...(Array.isArray(columnsDraft) ? columnsDraft : []), { name: '', type: 'string' as const }]
                  setColumnsDraft(next)
                  if (schemaTab === 'guided') setColumnsJsonText(JSON.stringify(next, null, 2))
                }}
              >
                <Icon name="plus" className="h-4 w-4 mr-1.5" />
                Add column
              </Button>
            </div>

            <Tabs value={schemaTab} onValueChange={(v) => setSchemaTab(v === 'json' ? 'json' : 'guided')}>
              <TabsList>
                <TabsTrigger value="guided">Guided</TabsTrigger>
                <TabsTrigger value="json">JSON</TabsTrigger>
              </TabsList>

              <TabsContent value="guided" className="space-y-3">
                {columnsDraft.length === 0 ? (
                  <div className="text-sm text-muted-foreground">No columns yet.</div>
                ) : (
                  <div className="space-y-3">
                    {columnsDraft.map((col, idx) => {
                      const nameVal = String(col?.name || '')
                      const typeVal = (col?.type ?? 'string') as StarshipDatasetColumnType
                      const formatVal = col?.format as StarshipDatasetColumnFormat | undefined
                      const constraints = (col?.constraints ?? {}) as any
                      const isPk = primaryKeyText.trim() && primaryKeyText.trim() === nameVal.trim()

                      const setCol = (patch: Partial<StarshipDatasetColumn>) => {
                        const next = columnsDraft.map((c, i) => (i === idx ? { ...(c as any), ...patch } : c))
                        setColumnsDraft(next)
                        setColumnsJsonText(JSON.stringify(next, null, 2))
                      }

                      return (
                        <div key={idx} className="rounded-lg border border-border/60 p-3 space-y-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 flex-1">
                              <div className="space-y-1">
                                <div className="text-[11px] text-muted-foreground">Name</div>
                                <Input value={nameVal} onChange={(e) => setCol({ name: e.target.value })} placeholder="e.g. status" />
                              </div>
                              <div className="space-y-1">
                                <div className="text-[11px] text-muted-foreground">Type</div>
                                <Select value={typeVal} onValueChange={(v) => setCol({ type: v as any })}>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select type" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {COLUMN_TYPES.map((t) => (
                                      <SelectItem key={t.value} value={t.value}>
                                        {t.label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="space-y-1">
                                <div className="text-[11px] text-muted-foreground">Format (optional)</div>
                                <Select value={formatVal ?? ''} onValueChange={(v) => setCol({ format: (v ? (v as any) : undefined) as any })}>
                                  <SelectTrigger>
                                    <SelectValue placeholder="(none)" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="">(none)</SelectItem>
                                    {COLUMN_FORMATS.map((f) => (
                                      <SelectItem key={f.value} value={f.value}>
                                        {f.label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>

                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                const next = columnsDraft.filter((_, i) => i !== idx)
                                setColumnsDraft(next)
                                setColumnsJsonText(JSON.stringify(next, null, 2))
                              }}
                            >
                              Remove
                            </Button>
                          </div>

                          <div className="space-y-1">
                            <div className="text-[11px] text-muted-foreground">Description (optional)</div>
                            <Input
                              value={String(col?.description ?? '')}
                              onChange={(e) => setCol({ description: e.target.value })}
                              placeholder="What does this column represent?"
                            />
                          </div>

                          <div className="flex flex-wrap items-center gap-4">
                            <label className="flex items-center gap-2 text-sm">
                              <Checkbox checked={Boolean(constraints.required)} onCheckedChange={(v) => setCol({ constraints: { ...constraints, required: Boolean(v) } })} />
                              Required
                            </label>
                            <label className="flex items-center gap-2 text-sm">
                              <Checkbox checked={Boolean(constraints.nullable)} onCheckedChange={(v) => setCol({ constraints: { ...constraints, nullable: Boolean(v) } })} />
                              Nullable
                            </label>
                            <label className="flex items-center gap-2 text-sm">
                              <Checkbox
                                checked={Boolean(constraints.unique)}
                                disabled={!isPk}
                                onCheckedChange={(v) => setCol({ constraints: { ...constraints, unique: Boolean(v) } })}
                              />
                              Unique {isPk ? '' : '(primaryKey only)'}
                            </label>
                            <label className="flex items-center gap-2 text-sm">
                              <Checkbox
                                checked={Boolean(constraints.autoincrement)}
                                disabled={!isPk || typeVal !== 'number'}
                                onCheckedChange={(v) => setCol({ constraints: { ...constraints, autoincrement: Boolean(v) } })}
                              />
                              Autoincrement {isPk && typeVal === 'number' ? '' : '(number primaryKey only)'}
                            </label>
                          </div>

                          {typeVal === 'enum' && (
                            <div className="space-y-2">
                              <div className="text-[11px] text-muted-foreground">Enum options (comma or newline separated)</div>
                              <Textarea
                                value={Array.isArray((col as any)?.enum?.options) ? (col as any).enum.options.join('\n') : ''}
                                onChange={(e) => setCol({ enum: { options: normalizeEnumOptions(e.target.value) } } as any)}
                                rows={3}
                              />
                            </div>
                          )}

                          {typeVal === 'reference' && (
                            <div className="space-y-2">
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                <div className="space-y-1">
                                  <div className="text-[11px] text-muted-foreground">Target kind</div>
                                  <Select
                                    value={String((col as any)?.reference?.target?.kind || '') || 'dataset_row'}
                                    onValueChange={(v) => {
                                      if (v === 'task_card') setCol({ reference: { target: { kind: 'task_card' } } } as any)
                                      else setCol({ reference: { target: { kind: 'dataset_row', datasetIdOrSlug: '' } } } as any)
                                    }}
                                  >
                                    <SelectTrigger>
                                      <SelectValue placeholder="Select target" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="dataset_row">Dataset row</SelectItem>
                                      <SelectItem value="task_card">Task card</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>

                                <div className="space-y-1">
                                  <div className="text-[11px] text-muted-foreground">Label column (optional)</div>
                                  <Input
                                    value={String((col as any)?.reference?.labelColumn || '')}
                                    onChange={(e) => setCol({ reference: { ...(col as any).reference, labelColumn: e.target.value } } as any)}
                                    placeholder="e.g. name"
                                  />
                                </div>
                              </div>

                              {String((col as any)?.reference?.target?.kind || '') === 'dataset_row' && (
                                <div className="space-y-1">
                                  <div className="text-[11px] text-muted-foreground">Target dataset</div>
                                  <Select
                                    value={String((col as any)?.reference?.target?.datasetIdOrSlug || '')}
                                    onValueChange={(v) =>
                                      setCol({ reference: { ...(col as any).reference, target: { kind: 'dataset_row', datasetIdOrSlug: v } } } as any)
                                    }
                                  >
                                    <SelectTrigger>
                                      <SelectValue placeholder="Select dataset" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {(Array.isArray(datasets) ? datasets : []).map((d) => (
                                        <SelectItem key={d.id} value={d.slug}>
                                          {d.name} ({d.slug})
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                              )}
                            </div>
                          )}

                          {typeVal === 'formula' && (
                            <div className="space-y-2">
                              <div className="text-[11px] text-muted-foreground">Expression</div>
                              <Textarea
                                value={String((col as any)?.formula?.expr || '')}
                                onChange={(e) => setCol({ formula: { ...(col as any).formula, expr: e.target.value } } as any)}
                                rows={3}
                                placeholder='e.g. round(price * qty, 2)'
                              />
                              <div className="space-y-1">
                                <div className="text-[11px] text-muted-foreground">Result type (optional)</div>
                                <Select
                                  value={String((col as any)?.formula?.resultType || '')}
                                  onValueChange={(v) => setCol({ formula: { ...(col as any).formula, resultType: v || undefined } } as any)}
                                >
                                  <SelectTrigger>
                                    <SelectValue placeholder="(infer)" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="">(infer)</SelectItem>
                                    {['string', 'number', 'boolean', 'date', 'datetime', 'json', 'enum'].map((t) => (
                                      <SelectItem key={t} value={t}>
                                        {t}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="json" className="space-y-2">
                <Textarea
                  value={columnsJsonText}
                  onChange={(e) => {
                    setColumnsJsonText(e.target.value)
                    // Best-effort sync draft for pk dropdown when JSON is valid.
                    try {
                      const parsed = JSON.parse(e.target.value)
                      if (Array.isArray(parsed)) setColumnsDraft(parsed.filter((c) => c && typeof c === 'object') as StarshipDatasetColumn[])
                    } catch {
                      // ignore while typing
                    }
                  }}
                  className="min-h-[320px] font-mono text-xs"
                />
                <div className="text-xs text-muted-foreground">
                  Example: <code>{`[{ "name": "price", "type": "number", "format": "currency" }]`}</code>
                </div>
              </TabsContent>
            </Tabs>
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

