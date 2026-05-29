'use client'

import Icon from '@/components/primitives/Icon'
import { NavigationItem } from '@/components/navigation/NavigationItem'
import { useStarshipRooms } from '@/hooks/useRooms'
import { RoomNestedRecentConversations } from '@/components/rooms/RoomNestedRecentConversations'
import { useDemo } from '@/components/demo/DemoContext'
import { DEMO_ROOMS } from '@/components/demo/demoRooms'
import { demoRoomAggregateStatus } from '@/components/demo/demoActivity'
import { DemoStatusIndicator } from '@/components/demo/DemoStatusIndicator'
import type { RoomModel } from '@starships/protocol'
import { AnimatePresence, motion } from 'motion/react'
import { usePathname, useRouter } from 'next/navigation'
import { useMemo } from 'react'

export function RoomSidebarList(props: { starshipId: string; starshipSlug: string; onNavigate?: () => void; onAddRoom?: () => void }) {
  const router = useRouter()
  const pathname = usePathname()

  const { data: roomsData, isLoading } = useStarshipRooms(props.starshipId, Boolean(props.starshipId))

  // Demo clock: while the hero-video demo is running, the sidebar highlight
  // follows the "camera" (the room the VO is on for the current beat) instead
  // of the URL. Inert for real users — `active` is false off the demo surface.
  const { active: demoActive, beat, spotlight } = useDemo()

  // When the demo is active, the sidebar shows ONLY the three toured rooms
  // (Support / Engineering / Growth) from client-side mock data — the real
  // wired rooms are hidden so the demo navigation stays clean and scripted.
  const rooms = useMemo<RoomModel[]>(() => {
    const real = (roomsData?.rooms || []) as RoomModel[]
    return demoActive ? DEMO_ROOMS : real
  }, [roomsData?.rooms, demoActive])
  const demoConversationId = demoActive ? spotlight.conversationId : null
  // The spotlight names a lane ('support' | 'engineering' | 'growth'); map it to
  // the real room slugs those bundles produce (the Growth lane is the leadgen room).
  const demoSlugCandidates = useMemo<string[] | null>(() => {
    if (!demoActive || !spotlight.room) return null
    const map: Record<string, string[]> = {
      support: ['support'],
      engineering: ['engineering', 'eng'],
      growth: ['growth', 'leadgen', 'lead-generation'],
    }
    return map[spotlight.room] ?? [spotlight.room]
  }, [demoActive, spotlight.room])

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
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">Rooms</div>
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
        <div className="h-full overflow-y-auto pr-1">
          <div className="space-y-0.5">
            {isLoading && sorted.length === 0 ? (
              <div className="text-xs text-muted-foreground px-1 py-2">Loading…</div>
            ) : null}
            {!isLoading && sorted.length === 0 ? (
              <div className="text-xs text-muted-foreground px-1 py-2">No rooms yet</div>
            ) : null}
            {/* Rooms enter/exit and reorder with the same opacity + `layout="position"`
                language as Mission Control's activity log. */}
            <AnimatePresence initial={false} mode="popLayout">
              {sorted.map((r) => {
                const slug = String(r.slug || '').trim()
                const name = String(r.name || '').trim() || slug || 'Room'
                const isActive = demoSlugCandidates
                  ? demoSlugCandidates.includes(slug.toLowerCase())
                  : activeRoomSlug
                    ? String(activeRoomSlug).toLowerCase() === slug.toLowerCase()
                    : false
                const href = `/ship/${encodeURIComponent(props.starshipSlug)}/rooms/${encodeURIComponent(slug)}`
                const roomConversationId = typeof (r as any)?.conversationId === 'string' ? String((r as any).conversationId).trim() : ''
                // Demo: show a live status indicator on rooms with something happening.
                const roomStatus = demoActive ? demoRoomAggregateStatus(slug, beat) : 'idle'
                const showRoomStatus = demoActive && roomStatus !== 'idle'
                return (
                  <motion.div
                    key={String(r.conversationId || slug)}
                    layout="position"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.25, ease: 'easeOut' }}
                    className="w-full"
                  >
                    <NavigationItem
                      href={href}
                      label={name}
                      icon="hash"
                      isActive={isActive}
                      expanded
                      onClick={() => openRoom(slug)}
                      trailing={
                        showRoomStatus || r.isPrivate ? (
                          <span className="flex items-center gap-1">
                            {showRoomStatus ? <DemoStatusIndicator status={roomStatus} /> : null}
                            {r.isPrivate ? (
                              <span className="flex-shrink-0 text-muted-foreground" title="Private room" aria-label="Private room">
                                <Icon name="lock" weight="fill" className="h-3 w-3" />
                              </span>
                            ) : null}
                          </span>
                        ) : null
                      }
                    />
                    {roomConversationId ? (
                      <RoomNestedRecentConversations
                        starshipSlug={props.starshipSlug}
                        roomSlug={slug}
                        roomConversationId={roomConversationId}
                        activeConversationId={isActive ? (demoSlugCandidates ? demoConversationId : activeConversationId) : null}
                        highlightFirst={Boolean(isActive && demoSlugCandidates && !demoConversationId)}
                        onNavigate={props.onNavigate}
                      />
                    ) : null}
                  </motion.div>
                )
              })}
            </AnimatePresence>
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={() => {
          if (props.onAddRoom) {
            props.onAddRoom()
          } else {
            router.push(`/ship/${encodeURIComponent(props.starshipSlug)}/rooms`)
            props.onNavigate?.()
          }
        }}
        className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-border px-2 py-1.5 text-xs text-muted-foreground hover:border-muted-foreground/50 hover:text-foreground transition-colors"
      >
        <Icon name="plus" className="h-3.5 w-3.5 flex-shrink-0" />
        Add room
      </button>
    </div>
  )
}

