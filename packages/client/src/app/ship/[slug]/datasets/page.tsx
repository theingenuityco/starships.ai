'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'

import Icon from '@/components/primitives/Icon'
import { MobileNavToggleButton } from '@/components/navigation/MobileNavToggleButton'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { getSafeErrorMessage } from '@/lib/error-utils'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu'

import { useStarshipBySlug } from '@/hooks/useStarships'
import { useArchiveDataset, useCreateDataset, useHardDeleteDataset, useStarshipDatasets } from '@/hooks/useDatasets'
import type { StarshipDatasetColumn, StarshipDatasetColumnFormat, StarshipDatasetColumnType } from '@starships/protocol'
import { useAuth } from '@/hooks/useAuth'
import { useStarshipMembersAndInvites } from '@/hooks/useStarshipMembers'

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

const SELECT_NONE_VALUE = '__none__'
const SELECT_INFER_VALUE = '__infer__'

function normalizeEnumOptions(text: string): string[] {
  const raw = String(text || '')
  const parts = raw
    .split(/\r?\n|,/g)
    .map((s) => s.trim())
    .filter(Boolean)
  return Array.from(new Set(parts))
}

export default function TablesIndexPage(): React.JSX.Element {
  const router = useRouter()
  const { slug: slugParam } = useParams<{ slug: string }>()
  const slug = typeof slugParam === 'string' ? slugParam : ''
  const { user, isInstanceAdmin } = useAuth()

  const { data: starship, isLoading: starshipLoading } = useStarshipBySlug(slug, Boolean(slug))
  const starshipId = starship?.id ? String(starship.id) : ''
  const { data: membersAndInvites } = useStarshipMembersAndInvites(starshipId, Boolean(starshipId))
  const canHardDelete = Boolean(
    isInstanceAdmin === true ||
      (user?.id &&
        ((starship as any)?.ownerId && String((starship as any).ownerId) === String(user.id) ||
          membersAndInvites?.members?.some((m) => String(m.userId) === String(user.id) && (m.role === 'owner' || m.role === 'admin'))))
  )

  const { data: datasets = [], isLoading: datasetsLoading } = useStarshipDatasets(starshipId, Boolean(starshipId))

  const sorted = useMemo(() => {
    const list = Array.isArray(datasets) ? datasets : []
    return list.slice().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
  }, [datasets])

  const createDataset = useCreateDataset(starshipId)
  const canCreate = Boolean(starshipId) && !createDataset.isPending

  const archiveDataset = useArchiveDataset(starshipId)
  const hardDeleteDataset = useHardDeleteDataset(starshipId)
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string; slug?: string | null } | null>(null)
  const [deletingDatasetId, setDeletingDatasetId] = useState<string | null>(null)
  const [deleteMode, setDeleteMode] = useState<'archive' | 'hard'>('archive')

  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [primaryKey, setPrimaryKey] = useState<string>('')
  const [createTab, setCreateTab] = useState<'guided' | 'json'>('guided')
  const [columnsDraft, setColumnsDraft] = useState<StarshipDatasetColumn[]>([
    { name: 'id', type: 'string' },
    { name: 'name', type: 'string' },
  ])
  const [columnsJsonText, setColumnsJsonText] = useState('')

  function resetCreateModal() {
    setName('')
    setDescription('')
    setPrimaryKey('')
    setCreateTab('guided')
    const initial: StarshipDatasetColumn[] = [
      { name: 'id', type: 'string' },
      { name: 'name', type: 'string' },
    ]
    setColumnsDraft(initial)
    setColumnsJsonText(JSON.stringify(initial, null, 2))
  }

  async function onCreate() {
    if (!canCreate) return
    let cols: StarshipDatasetColumn[] = []
    if (createTab === 'json') {
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

    if (cols.length === 0) {
      toast.error('Please provide at least one column')
      return
    }

    try {
      const created = await createDataset.mutateAsync({
        name: name.trim() || 'New dataset',
        description: description.trim() || undefined,
        columns: cols,
        primaryKey: primaryKey.trim() ? primaryKey.trim() : null,
      })
      setOpen(false)
      resetCreateModal()
      router.push(`/ship/${encodeURIComponent(slug)}/datasets/${encodeURIComponent(created.id)}`)
    } catch (e) {
      toast.error('Failed to create dataset', { description: getSafeErrorMessage(e) })
    }
  }

  async function onConfirmDeleteDataset() {
    const target = deleteTarget
    if (!target || !starshipId) return
    if (deleteMode === 'hard') {
      if (!canHardDelete) {
        toast.error('Only owners/admins can permanently delete datasets')
        return
      }
      if (hardDeleteDataset.isPending) return
      setDeletingDatasetId(target.id)
      try {
        await hardDeleteDataset.mutateAsync(target.id)
        toast.success('Dataset deleted permanently', { description: `${target.name} and its rows were deleted.` })
        setDeleteTarget(null)
      } catch (e) {
        toast.error('Failed to delete dataset', { description: getSafeErrorMessage(e) })
      } finally {
        setDeletingDatasetId((prev) => (prev === target.id ? null : prev))
      }
      return
    }

    if (archiveDataset.isPending) return
    setDeletingDatasetId(target.id)
    try {
      await archiveDataset.mutateAsync(target.id)
      toast.success('Dataset deleted', { description: `${target.name} was archived.` })
      setDeleteTarget(null)
    } catch (e) {
      toast.error('Failed to delete dataset', { description: getSafeErrorMessage(e) })
    } finally {
      setDeletingDatasetId((prev) => (prev === target.id ? null : prev))
    }
  }

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
                    <h3 className="flex-1 text-base font-medium text-foreground truncate leading-tight min-w-0">Datasets</h3>
                  </div>
                  <div className="min-w-0 text-xs leading-snug text-muted-foreground">
                    <span className="block min-w-0 truncate font-medium leading-snug text-muted-foreground">
                      Starship-scoped datasets usable by agents and humans.
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setOpen(true)} disabled={!canCreate}>
                <Icon name="plus" className="h-4 w-4 mr-1.5" />
                New dataset
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-visible md:overflow-y-auto px-4 pt-6 pb-8 md:pb-8">
        <div className="w-full bg-transparent max-w-4xl mx-auto min-h-full flex flex-col gap-4">
          {starshipLoading ? (
            <div className="flex items-center justify-center py-10">
              <p className="text-sm text-muted-foreground">Loading…</p>
            </div>
          ) : !starshipId ? (
            <div className="flex items-center justify-center py-10">
              <p className="text-sm text-muted-foreground">No starship selected.</p>
            </div>
          ) : datasetsLoading ? (
            <div className="grid grid-cols-1 gap-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-28 rounded-xl border border-border/60 bg-card animate-pulse" />
              ))}
            </div>
          ) : sorted.length === 0 ? (
            <Card className="border-border/60">
              <CardHeader>
                <CardTitle className="text-base">No datasets yet</CardTitle>
                <CardDescription>Create a dataset to store and share tabular data in this starship.</CardDescription>
              </CardHeader>
              <CardContent className="pt-0 flex flex-col sm:flex-row gap-2">
                <Button onClick={() => setOpen(true)} disabled={!canCreate} variant="outline">
                  <Icon name="plus" className="h-4 w-4 mr-1.5" />
                  New dataset
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {sorted.map(d => {
                const href = `/ship/${encodeURIComponent(slug)}/datasets/${encodeURIComponent(d.id)}`
                return (
                  <Card key={d.id} className={cn('border-border/60 hover:shadow-sm transition-shadow group')}>
                    <CardHeader className="pb-4">
                      <CardTitle className="text-base flex items-center justify-between gap-2">
                        <Link href={href} className="truncate hover:underline underline-offset-2">
                          {d.name}
                        </Link>
                        <code className="text-[11px] font-mono text-muted-foreground">{d.slug}</code>
                      </CardTitle>
                      <CardDescription className="text-sm">{d.description || '—'}</CardDescription>
                    </CardHeader>
                    <CardContent className="pt-0 flex items-center justify-between">
                      <div className="text-xs text-muted-foreground">{d.columns?.length ?? 0} columns</div>
                      <div className="flex items-center gap-2">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity"
                              aria-label="Dataset actions"
                            >
                              <Icon name="dots-vertical" className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-44">
                            <DropdownMenuItem
                              onClick={() => router.push(href)}
                              className="flex items-center gap-2 cursor-pointer"
                            >
                              <Icon name="arrow-right" className="h-4 w-4" />
                              Open
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => {
                                setDeleteMode('archive')
                                setDeleteTarget({ id: String(d.id), name: String(d.name || 'Dataset'), slug: (d as any)?.slug })
                              }}
                              className="flex items-center gap-2 cursor-pointer"
                            >
                              <Icon name="archive" className="h-4 w-4" />
                              Archive
                            </DropdownMenuItem>
                          <DropdownMenuItem
                            disabled={!canHardDelete}
                            onClick={() => {
                              setDeleteMode('hard')
                              setDeleteTarget({ id: String(d.id), name: String(d.name || 'Dataset'), slug: (d as any)?.slug })
                            }}
                            className="flex items-center gap-2 cursor-pointer hover:bg-destructive/10 focus:bg-destructive/10 text-destructive focus:text-destructive disabled:opacity-60"
                          >
                            <Icon name="trash" className="h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>

                        <Button asChild variant="outline" size="sm">
                          <Link href={href}>
                            Open
                            <Icon name="chevron-right" className="h-4 w-4 ml-1.5" />
                          </Link>
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          if (next) {
            resetCreateModal()
          }
        }}
      >
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>Create dataset</DialogTitle>
            <DialogDescription>Define columns now. You can append/upsert rows later.</DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-2">
              <div className="text-xs text-muted-foreground">Name</div>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="Leads" />
            </div>

            <div className="space-y-2">
              <div className="text-xs text-muted-foreground">Description</div>
              <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="What is this dataset used for?" rows={3} />
            </div>

            <div className="space-y-2">
              <div className="text-xs text-muted-foreground">Primary key (optional)</div>
              <Input value={primaryKey} onChange={e => setPrimaryKey(e.target.value)} placeholder="id (must match a column name)" />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs text-muted-foreground">Schema</div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const next = [...(Array.isArray(columnsDraft) ? columnsDraft : []), { name: '', type: 'string' as const }]
                    setColumnsDraft(next)
                    if (createTab === 'guided') setColumnsJsonText(JSON.stringify(next, null, 2))
                  }}
                >
                  <Icon name="plus" className="h-4 w-4 mr-1.5" />
                  Add column
                </Button>
              </div>

              <Tabs value={createTab} onValueChange={(v) => setCreateTab(v === 'json' ? 'json' : 'guided')}>
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
                        const isPk = primaryKey.trim() && primaryKey.trim() === nameVal.trim()

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
                                  <Input
                                    value={nameVal}
                                    onChange={(e) => setCol({ name: e.target.value })}
                                    placeholder="e.g. status"
                                  />
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
                                  <Select
                                    value={formatVal ?? ''}
                                    onValueChange={(v) => setCol({ format: v === SELECT_NONE_VALUE ? undefined : (v as any) })}
                                  >
                                    <SelectTrigger>
                                      <SelectValue placeholder="(none)" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value={SELECT_NONE_VALUE}>(none)</SelectItem>
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
                                <Checkbox
                                  checked={Boolean(constraints.required)}
                                  onCheckedChange={(v) => setCol({ constraints: { ...constraints, required: Boolean(v) } })}
                                />
                                Required
                              </label>
                              <label className="flex items-center gap-2 text-sm">
                                <Checkbox
                                  checked={Boolean(constraints.nullable)}
                                  onCheckedChange={(v) => setCol({ constraints: { ...constraints, nullable: Boolean(v) } })}
                                />
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
                            </div>

                            {typeVal === 'enum' && (
                              <div className="space-y-2">
                                <div className="text-[11px] text-muted-foreground">Enum options (comma or newline separated)</div>
                                <Textarea
                                  value={Array.isArray((col as any)?.enum?.options) ? (col as any).enum.options.join('\n') : ''}
                                  onChange={(e) =>
                                    setCol({ enum: { options: normalizeEnumOptions(e.target.value) } } as any)
                                  }
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
                                        if (v === 'task_card') {
                                          setCol({ reference: { target: { kind: 'task_card' } } } as any)
                                        } else {
                                          setCol({ reference: { target: { kind: 'dataset_row', datasetIdOrSlug: '' } } } as any)
                                        }
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
                                      onChange={(e) =>
                                        setCol({
                                          reference: {
                                            ...(col as any).reference,
                                            labelColumn: e.target.value,
                                          },
                                        } as any)
                                      }
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
                                        {(sorted ?? []).map((d) => (
                                          <SelectItem key={d.id} value={d.slug}>
                                            {d.name} ({d.slug})
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                    <div className="text-[11px] text-muted-foreground">
                                      Uses the target dataset’s primaryKey (row_key) to resolve labels.
                                    </div>
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
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                  <div className="space-y-1">
                                    <div className="text-[11px] text-muted-foreground">Result type (optional)</div>
                                    <Select
                                      value={String((col as any)?.formula?.resultType || '')}
                                      onValueChange={(v) =>
                                        setCol({
                                          formula: { ...(col as any).formula, resultType: v === SELECT_INFER_VALUE ? undefined : v || undefined },
                                        } as any)
                                      }
                                    >
                                      <SelectTrigger>
                                        <SelectValue placeholder="(infer)" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value={SELECT_INFER_VALUE}>(infer)</SelectItem>
                                        {['string', 'number', 'boolean', 'date', 'datetime', 'json', 'enum'].map((t) => (
                                          <SelectItem key={t} value={t}>
                                            {t}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                  <div className="space-y-1">
                                    <div className="text-[11px] text-muted-foreground">Notes</div>
                                    <div className="text-[11px] text-muted-foreground">
                                      Formulas are computed on read; writes ignore this field.
                                    </div>
                                  </div>
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
                    onChange={(e) => setColumnsJsonText(e.target.value)}
                    className="min-h-[320px] font-mono text-xs"
                    placeholder='[{"name":"id","type":"string"}]'
                  />
                  <div className="text-[11px] text-muted-foreground">
                    You can paste the full column config including constraints/enum/reference/formula blocks.
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={onCreate} disabled={!canCreate}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(next) => {
          if (!next) {
            if (!archiveDataset.isPending && !hardDeleteDataset.isPending) setDeleteTarget(null)
          }
        }}
      >
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle className="text-destructive">{deleteMode === 'hard' ? 'Delete dataset permanently' : 'Archive dataset'}</DialogTitle>
            <DialogDescription>
              {deleteMode === 'hard'
                ? 'This will permanently delete the dataset and all of its rows. This action cannot be undone.'
                : 'This will archive the dataset so it no longer appears in the list.'}
            </DialogDescription>
          </DialogHeader>

          {deleteTarget ? (
            <div className="p-3 rounded-lg border border-destructive/20 bg-destructive/10 text-sm">
              <div className="flex items-start gap-2">
                <Icon name="alert-triangle" className="h-4 w-4 text-destructive mt-0.5" />
                <div className="min-w-0">
                  <p className="font-medium text-destructive">You’re about to delete:</p>
                  <p className="text-destructive/80 break-words">
                    {deleteTarget.name}
                    {deleteTarget.slug ? ` (${deleteTarget.slug})` : ''}
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setDeleteTarget(null)}
              disabled={archiveDataset.isPending || hardDeleteDataset.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={onConfirmDeleteDataset}
              disabled={!deleteTarget || archiveDataset.isPending || hardDeleteDataset.isPending || (deleteMode === 'hard' && !canHardDelete)}
            >
              {(archiveDataset.isPending || hardDeleteDataset.isPending) && deletingDatasetId === deleteTarget?.id ? 'Deleting…' : deleteMode === 'hard' ? 'Delete permanently' : 'Archive'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

