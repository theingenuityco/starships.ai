'use client'

import api from '@/lib/api'
import type { ApiResponse } from '@starships/protocol'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useRef } from 'react'

export type StarshipPresenceResponse = {
  serverTimeMs: number
  onlineUserIds: string[]
  onlineWindowMs?: number
}

export const STARSHIP_PRESENCE_QUERY_KEYS = {
  all: ['starships', 'presence'] as const,
  byStarship: (starshipId: string) => [...STARSHIP_PRESENCE_QUERY_KEYS.all, starshipId] as const,
} as const

const HEARTBEAT_INTERVAL_MS = 20_000
const PRESENCE_REFETCH_INTERVAL_MS = 10_000

async function postHeartbeat(starshipId: string): Promise<void> {
  if (!starshipId) return
  // Ignore failures silently; presence is best-effort UX.
  try {
    await api.post(`/api/v1/starships/${encodeURIComponent(starshipId)}/presence/heartbeat`)
  } catch {
    // best-effort only
  }
}

export function useStarshipPresence(starshipId: string, enabled: boolean = true) {
  const enabledSafe = Boolean(enabled && starshipId)
  const heartbeatTimerRef = useRef<number | null>(null)

  const query = useQuery({
    queryKey: STARSHIP_PRESENCE_QUERY_KEYS.byStarship(starshipId),
    enabled: enabledSafe,
    queryFn: async (): Promise<StarshipPresenceResponse> => {
      const res = await api.get<ApiResponse<StarshipPresenceResponse>>(`/api/v1/starships/${encodeURIComponent(starshipId)}/presence`)
      return (res as any).data?.data as StarshipPresenceResponse
    },
    refetchInterval: enabledSafe ? PRESENCE_REFETCH_INTERVAL_MS : false,
    retry: false,
  })

  const onlineUserIdSet = useMemo(() => new Set((query.data?.onlineUserIds || []).filter(Boolean)), [query.data?.onlineUserIds])

  useEffect(() => {
    if (!enabledSafe) return

    const clear = () => {
      if (heartbeatTimerRef.current != null) {
        window.clearInterval(heartbeatTimerRef.current)
        heartbeatTimerRef.current = null
      }
    }

    const tick = () => {
      // Avoid heartbeating aggressively while the tab is hidden.
      if (typeof document !== 'undefined' && document.hidden) return
      void postHeartbeat(starshipId)
    }

    // Kick immediately so presence appears fast after navigation.
    tick()

    heartbeatTimerRef.current = window.setInterval(tick, HEARTBEAT_INTERVAL_MS)

    const onVisibility = () => {
      if (!document.hidden) tick()
    }
    const onFocus = () => tick()

    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibility)
      clear()
    }
  }, [enabledSafe, starshipId])

  return {
    ...query,
    onlineUserIdSet,
    isUserOnline: (userId: string | null | undefined) => (userId ? onlineUserIdSet.has(String(userId)) : false),
  }
}

