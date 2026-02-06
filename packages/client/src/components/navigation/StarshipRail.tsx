'use client'

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { StarshipsLogo } from '@/components/ui/starships-logo'
import Icon from '@/components/primitives/Icon'
import { useNotificationsList } from '@/hooks/useNotifications'
import type { StarshipModel } from '@starships/protocol'
import { useMemo } from 'react'
import { usePathname, useRouter } from 'next/navigation'

function getInitials(name: string): string {
  const cleaned = (name || '').trim()
  if (!cleaned) return 'S'
  const parts = cleaned.split(/\s+/).filter(Boolean)
  const first = parts[0]?.[0] ?? 'S'
  const second = parts.length > 1 ? parts[1]?.[0] : undefined
  return (first + (second ?? '')).toUpperCase()
}

function StarshipRailItem({
  starship,
  isActive,
  onSelect,
}: {
  starship: StarshipModel
  isActive: boolean
  onSelect: (starship: StarshipModel) => void
}) {
  const { data } = useNotificationsList(starship.id, Boolean(starship?.id))
  const hasUnread = Boolean((data as any)?.unread?.totalUnread && (data as any).unread.totalUnread > 0)

  return (
    <Tooltip key={starship.id} delayDuration={250}>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={() => onSelect(starship)}
          className={[
            'relative flex h-10 w-10 items-center justify-center rounded-2xl border transition-all',
            'bg-muted/10 text-muted-foreground hover:bg-muted hover:text-foreground',
            isActive ? 'border-primary/50 bg-primary/10 text-primary shadow-sm' : 'border-border/60',
          ].join(' ')}
          aria-label={`Switch to ${starship.name}${hasUnread ? ' (has unread notifications)' : ''}`}
          aria-current={isActive ? 'page' : undefined}
        >
          {/* Discord-like active indicator */}
          <span
            className={[
              'absolute -left-2 top-1/2 h-6 w-1 -translate-y-1/2 rounded-full transition-opacity',
              isActive ? 'bg-primary opacity-100' : 'bg-primary opacity-0',
            ].join(' ')}
          />

          {/* Pending notifications badge */}
          {hasUnread ? (
            <span
              className="absolute top-0 right-0 h-2 w-2 rounded-full bg-red-500/90 dark:bg-red-400/90 shadow-sm"
              aria-label="Unread notifications"
              title="Unread notifications"
            />
          ) : null}

          <span className="text-xs font-semibold">{getInitials(starship.name)}</span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={10} className="z-[1001] rounded-lg bg-popover shadow-lg">
        <div className="grid grid-cols-[22px_1fr] items-center gap-x-2 gap-y-0.5">
          <div className="mt-0.5">
            <StarshipsLogo
              width={22}
              height={22}
              className="text-muted-foreground"
              gradientId={`rail-tooltip-gradient-${starship.id}`}
              idleLoop={false}
              playOnMountOnce={false}
            />
          </div>
          <div className="text-[15px] font-medium tracking-tight leading-none text-muted-foreground">{starship.name}</div>
          <div className="col-span-2 text-xs text-muted-foreground">Switch starship</div>
        </div>
      </TooltipContent>
    </Tooltip>
  )
}

export function StarshipRail({
  starships,
  activeSlug,
  onSelect,
}: {
  starships: StarshipModel[]
  activeSlug: string | null
  onSelect: (starship: StarshipModel) => void
  onCreate?: () => void
}) {
  const items = useMemo(() => (Array.isArray(starships) ? starships : []), [starships])
  const pathname = usePathname()
  const router = useRouter()

  const isMarketplaceActive = typeof pathname === 'string' && (pathname === '/marketplace' || pathname.startsWith('/marketplace/'))

  return (
    <div
      className="flex h-full w-14 flex-col items-center gap-2 border-r border-border/60 bg-card py-3"
      aria-label="Starship switcher"
    >
      {/* Top spacer (aligns visually with sidebar header) */}
      <div className="h-1" />

      {/* Add vertical padding so corner badges/indicators never clip at scroll edges. */}
      <div className="flex w-full flex-1 flex-col items-center gap-2 overflow-y-auto overflow-x-visible px-2 py-2 custom-scrollbar">
        {items.map(s => {
          const isActive = Boolean(activeSlug && s.slug === activeSlug)
          return <StarshipRailItem key={s.id} starship={s} isActive={isActive} onSelect={onSelect} />
        })}

        <div className="my-1 h-px w-8 bg-border/60" aria-hidden />

        <Tooltip delayDuration={250}>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => router.push('/marketplace')}
              className={[
                'relative flex h-10 w-10 items-center justify-center rounded-2xl border transition-all',
                'bg-muted/10 text-muted-foreground hover:bg-muted hover:text-foreground',
                isMarketplaceActive ? 'border-primary/50 bg-primary/10 text-primary shadow-sm' : 'border-border/60',
              ].join(' ')}
              aria-label="Marketplace"
              aria-current={isMarketplaceActive ? 'page' : undefined}
            >
              {/* Discord-like active indicator */}
              <span
                className={[
                  'absolute -left-2 top-1/2 h-6 w-1 -translate-y-1/2 rounded-full transition-opacity',
                  isMarketplaceActive ? 'bg-primary opacity-100' : 'bg-primary opacity-0',
                ].join(' ')}
              />
              <Icon name="store" className="h-5 w-5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={10} className="z-[1001] rounded-lg bg-popover shadow-lg">
            <div className="grid grid-cols-[22px_1fr] items-center gap-x-2 gap-y-0.5">
              <div className="mt-0.5">
                <Icon name="store" className="h-[22px] w-[22px] text-muted-foreground" />
              </div>
              <div className="text-[15px] font-medium tracking-tight leading-none text-muted-foreground">Marketplace</div>
              <div className="col-span-2 text-xs text-muted-foreground">Explore agents</div>
            </div>
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  )
}

