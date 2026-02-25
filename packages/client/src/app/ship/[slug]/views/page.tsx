'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'

import Icon from '@/components/primitives/Icon'
import { MobileNavToggleButton } from '@/components/navigation/MobileNavToggleButton'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useStarshipBySlug } from '@/hooks/useStarships'
import { useCreateView, useStarshipViews } from '@/hooks/useViews'
import { useStarshipWidgets } from '@/hooks/useWidgets'
import { cn } from '@/lib/utils'

import type { CreateViewRequest, ViewLayoutInput } from '@starships/protocol'

function buildSequentialLayout(widgetIds: string[], cols: number): ViewLayoutInput {
  const safeCols = Math.max(1, Math.min(12, Math.floor(cols || 3)))
  return {
    cols: safeCols,
    items: widgetIds.map((widgetId, idx) => {
      const row = Math.floor(idx / safeCols)
      const col = idx % safeCols
      return { widgetId, row, col, colSpan: 1, rowSpan: 1 }
    }),
  }
}

export default function ViewsIndexPage() {
  const router = useRouter()
  const { slug: slugParam } = useParams<{ slug: string }>()
  const slug = typeof slugParam === 'string' ? slugParam : ''

  const { data: starship, isLoading: starshipLoading } = useStarshipBySlug(slug, Boolean(slug))
  const starshipId = starship?.id ? String(starship.id) : ''

  const { data: views = [], isLoading: viewsLoading } = useStarshipViews(starshipId, Boolean(starshipId))
  const { data: widgets = [], isLoading: widgetsLoading } = useStarshipWidgets(starshipId, Boolean(starshipId))

  const createView = useCreateView()

  const sortedViews = useMemo(() => {
    const list = Array.isArray(views) ? views : []
    return list.slice().sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
  }, [views])

  const canCreate = Boolean(starshipId) && !createView.isPending
  const canCreateFromWidgets = Boolean(starshipId) && !widgetsLoading && widgets.length > 0 && canCreate

  async function onCreateEmpty() {
    if (!canCreate) return
    const payload: CreateViewRequest = {
      name: 'New view',
      description: 'A saved grid layout of widgets.',
      starshipId,
      layout: { cols: 3, items: [] },
    }
    const created = await createView.mutateAsync(payload)
    router.push(`/ship/${encodeURIComponent(slug)}/views/${encodeURIComponent(created.id)}`)
  }

  async function onCreateFromAllWidgets() {
    if (!canCreateFromWidgets) return
    const widgetIds = widgets.map(w => String(w.id)).filter(Boolean)
    const layout = buildSequentialLayout(widgetIds, 3)
    const payload: CreateViewRequest = {
      name: 'All widgets',
      description: 'Auto-generated view showing all widgets for this starship.',
      starshipId,
      layout,
    }
    const created = await createView.mutateAsync(payload)
    router.push(`/ship/${encodeURIComponent(slug)}/views/${encodeURIComponent(created.id)}`)
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
                      <Icon name="bar-chart" weight="bold" className="h-4 w-4" />
                    </span>
                    <h3 className="flex-1 text-base font-medium text-foreground truncate leading-tight min-w-0">Views</h3>
                  </div>
                  <div className="min-w-0 text-xs leading-snug text-muted-foreground min-h-6">
                    <span className="block min-w-0 truncate font-medium leading-snug text-muted-foreground">
                      Saved grid layouts of widgets (fixed columns, infinite rows).
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={onCreateEmpty} disabled={!canCreate}>
                <Icon name="plus" className="h-4 w-4 mr-1.5" />
                New view
              </Button>
              <Button variant="default" size="sm" onClick={onCreateFromAllWidgets} disabled={!canCreateFromWidgets}>
                <Icon name="sparkles" className="h-4 w-4 mr-1.5" />
                All widgets
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
          ) : viewsLoading ? (
            <div className="grid grid-cols-1 gap-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-28 rounded-xl border border-border/60 bg-card animate-pulse" />
              ))}
            </div>
          ) : sortedViews.length === 0 ? (
            <Card className="border-border/60">
              <CardHeader>
                <CardTitle className="text-base">No views yet</CardTitle>
                <CardDescription>Create a view to persist a widget grid layout.</CardDescription>
              </CardHeader>
              <CardContent className="pt-0 flex flex-col sm:flex-row gap-2">
                <Button onClick={onCreateEmpty} disabled={!canCreate} variant="outline">
                  <Icon name="plus" className="h-4 w-4 mr-1.5" />
                  New view
                </Button>
                <Button onClick={onCreateFromAllWidgets} disabled={!canCreateFromWidgets}>
                  <Icon name="sparkles" className="h-4 w-4 mr-1.5" />
                  Create “All widgets”
                </Button>
                {widgetsLoading ? <span className="text-xs text-muted-foreground self-center">Loading widgets…</span> : null}
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {sortedViews.map(v => {
                const href = `/ship/${encodeURIComponent(slug)}/views/${encodeURIComponent(v.id)}`
                return (
                  <Card key={v.id} className={cn('border-border/60 hover:shadow-sm transition-shadow')}>
                    <CardHeader className="pb-4">
                      <CardTitle className="text-base flex items-center justify-between gap-2">
                        <Link href={href} className="truncate hover:underline underline-offset-2">
                          {v.name}
                        </Link>
                        <code className="text-[11px] font-mono text-muted-foreground">{v.slug}</code>
                      </CardTitle>
                      <CardDescription className="text-sm">{v.description || '—'}</CardDescription>
                    </CardHeader>
                    <CardContent className="pt-0 flex items-center justify-between">
                      <div className="text-xs text-muted-foreground">
                        {v.layout?.cols ?? 3} cols · {Array.isArray(v.layout?.items) ? v.layout.items.length : 0} widgets
                      </div>
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
    </div>
  )
}

