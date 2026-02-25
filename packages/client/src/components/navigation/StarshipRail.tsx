'use client'

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { StarshipsLogo } from '@/components/ui/starships-logo'
import Icon from '@/components/primitives/Icon'
import { useNotificationsList } from '@/hooks/useNotifications'
import { useAuth } from '@/hooks/useAuth'
import type { StarshipModel } from '@starships/protocol'
import { memo, useCallback, useMemo, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'

function getInitials(name: string): string {
  const cleaned = (name || '').trim()
  if (!cleaned) return 'S'
  const parts = cleaned.split(/\s+/).filter(Boolean)
  const first = parts[0]?.[0] ?? 'S'
  const second = parts.length > 1 ? parts[1]?.[0] : undefined
  return (first + (second ?? '')).toUpperCase()
}

const StarshipRailItem = memo(
  function StarshipRailItem({ starship, isActive, onSelect }: { starship: StarshipModel; isActive: boolean; onSelect: (starship: StarshipModel) => void }) {
    const { data } = useNotificationsList(starship.id, Boolean(starship?.id))
    const hasUnread = Boolean((data as any)?.unread?.totalUnread && (data as any).unread.totalUnread > 0)

    return (
      <Tooltip key={starship.id} delayDuration={250}>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => onSelect(starship)}
            className={[
              'group relative flex h-9 w-9 items-center justify-center rounded-xl border transition-all',
              isActive ? 'border-primary/50 bg-primary/10 text-primary shadow-sm' : 'border-border/60 bg-muted/10 text-muted-foreground hover:border-primary/50 hover:bg-primary/10 hover:text-primary hover:shadow-sm',
            ].join(' ')}
            aria-label={`Switch to ${starship.name}${hasUnread ? ' (has unread notifications)' : ''}`}
            aria-current={isActive ? 'page' : undefined}
          >
            {/* Discord-like indicator: full height when active, half height when hover only */}
            <span
              className={[
                'absolute -left-2 top-1/2 w-1 -translate-y-1/2 rounded-full bg-primary transition-all',
                isActive ? 'h-5 opacity-100' : 'h-3 opacity-0 group-hover:opacity-100',
              ].join(' ')}
            />

            {/* Pending notifications badge */}
            {hasUnread ? (
              <span className="absolute top-0 right-0 h-2 w-2 rounded-full bg-red-500/90 dark:bg-red-400/90 shadow-sm" aria-label="Unread notifications" title="Unread notifications" />
            ) : null}

            <span className="text-[10px] font-semibold">{getInitials(starship.name)}</span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="right" sideOffset={10} className="z-[1001] rounded-lg bg-popover text-popover-foreground shadow-lg">
          <p className="text-sm font-medium">{starship.name}</p>
        </TooltipContent>
      </Tooltip>
    )
  },
  (prev, next) =>
    prev.isActive === next.isActive &&
    prev.onSelect === next.onSelect &&
    prev.starship?.id === next.starship?.id &&
    prev.starship?.slug === next.starship?.slug &&
    prev.starship?.name === next.starship?.name
)
StarshipRailItem.displayName = 'StarshipRailItem'

export function StarshipRail({ starships, activeSlug, onSelect }: { starships: StarshipModel[]; activeSlug: string | null; onSelect: (starship: StarshipModel) => void; onCreate?: () => void }) {
  const items = useMemo(() => (Array.isArray(starships) ? starships : []), [starships])
  const pathname = usePathname()
  const router = useRouter()
  const { user } = useAuth()
  const [logoTrigger, setLogoTrigger] = useState(0)

  const ownedTargetSlug = useMemo(() => {
    // Preferred destination is an owned starship, but non-owners should still get a sane default.
    const uid = typeof user?.id === 'string' ? user.id : ''
    const owned = uid ? items.find(s => String((s as any)?.ownerId || '') === uid) : null
    return (owned?.slug || activeSlug || items[0]?.slug || '').trim() || null
  }, [activeSlug, items, user?.id])

  const handleTopLogoClick = useCallback(() => {
    // Keep the logo animated even if idleLoop is disabled in the future.
    setLogoTrigger(v => v + 1)
    if (ownedTargetSlug) {
      router.push(`/ship/${encodeURIComponent(ownedTargetSlug)}`)
      return
    }
    router.push('/')
  }, [ownedTargetSlug, router])

  const isMarketplaceActive = typeof pathname === 'string' && (pathname === '/explore' || pathname.startsWith('/explore/') || pathname === '/marketplace' || pathname.startsWith('/marketplace/'))

  return (
    <div className="flex h-full w-16 flex-col items-center gap-1.5 bg-card pt-3 pb-2.5" aria-label="Starship switcher">
      {/* Top logo – same sizing as rail items for clean alignment */}
      <Tooltip delayDuration={250}>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={handleTopLogoClick}
            className={[
              'group relative flex h-9 w-9 items-center justify-center rounded-xl border transition-all',
              'border-border/60 bg-muted/10 text-muted-foreground hover:border-primary/50 hover:bg-primary/10 hover:text-primary hover:shadow-sm',
            ].join(' ')}
            aria-label="Home"
            title="Home"
          >
            <span className="absolute -left-2 top-1/2 h-3 w-1 -translate-y-1/2 rounded-full bg-primary opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
            <StarshipsLogo
              width={18}
              height={18}
              className="text-current"
              gradientId="rail-top-gradient"
              triggerAnimation={logoTrigger}
              activeStroke="currentColor"
              idleLoop={false}
              playOnMountOnce={false}
            />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right" sideOffset={10} className="z-[1001] rounded-lg bg-popover text-popover-foreground shadow-lg">
          <p className="text-sm font-medium">Home</p>
        </TooltipContent>
      </Tooltip>

      {/* Scrollable starships + marketplace – spacing matches Discord-style rail */}
      <div className="flex w-full flex-1 flex-col items-center gap-1.5 overflow-y-auto overflow-x-visible px-2 pt-1 pb-2 custom-scrollbar">
        {items.map(s => {
          const isActive = Boolean(activeSlug && s.slug === activeSlug)
          return <StarshipRailItem key={s.id} starship={s} isActive={isActive} onSelect={onSelect} />
        })}

        {/* Marketplace shortcut (Explore agents) – directly after last starship */}
        <Tooltip delayDuration={250}>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => router.push('/explore/agents')}
              className={[
                'group relative mt-1 flex h-9 w-9 items-center justify-center rounded-xl border transition-all',
                isMarketplaceActive ? 'border-primary/50 bg-primary/10 text-primary shadow-sm' : 'border-border/60 bg-muted/10 text-muted-foreground hover:border-primary/50 hover:bg-primary/10 hover:text-primary hover:shadow-sm',
              ].join(' ')}
              aria-label="Explore agents"
              aria-current={isMarketplaceActive ? 'page' : undefined}
            >
              <span
                className={[
                  'absolute -left-2 top-1/2 w-1 -translate-y-1/2 rounded-full bg-primary transition-all',
                  isMarketplaceActive ? 'h-5 opacity-100' : 'h-3 opacity-0 group-hover:opacity-100',
                ].join(' ')}
              />
              <Icon name="store" className="h-4 w-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={10} className="z-[1001] rounded-lg bg-popover text-popover-foreground shadow-lg">
            <p className="text-sm font-medium">Explore agents</p>
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  )
}
