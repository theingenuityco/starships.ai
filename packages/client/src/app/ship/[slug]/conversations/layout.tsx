'use client'

import api from '@/lib/api'
import { useStarshipRooms } from '@/hooks/useRooms'
import { useStarshipBySlug } from '@/hooks/useStarships'
import type { RoomModel } from '@starships/protocol'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'

type RoomContextResponse = {
  conversationId: string
  roomConversationId: string | null
  isRoom: boolean
  isRoomThread: boolean
}

/**
 * Legacy `/conversations` route.
 *
 * Channels + DMs were removed and conversations are now room-scoped.
 * This layout remains as a redirector for deep links that still target:
 * - `/ship/:slug/conversations` (redirect to Lobby room)
 * - `/ship/:slug/conversations/:conversationId` (redirect to the owning room route)
 *
 * Note: `children` is intentionally ignored; the canonical UI is rendered under `/rooms`.
 */
export default function ConversationsLayout({ children }: { children: React.ReactNode }) {
  void children
  const router = useRouter()
  const searchParams = useSearchParams()
  const params = useParams<{ slug: string; conversationId?: string }>()

  const slug = typeof params.slug === 'string' ? params.slug : ''
  const conversationId = typeof params.conversationId === 'string' ? params.conversationId : null

  const { data: starship } = useStarshipBySlug(slug, Boolean(slug))
  const starshipId = starship?.id ? String(starship.id) : ''
  const { data: roomsData, isLoading: roomsLoading } = useStarshipRooms(starshipId, Boolean(starshipId))
  const rooms = (roomsData?.rooms || []) as RoomModel[]

  const defaultRoomSlug = useMemo(() => {
    const norm = (s: unknown) => String(s || '').trim().toLowerCase()
    const lobby = rooms.find(r => norm(r.slug) === 'lobby')
    const lobbySlug = lobby?.slug ? String(lobby.slug).trim() : ''
    if (lobbySlug) return lobbySlug
    const first = rooms.length > 0 ? String((rooms[0] as any)?.slug || '').trim() : ''
    return first || null
  }, [rooms])

  const threadKey = useMemo(() => {
    const raw = searchParams.get('thread')
    const v = typeof raw === 'string' ? raw.trim() : ''
    return v.length > 0 ? v : null
  }, [searchParams])

  const lastResolvedForIdRef = useRef<string | null>(null)
  const [roomCtx, setRoomCtx] = useState<RoomContextResponse | null>(null)
  const [roomCtxError, setRoomCtxError] = useState<string | null>(null)

  useEffect(() => {
    setRoomCtx(null)
    setRoomCtxError(null)
    lastResolvedForIdRef.current = null
  }, [conversationId])

  useEffect(() => {
    if (!slug) return
    if (!starshipId) return
    if (roomsLoading) return

    // No specific conversation: go to the default room.
    if (!conversationId) {
      if (!defaultRoomSlug) return
      router.replace(`/ship/${encodeURIComponent(slug)}/rooms/${encodeURIComponent(defaultRoomSlug)}`)
      return
    }

    // Resolve room context once per conversationId.
    if (lastResolvedForIdRef.current === conversationId) return
    lastResolvedForIdRef.current = conversationId

    let cancelled = false
    ;(async () => {
      try {
        const res = await api.get(`/api/v1/conversations/${encodeURIComponent(conversationId)}/room-context`)
        const data = (res as any)?.data?.data ?? (res as any)?.data
        const parsed: RoomContextResponse | null =
          data && typeof data === 'object'
            ? {
                conversationId: String((data as any).conversationId || conversationId),
                roomConversationId: (data as any).roomConversationId ? String((data as any).roomConversationId) : null,
                isRoom: Boolean((data as any).isRoom),
                isRoomThread: Boolean((data as any).isRoomThread),
              }
            : null
        if (cancelled) return
        setRoomCtx(parsed)
      } catch (e: any) {
        if (cancelled) return
        setRoomCtxError(String(e?.message || e))
      }
    })()

    return () => {
      cancelled = true
    }
  }, [conversationId, defaultRoomSlug, roomsLoading, router, slug, starshipId])

  useEffect(() => {
    if (!slug) return
    if (!conversationId) return
    if (!roomCtx) return

    const roomConversationId = roomCtx.roomConversationId ? String(roomCtx.roomConversationId).trim() : ''
    if (!roomConversationId) {
      // Fallback: if a conversation isn't under a room, route to the default room.
      if (defaultRoomSlug) {
        router.replace(`/ship/${encodeURIComponent(slug)}/rooms/${encodeURIComponent(defaultRoomSlug)}`)
      }
      return
    }

    const match = rooms.find(r => String((r as any)?.conversationId || '').trim() === roomConversationId) ?? null
    const roomSlug = match?.slug ? String(match.slug).trim() : ''
    if (!roomSlug) {
      // If rooms list isn't ready or doesn't include the room, fall back to the rooms index.
      router.replace(`/ship/${encodeURIComponent(slug)}/rooms`)
      return
    }

    const base = `/ship/${encodeURIComponent(slug)}/rooms/${encodeURIComponent(roomSlug)}`
    if (roomCtx.isRoom) {
      router.replace(base)
      return
    }
    if (threadKey) {
      router.replace(`${base}/conversation/${encodeURIComponent(conversationId)}/thread/${encodeURIComponent(threadKey)}`)
      return
    }
    router.replace(`${base}/conversation/${encodeURIComponent(conversationId)}`)
  }, [conversationId, defaultRoomSlug, roomCtx, rooms, router, slug, threadKey])

  // Render nothing; this route is a redirector.
  // If resolution fails, still render nothing (user will remain on this route).
  void roomCtxError
  return null
}

