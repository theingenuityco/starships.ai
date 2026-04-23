'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useStarshipRooms, useEnsureRoom } from '@/hooks/useRooms'
import { ROOM_CATALOG, type RoomCatalogEntry } from '@/config/room-catalog'
import type { RoomModel } from '@starships/protocol'

export function RoomTemplatesModal({
  open,
  onOpenChange,
  starshipId,
  starshipSlug,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  starshipId: string
  starshipSlug: string
}) {
  const router = useRouter()
  const { data: roomsData } = useStarshipRooms(starshipId, open && Boolean(starshipId))
  const ensureRoom = useEnsureRoom(starshipId)
  const [deploying, setDeploying] = useState<string | null>(null)

  const deployedRoomsByBundle = new Map<string, RoomModel>(
    (roomsData?.rooms ?? [])
      .filter(r => r.provisionedByBundle)
      .map(r => [r.provisionedByBundle as string, r])
  )

  async function handleDeploy(entry: RoomCatalogEntry) {
    if (deploying) return
    setDeploying(entry.bundleId)
    try {
      const result = await ensureRoom.mutateAsync(entry.ensureEndpoint)
      const slug = result?.room?.slug
      onOpenChange(false)
      if (slug) {
        router.push(`/ship/${starshipSlug}/rooms/${encodeURIComponent(slug)}`)
      }
    } finally {
      setDeploying(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl p-0 gap-0 overflow-hidden">
        <div className="px-6 pt-6 pb-4 border-b border-border/60">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">Rooms</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              Deploy a pre-built workspace to your ship in one click.
            </DialogDescription>
          </DialogHeader>
        </div>

        <ScrollArea className="max-h-[70vh]">
        <div className="grid grid-cols-3 gap-3 p-4">
          {ROOM_CATALOG.map(entry => {
            const deployedRoom = deployedRoomsByBundle.get(entry.bundleId)
            const isDeployed = Boolean(deployedRoom)
            const isDeploying = deploying === entry.bundleId

            return (
              <div
                key={entry.bundleId}
                className={cn(
                  'group relative flex flex-col rounded-lg border overflow-hidden transition-all duration-150',
                  isDeployed
                    ? 'border-emerald-500/25'
                    : entry.comingSoon
                      ? 'border-border/40 opacity-70'
                      : 'border-border/60 hover:border-primary/50 hover:shadow-sm'
                )}
              >
                {/* Preview banner */}
                <div className="relative h-36 w-full overflow-hidden bg-muted/40">
                  {entry.previewImage ? (
                    <>
                      <Image
                        src={entry.previewImage}
                        alt={entry.name}
                        fill
                        className={cn('object-cover object-top', entry.comingSoon && 'opacity-40 grayscale')}
                        sizes="(max-width: 512px) 100vw, 512px"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-card via-card/10 to-transparent" />
                    </>
                  ) : (
                    <div className={cn(
                      'absolute inset-0 flex items-center justify-center bg-gradient-to-br',
                      entry.comingSoon
                        ? 'from-muted/40 via-muted/20 to-transparent'
                        : 'from-primary/10 via-primary/5 to-transparent'
                    )}>
                      <span className={cn('text-5xl select-none', entry.comingSoon && 'opacity-50 grayscale')}>{entry.icon}</span>
                    </div>
                  )}

                  {/* Status pill — bottom-left of banner */}
                  <div className="absolute bottom-3 left-4 flex items-center gap-2">
                    <div className={cn(
                      'flex h-8 w-8 items-center justify-center rounded-lg text-base select-none shadow-sm',
                      isDeployed ? 'bg-emerald-500/20 ring-1 ring-emerald-500/30' : 'bg-card/90 ring-1 ring-border/60'
                    )}>
                      {entry.icon}
                    </div>
                    {isDeployed && (
                      <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-500 ring-1 ring-emerald-500/25">
                        Deployed
                      </span>
                    )}
                    {entry.comingSoon && (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground ring-1 ring-border/60">
                        Coming soon
                      </span>
                    )}
                  </div>
                </div>

                {/* Card body */}
                <div className={cn(
                  'flex flex-col gap-3 p-4 pt-2',
                  isDeployed && 'bg-emerald-500/5'
                )}>
                  <div>
                    <p className="text-sm font-semibold text-foreground">{entry.name}</p>
                    <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{entry.description}</p>
                  </div>

                  {/* Features */}
                  <div className="flex flex-wrap gap-1.5">
                    {entry.features.map(feature => (
                      <span
                        key={feature}
                        className="inline-flex items-center rounded-md border border-border/50 bg-muted/40 px-2 py-0.5 text-[11px] text-muted-foreground"
                      >
                        {feature}
                      </span>
                    ))}
                  </div>

                  {/* CTA */}
                  {isDeployed ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full border-emerald-500/30 text-emerald-600 hover:bg-emerald-500/10 hover:text-emerald-500"
                      asChild
                    >
                      <Link
                        href={`/ship/${starshipSlug}/rooms/${encodeURIComponent(deployedRoom!.slug)}`}
                        onClick={() => onOpenChange(false)}
                      >
                        Open room →
                      </Link>
                    </Button>
                  ) : entry.comingSoon ? (
                    <Button size="sm" variant="outline" className="w-full" disabled>
                      Coming soon
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      className="w-full"
                      disabled={isDeploying || deploying !== null}
                      onClick={() => handleDeploy(entry)}
                    >
                      {isDeploying ? 'Setting up…' : 'Add to workspace →'}
                    </Button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
