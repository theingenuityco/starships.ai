'use client'

import { useMemo } from 'react'
import { useParams } from 'next/navigation'

import Icon from '@/components/primitives/Icon'
import { MobileNavToggleButton } from '@/components/navigation/MobileNavToggleButton'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { WidgetRenderer, type WidgetConfig } from '@/components/widgets'
import { useStarshipBySlug } from '@/hooks/useStarships'
import { useView } from '@/hooks/useViews'
import { useStarshipWidgets } from '@/hooks/useWidgets'
import { cn } from '@/lib/utils'

export default function ViewDetailPage() {
  const { slug: slugParam, viewId: viewIdParam } = useParams<{ slug: string; viewId: string }>()
  const slug = typeof slugParam === 'string' ? slugParam : ''
  const viewId = typeof viewIdParam === 'string' ? viewIdParam : ''

  const { data: starship } = useStarshipBySlug(slug, Boolean(slug))
  const starshipId = starship?.id ? String(starship.id) : ''

  const viewQuery = useView(viewId, Boolean(viewId))
  const view = viewQuery.data

  const widgetsQuery = useStarshipWidgets(starshipId, Boolean(starshipId))
  const widgets = widgetsQuery.data ?? []

  const widgetById = useMemo(() => {
    const map = new Map<string, (typeof widgets)[number]>()
    for (const w of widgets) {
      if (w?.id) map.set(String(w.id), w)
    }
    return map
  }, [widgets])

  const cols = Math.max(1, Math.min(12, Math.floor(Number(view?.layout?.cols ?? 3))))

  const MIN_COL_WIDTH_PX = 520
  const gridStyle = useMemo<React.CSSProperties>(
    () => ({
      gridTemplateColumns: `repeat(${cols}, minmax(${MIN_COL_WIDTH_PX}px, 1fr))`,
    }),
    [cols]
  )

  const sortedItems = useMemo(() => {
    const items = Array.isArray(view?.layout?.items) ? view!.layout.items : []
    return items.slice().sort((a, b) => (a.row - b.row) || (a.col - b.col))
  }, [view])

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
                    <h3 className="flex-1 text-base font-medium text-foreground truncate leading-tight min-w-0">
                      {view?.name ?? 'View'}
                    </h3>
                  </div>
                  <div className="min-w-0 text-xs leading-snug text-muted-foreground min-h-6">
                    <span className="block min-w-0 truncate font-medium leading-snug text-muted-foreground">
                      {view?.description || `Saved widget grid (${cols} columns).`}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {view?.slug ? (
              <div className="hidden md:block text-xs text-muted-foreground truncate max-w-[40%]" title={view.slug}>
                <code className="font-mono">{view.slug}</code>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-visible md:overflow-y-auto px-4 pt-6 pb-8 md:pb-8">
        <div className="w-full bg-transparent max-w-none mx-auto min-h-full flex flex-col gap-4">
          {viewQuery.isLoading ? (
            <div className="flex items-center justify-center py-10">
              <p className="text-sm text-muted-foreground">Loading view…</p>
            </div>
          ) : !view ? (
            <div className="flex items-center justify-center py-10">
              <p className="text-sm text-muted-foreground">View not found.</p>
            </div>
          ) : (
            <div className="w-full overflow-x-auto pb-4">
              <div className="grid gap-5 items-start" style={gridStyle}>
                {sortedItems.map(item => {
                  const widget = widgetById.get(String(item.widgetId))
                  const colSpan = Math.max(1, Math.floor(Number(item.colSpan ?? 1)))
                  const rowSpan = Math.max(1, Math.floor(Number(item.rowSpan ?? 1)))

                  return (
                    <Card
                      key={item.id}
                      className={cn('border-border/60 shadow-sm')}
                      style={{
                        gridColumn: `${item.col + 1} / span ${colSpan}`,
                        gridRow: `${item.row + 1} / span ${rowSpan}`,
                      }}
                    >
                      <CardHeader className="pb-4">
                        <CardTitle className="text-sm font-semibold flex items-center justify-between gap-2">
                          <span className="truncate">{widget?.name ?? 'Missing widget'}</span>
                          <code className="text-[11px] font-mono text-muted-foreground">{widget?.widgetType ?? item.widgetId}</code>
                        </CardTitle>
                        {widget?.description ? <CardDescription className="text-xs">{widget.description}</CardDescription> : null}
                      </CardHeader>
                      <CardContent className="pt-0">
                        {widget ? (
                          <WidgetRenderer
                            widget={
                              {
                                id: widget.id,
                                widgetType: widget.widgetType,
                                props: widget.props,
                              } satisfies WidgetConfig
                            }
                            className="w-full max-w-none"
                          />
                        ) : (
                          <div className="p-4 border border-red-500 rounded-lg bg-red-50 dark:bg-red-950/20">
                            <p className="text-sm text-red-600 dark:text-red-400">Widget not found for id: <code className="font-mono">{item.widgetId}</code></p>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

