'use client'

import Icon from '@/components/primitives/Icon'
import { NavigationItem } from '@/components/navigation/NavigationItem'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useStarshipRooms } from '@/hooks/useRooms'
import { RoomNestedRecentConversations } from '@/components/rooms/RoomNestedRecentConversations'
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

  const activeConversationId = useMemo(() => {
    const p = String(pathname || '')
    const parts = p.split('/').filter(Boolean) // ['ship', slug, 'rooms', roomSlug, 'conversation', conversationId, ...]
    if (parts.length < 6) return null
    if (parts[0] !== 'ship') return null
    if (parts[2] !== 'rooms') return null
    const roomSlug = parts[3] ? decodeURIComponent(parts[3]) : ''
    if (!roomSlug || !activeRoomSlug) return null
    if (roomSlug.toLowerCase() !== String(activeRoomSlug).toLowerCase()) return null
    if (parts[4] !== 'conversation') return null
    const cid = parts[5] ? decodeURIComponent(parts[5]) : ''
    return cid ? cid : null
  }, [activeRoomSlug, pathname])

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
              const href = `/ship/${encodeURIComponent(props.starshipSlug)}/rooms/${encodeURIComponent(slug)}`
              const roomConversationId = typeof (r as any)?.conversationId === 'string' ? String((r as any).conversationId).trim() : ''
              return (
                <div key={String(r.conversationId || slug)} className="w-full">
                  <NavigationItem
                    href={href}
                    label={name}
                    icon="hash"
                    isActive={isActive}
                    expanded
                    onClick={() => openRoom(slug)}
                    trailing={
                      r.isPrivate ? (
                        <span className="flex-shrink-0 text-muted-foreground" title="Private room" aria-label="Private room">
                          <Icon name="lock" weight="fill" className="h-3 w-3" />
                        </span>
                      ) : null
                    }
                  />
                  {roomConversationId ? (
                    <RoomNestedRecentConversations
                      starshipSlug={props.starshipSlug}
                      roomSlug={slug}
                      roomConversationId={roomConversationId}
                      activeConversationId={isActive ? activeConversationId : null}
                      onNavigate={props.onNavigate}
                    />
                  ) : null}
                </div>
              )
            })}
          </div>
        </ScrollArea>
      </div>
    </div>
  )
}

