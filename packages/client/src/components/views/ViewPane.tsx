'use client'

import Icon from '@/components/primitives/Icon'
import { Button } from '@/components/ui/button'
import { CardDescription } from '@/components/ui/card'
import { useView } from '@/hooks/useViews'
import { cn } from '@/lib/utils'
import type { ViewModel } from '@starships/protocol'
import { DynamicViewRenderer } from './DynamicViewRenderer'

export function ViewPane(props: {
  starshipId: string
  viewId: string
  onClose: () => void
  className?: string
}) {
  const { starshipId: _starshipId, viewId, onClose, className } = props

  const viewQuery = useView(viewId, Boolean(viewId))
  const view: ViewModel | undefined = viewQuery.data

  return (
    <div className={cn('relative flex flex-col h-full min-h-0 w-full min-w-0', className)}>
      <div className="sticky top-0 z-10 border-b border-border/60 bg-card">
        <div className="px-4 pt-3.5 pb-2 md:py-2">
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1 min-w-0 flex flex-col justify-center gap-1">
              <div className="flex min-w-0 w-full gap-2 items-center">
                <span className="flex-shrink-0 self-center md:hidden">
                  <button
                    type="button"
                    className="mx-2 inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                    onClick={onClose}
                    aria-label="Back to conversation"
                    title="Back"
                  >
                    <Icon name="arrow-left" className="h-5 w-5" />
                  </button>
                </span>
                <div className="min-w-0 flex-1 flex flex-col justify-center gap-1">
                  <div className="flex items-baseline gap-2 min-w-0 w-full">
                    <span aria-hidden="true" className="flex-shrink-0 self-center text-foreground leading-none">
                      <Icon name="bar-chart" weight="bold" className="h-4 w-4" />
                    </span>
                    <h3 className="flex-1 text-base font-medium text-foreground truncate leading-tight min-w-0">{view?.name ?? 'View'}</h3>
                  </div>
                  <div className="min-w-0 text-xs leading-snug text-muted-foreground min-h-6">
                    <span className="block min-w-0 truncate font-medium leading-snug text-muted-foreground">
                      {view?.description || 'Saved view.'}
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

            <div className="flex items-center gap-2 flex-shrink-0">
              <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close view" title="Close view">
                <Icon name="x" className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 pt-6 pb-8">
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
            <div className="w-full min-w-0">
              <DynamicViewRenderer view={view} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

