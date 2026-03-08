'use client'

import Icon from '@/components/primitives/Icon'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { useStarshipRooms } from '@/hooks/useRooms'
import type { RoomModel } from '@starships/protocol'
import { usePathname, useRouter } from 'next/navigation'
import { useMemo } from 'react'

export function RoomSidebarList(props: { starshipId: string; starshipSlug: string; onNavigate?: () => void }) {
  const router = useRouter()
  const pathname = usePathname()

  const { data: roomsData, isLoading } = useStarshipRooms(props.starshipId, Boolean(props.starshipId))
  const rooms = (roomsData?.rooms || []) as RoomModel[]

  const sorted = useMemo(() => {
    const list = Array.isArray(rooms) ? rooms.slice() : []
    const norm = (s: unknown) => String(s || '').trim().toLowerCase()
    // Lobby first, then most-recent activity.
    list.sort((a, b) => {
      const al = norm(a.slug) === 'lobby'
      const bl = norm(b.slug) === 'lobby'
      if (al !== bl) return al ? -1 : 1
      return String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt))
    })
    return list
  }, [rooms])

  const activeRoomSlug = useMemo(() => {
    const p = String(pathname || '')
    const base = `/ship/${encodeURIComponent(props.starshipSlug)}/rooms/`
    if (!p.startsWith(base)) return null
    const rest = p.slice(base.length)
    const slug = rest.split('/')[0] || ''
    return slug ? decodeURIComponent(slug) : null
  }, [pathname, props.starshipSlug])

  const openRoom = (roomSlug: string) => {
    const slug = String(roomSlug || '').trim()
    if (!slug) return
    router.push(`/ship/${encodeURIComponent(props.starshipSlug)}/rooms/${encodeURIComponent(slug)}`)
    props.onNavigate?.()
  }

  return (
    <div className="flex flex-col min-h-0">
      <div className="flex items-center justify-between px-1 pb-1">
        <div className="text-[11px] font-medium text-muted-foreground">Rooms</div>
        <button
          type="button"
          onClick={() => {
            router.push(`/ship/${encodeURIComponent(props.starshipSlug)}/rooms`)
            props.onNavigate?.()
          }}
          className="inline-flex items-center justify-center w-6 h-6 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/70 dark:hover:bg-[#2C2C30] transition-colors"
          aria-label="Manage rooms"
          title="Manage rooms"
        >
          <Icon name="plus" className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
        <ScrollArea className="h-full pr-1">
          <div className="space-y-0.5">
            {isLoading && sorted.length === 0 ? (
              <div className="text-xs text-muted-foreground px-1 py-2">Loading…</div>
            ) : null}
            {!isLoading && sorted.length === 0 ? (
              <div className="text-xs text-muted-foreground px-1 py-2">No rooms yet</div>
            ) : null}
            {sorted.map((r) => {
              const slug = String(r.slug || '').trim()
              const name = String(r.name || '').trim() || slug || 'Room'
              const isActive = activeRoomSlug ? String(activeRoomSlug).toLowerCase() === slug.toLowerCase() : false
              return (
                <button
                  key={String(r.conversationId || slug)}
                  type="button"
                  onClick={() => openRoom(slug)}
                  className={cn(
                    'w-full rounded-lg flex items-center gap-1.5 border border-transparent h-7 px-1 text-left',
                    'hover:bg-muted/60 dark:hover:bg-[#2C2C30]',
                    isActive && 'bg-muted/60 dark:bg-[#2C2C30] border-border/40'
                  )}
                >
                  <span className="flex-shrink-0 w-3 h-3 inline-flex items-center justify-center text-muted-foreground">
                    <Icon name="hash" className="h-3 w-3" />
                  </span>
                  <span className="flex-1 min-w-0 truncate text-[12px]">{name}</span>
                  {r.isPrivate ? (
                    <span className="flex-shrink-0 text-muted-foreground" title="Private room" aria-label="Private room">
                      <Icon name="lock" weight="fill" className="h-3 w-3" />
                    </span>
                  ) : null}
                </button>
              )
            })}
          </div>
        </ScrollArea>
      </div>
    </div>
  )
}

