'use client'

import { useParams } from 'next/navigation'

import Icon from '@/components/primitives/Icon'
import { MobileNavToggleButton } from '@/components/navigation/MobileNavToggleButton'
import { DynamicViewRenderer } from '@/components/views/DynamicViewRenderer'
import { useStarshipBySlug } from '@/hooks/useStarships'
import { useView } from '@/hooks/useViews'

export default function ViewDetailPage() {
  const { slug: slugParam, viewId: viewIdParam } = useParams<{ slug: string; viewId: string }>()
  const slug = typeof slugParam === 'string' ? slugParam : ''
  const viewId = typeof viewIdParam === 'string' ? viewIdParam : ''

  const { data: starship } = useStarshipBySlug(slug, Boolean(slug))
  void starship

  const viewQuery = useView(viewId, Boolean(viewId))
  const view = viewQuery.data

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
            <div className="w-full min-w-0">
              <DynamicViewRenderer view={view} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

