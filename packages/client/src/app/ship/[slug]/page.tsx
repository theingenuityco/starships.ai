'use client'

import { use, useEffect, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useStarshipBySlug } from '@/hooks/useStarships'
import { useStarshipRooms } from '@/hooks/useRooms'

export default function StarshipOverviewPage({ params }: { params: Promise<{ slug: string }> }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { slug } = use(params)
  const { data: starship } = useStarshipBySlug(slug, Boolean(slug))
  const { data: roomsData, isLoading: roomsLoading } = useStarshipRooms(starship?.id ?? '', Boolean(starship?.id))

  const isLeadGenEntry = useMemo(() => {
    if (!starship?.id) return false
    if (typeof window === 'undefined') return false
    try {
      const lastStarshipId = window.sessionStorage.getItem('lead_gen_last_starship_id')
      return Boolean(lastStarshipId && lastStarshipId === String(starship.id))
    } catch {
      return false
    }
  }, [starship?.id])

  const defaultRoomSlug = useMemo(() => {
    const rooms = roomsData?.rooms ?? []
    if (isLeadGenEntry) {
      const leadgenRoom =
        (rooms as any[]).find(r => (r as any)?.provisionedByBundle === 'lead-generation') ??
        (rooms as any[]).find(r => String((r as any)?.slug || '').trim().toLowerCase() === 'leadgen')
      const leadgenSlug = leadgenRoom?.slug ? String(leadgenRoom.slug) : ''
      if (leadgenSlug) return leadgenSlug
    }
    const lobby = rooms.find((r: any) => String(r?.slug || '').trim().toLowerCase() === 'lobby')
    const lobbySlug = lobby?.slug ? String(lobby.slug) : ''
    if (lobbySlug) return lobbySlug
    const first = rooms.length > 0 ? String((rooms[0] as any)?.slug || '') : ''
    return first || null
  }, [roomsData?.rooms, isLeadGenEntry])

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
