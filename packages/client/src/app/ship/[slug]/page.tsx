'use client'

import { use, useEffect, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useStarshipBySlug } from '@/hooks/useStarships'
import { useStarshipRooms } from '@/hooks/useRooms'

export default function StarshipOverviewPage({ params }: { params: Promise<{ slug: string }> }) {
  const router = useRouter()
  const { slug } = use(params)
  const { data: starship } = useStarshipBySlug(slug, Boolean(slug))
  const { data: roomsData, isLoading: roomsLoading } = useStarshipRooms(starship?.id ?? '', Boolean(starship?.id))

  const defaultRoomSlug = useMemo(() => {
    const rooms = roomsData?.rooms ?? []
    const lobby = rooms.find((r: any) => String(r?.slug || '').trim().toLowerCase() === 'lobby')
    const lobbySlug = lobby?.slug ? String(lobby.slug) : ''
    if (lobbySlug) return lobbySlug
    const first = rooms.length > 0 ? String((rooms[0] as any)?.slug || '') : ''
    return first || null
  }, [roomsData?.rooms])

  useEffect(() => {
    if (!slug) return
    if (!starship?.id) return
    if (roomsLoading) return

    if (!defaultRoomSlug) {
      router.replace('/explore')
      return
    }
    router.replace(`/ship/${slug}/rooms/${encodeURIComponent(defaultRoomSlug)}`)
  }, [roomsLoading, defaultRoomSlug, router, slug, starship?.id])

  return null
}
