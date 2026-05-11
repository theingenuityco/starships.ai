'use client'

import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import Icon from '@/components/primitives/Icon'
import { cn } from '@/lib/utils'
import { useBundleServiceBundles, useInstallBundleFromService, type BundleSummary } from '@/hooks/useBundleService'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  starshipId: string
  /** Filter which bundles are shown. Defaults to showing all. */
  kindFilter?: BundleSummary['meta']['kind'][]
  title?: string
  description?: string
}

function entityCount(bundle: BundleSummary): string {
  const e = bundle.manifest.entities
  const parts: string[] = []
  const agents = e.agents?.length ?? 0
  const tools = e.tools?.length ?? 0
  const rooms = e.rooms?.length ?? 0
  const datasets = e.datasets?.length ?? 0
  const taskBoards = e.taskBoards?.length ?? 0
  if (agents > 0) parts.push(`${agents} agent${agents > 1 ? 's' : ''}`)
  if (tools > 0) parts.push(`${tools} tool${tools > 1 ? 's' : ''}`)
  if (rooms > 0) parts.push(`${rooms} room${rooms > 1 ? 's' : ''}`)
  if (datasets > 0) parts.push(`${datasets} dataset${datasets > 1 ? 's' : ''}`)
  if (taskBoards > 0) parts.push(`${taskBoards} board${taskBoards > 1 ? 's' : ''}`)
  return parts.join(' · ') || 'Empty bundle'
}

export function BundleServiceModal({ open, onOpenChange, starshipId, kindFilter, title = 'Browse bundles', description = 'Install pre-built bundles from the bundle service.' }: Props) {
  const { data: bundles = [], isLoading, isError } = useBundleServiceBundles(starshipId)
  const install = useInstallBundleFromService(starshipId)
  const [installingId, setInstallingId] = useState<string | null>(null)

  const visible = kindFilter
    ? bundles.filter(b => kindFilter.includes(b.meta.kind ?? 'tool'))
    : bundles

  const handleInstall = async (bundle: BundleSummary) => {
    setInstallingId(bundle.id)
    try {
      await install.mutateAsync(bundle.id)
      onOpenChange(false)
    } finally {
      setInstallingId(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[640px] max-h-[80vh] flex flex-col overflow-hidden p-0">
        <DialogHeader className="shrink-0 px-6 pt-6 pb-4">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto px-6 pb-6">
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-24 rounded-xl border border-border/60 bg-card animate-pulse" />
              ))}
            </div>
          ) : isError ? (
            <div className="rounded-xl border border-border/60 bg-card/10 p-4 text-center">
              <p className="text-sm text-muted-foreground">Could not reach the bundle service.</p>
              <p className="text-xs text-muted-foreground mt-1">Make sure <code className="font-mono">BUNDLE_SERVICE_URL</code> is configured.</p>
            </div>
          ) : visible.length === 0 ? (
            <div className="rounded-xl border border-border/60 bg-card/10 p-4 text-center">
              <p className="text-sm text-muted-foreground">No bundles available.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {visible.map(bundle => {
                const isInstalling = installingId === bundle.id
                return (
                  <div key={bundle.id} className="rounded-xl border border-border/60 bg-card px-4 py-4 flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sm font-semibold text-foreground truncate">{bundle.meta.name}</span>
                        {bundle.meta.version ? (
                          <span className="flex-shrink-0 text-[11px] text-muted-foreground font-mono">v{bundle.meta.version}</span>
                        ) : null}
                      </div>
                      {bundle.meta.description ? (
                        <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{bundle.meta.description}</p>
                      ) : null}
                      <p className="mt-2 text-[11px] text-muted-foreground/70">{entityCount(bundle)}</p>
                      {bundle.meta.tags && bundle.meta.tags.length > 0 ? (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {bundle.meta.tags.map(tag => (
                            <span key={tag} className={cn('text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium')}>
                              {tag}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                    <div className="flex-shrink-0 self-center">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={isInstalling || install.isPending}
                        onClick={() => handleInstall(bundle)}
                        className="min-w-[90px]"
                      >
                        {isInstalling ? (
                          <>
                            <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin mr-1.5" />
                            Installing…
                          </>
                        ) : (
                          <>
                            <Icon name="download" className="h-3.5 w-3.5 mr-1.5" />
                            Install
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
