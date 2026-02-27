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
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { getSafeErrorMessage } from '@/lib/error-utils'

import { useStarshipBySlug } from '@/hooks/useStarships'
import { useCreateDataset, useStarshipDatasets } from '@/hooks/useDatasets'
import type { StarshipDatasetColumn } from '@starships/protocol'

function parseColumnsText(text: string): StarshipDatasetColumn[] {
  const lines = String(text || '')
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)

  const cols: StarshipDatasetColumn[] = []
  for (const line of lines) {
    // format: key: Label (optional)  OR  key
    const [left, ...rest] = line.split(':')
    const key = String(left || '').trim()
    if (!key) continue
    const label = String(rest.join(':') || key).trim()
    cols.push({ key, label })
  }
  return cols
}

export default function TablesIndexPage(): React.JSX.Element {
  const router = useRouter()
  const { slug: slugParam } = useParams<{ slug: string }>()
  const slug = typeof slugParam === 'string' ? slugParam : ''

  const { data: starship, isLoading: starshipLoading } = useStarshipBySlug(slug, Boolean(slug))
  const starshipId = starship?.id ? String(starship.id) : ''

  const { data: datasets = [], isLoading: datasetsLoading } = useStarshipDatasets(starshipId, Boolean(starshipId))

  const sorted = useMemo(() => {
    const list = Array.isArray(datasets) ? datasets : []
    return list.slice().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
  }, [datasets])

  const createDataset = useCreateDataset(starshipId)
  const canCreate = Boolean(starshipId) && !createDataset.isPending

  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [primaryKey, setPrimaryKey] = useState('')
  const [columnsText, setColumnsText] = useState('id: ID\nname: Name\n')

  async function onCreate() {
    if (!canCreate) return
    const cols = parseColumnsText(columnsText)
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
      setName('')
      setDescription('')
      setPrimaryKey('')
      router.push(`/ship/${encodeURIComponent(slug)}/datasets/${encodeURIComponent(created.id)}`)
    } catch (e) {
      toast.error('Failed to create dataset', { description: getSafeErrorMessage(e) })
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
                      <Icon name="table" weight="bold" className="h-4 w-4" />
                    </span>
                    <h3 className="flex-1 text-base font-medium text-foreground truncate leading-tight min-w-0">Datasets</h3>
                  </div>
                  <div className="min-w-0 text-xs leading-snug text-muted-foreground min-h-6">
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
                  <Card key={d.id} className={cn('border-border/60 hover:shadow-sm transition-shadow')}>
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
                      <Button asChild variant="outline" size="sm">
                        <Link href={href}>
                          Open
                          <Icon name="chevron-right" className="h-4 w-4 ml-1.5" />
                        </Link>
                      </Button>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
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
              <Input value={primaryKey} onChange={e => setPrimaryKey(e.target.value)} placeholder="id (must match a column key)" />
            </div>

            <div className="space-y-2">
              <div className="text-xs text-muted-foreground">Columns (one per line)</div>
              <Textarea
                value={columnsText}
                onChange={e => setColumnsText(e.target.value)}
                placeholder="email: Email\nstatus: Status"
                rows={8}
              />
              <div className="text-[11px] text-muted-foreground">
                Format: <code className="font-mono">key: Label</code> (label optional). Keys should be alphanumeric/underscore.
              </div>
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
    </div>
  )
}

