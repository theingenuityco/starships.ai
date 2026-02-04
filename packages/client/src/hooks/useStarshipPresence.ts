'use client'

import api from '@/lib/api'
import type { ApiResponse } from '@starships/protocol'
import { useQuery, useQueryClient } from '@tanstack/react-query'
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

// Keep these aligned so we're not refetching faster than we're updating activity.
//
// Note: Presence is a "best effort" UX feature. The critical thing is to avoid
// multiple components mounting the hook causing N intervals + N heartbeats.
const HEARTBEAT_INTERVAL_MS = 20_000
const PRESENCE_REFETCH_INTERVAL_MS = HEARTBEAT_INTERVAL_MS
const MIN_HEARTBEAT_SPACING_MS = 5_000

async function postHeartbeat(starshipId: string): Promise<void> {
  if (!starshipId) return
  // Ignore failures silently; presence is best-effort UX.
  try {
    await api.post(`/api/v1/starships/${encodeURIComponent(starshipId)}/presence/heartbeat`)
  } catch {
    // best-effort only
  }
}

type PresenceController = {
  refCount: number
  timerId: number | null
  lastHeartbeatAtMs: number
  heartbeatInFlight: Promise<void> | null
  queryClient: ReturnType<typeof useQueryClient> | null
  onFocus: (() => void) | null
  onVisibility: (() => void) | null
}

const presenceControllers = new Map<string, PresenceController>()

function getOrCreateController(starshipId: string): PresenceController {
  const existing = presenceControllers.get(starshipId)
  if (existing) return existing
  const created: PresenceController = {
    refCount: 0,
    timerId: null,
    lastHeartbeatAtMs: 0,
    heartbeatInFlight: null,
    queryClient: null,
    onFocus: null,
    onVisibility: null,
  }
  presenceControllers.set(starshipId, created)
  return created
}

function isTabHidden(): boolean {
  return typeof document !== 'undefined' && Boolean(document.hidden)
}

export function useStarshipPresence(starshipId: string, enabled: boolean = true) {
  const enabledSafe = Boolean(enabled && starshipId)
  const queryClient = useQueryClient()
  const registeredStarshipIdRef = useRef<string | null>(null)

  const query = useQuery({
    queryKey: STARSHIP_PRESENCE_QUERY_KEYS.byStarship(starshipId),
    enabled: enabledSafe,
    queryFn: async (): Promise<StarshipPresenceResponse> => {
      const res = await api.get<ApiResponse<StarshipPresenceResponse>>(`/api/v1/starships/${encodeURIComponent(starshipId)}/presence`)
      const payload = res.data?.data

      if (!payload || typeof payload.serverTimeMs !== 'number' || !Array.isArray(payload.onlineUserIds)) {
        throw new Error('Invalid presence response payload')
      }

      return {
        ...payload,
        onlineUserIds: payload.onlineUserIds.filter((x): x is string => typeof x === 'string' && x.length > 0),
      }
    },
    // IMPORTANT: polling is centralized below (shared per starship).
    // Keeping per-hook refetch intervals would cause multiple concurrent polls.
    refetchInterval: false,
    retry: false,
  })

  const onlineUserIdSet = useMemo(() => new Set((query.data?.onlineUserIds || []).filter(Boolean)), [query.data?.onlineUserIds])

  useEffect(() => {
    const prev = registeredStarshipIdRef.current
    if (prev && prev !== starshipId) {
      // If the starship changed between renders, unregister the old one.
      const ctrlPrev = presenceControllers.get(prev)
      if (ctrlPrev) {
        ctrlPrev.refCount = Math.max(0, ctrlPrev.refCount - 1)
        if (ctrlPrev.refCount === 0) {
          if (ctrlPrev.timerId != null) window.clearInterval(ctrlPrev.timerId)
          if (ctrlPrev.onFocus) window.removeEventListener('focus', ctrlPrev.onFocus)
          if (ctrlPrev.onVisibility) document.removeEventListener('visibilitychange', ctrlPrev.onVisibility)
          presenceControllers.delete(prev)
        }
      }
      registeredStarshipIdRef.current = null
    }

    if (!enabledSafe) return

    const ctrl = getOrCreateController(starshipId)
    ctrl.refCount += 1
    ctrl.queryClient = queryClient
    registeredStarshipIdRef.current = starshipId

    const tick = (force: boolean = false) => {
      if (isTabHidden()) return

      const now = Date.now()
      if (!force && now - ctrl.lastHeartbeatAtMs < MIN_HEARTBEAT_SPACING_MS) return

      // De-dupe concurrent heartbeats across multiple mounts.
      if (!ctrl.heartbeatInFlight) {
        ctrl.lastHeartbeatAtMs = now
        ctrl.heartbeatInFlight = postHeartbeat(starshipId).finally(() => {
          ctrl.heartbeatInFlight = null
        })
      }

      // Keep the presence list fresh on the same cadence.
      // Refetching the shared query key is deduped by TanStack Query.
      void ctrl.queryClient?.refetchQueries({
        queryKey: STARSHIP_PRESENCE_QUERY_KEYS.byStarship(starshipId),
        exact: true,
        type: 'active',
      })
    }

    // Start timers/listeners only once per starship (first subscriber).
    if (ctrl.refCount === 1) {
      // Kick immediately so presence appears fast after navigation.
      tick(true)

      ctrl.timerId = window.setInterval(() => tick(false), PRESENCE_REFETCH_INTERVAL_MS)

      ctrl.onVisibility = () => {
        if (!isTabHidden()) tick(true)
      }
      ctrl.onFocus = () => tick(true)

      window.addEventListener('focus', ctrl.onFocus)
      document.addEventListener('visibilitychange', ctrl.onVisibility)
    } else {
      // Additional subscribers should not cause bursts; do a soft tick.
      tick(false)
    }

    return () => {
      const ctrlExisting = presenceControllers.get(starshipId)
      if (!ctrlExisting) return

      ctrlExisting.refCount = Math.max(0, ctrlExisting.refCount - 1)
      if (ctrlExisting.refCount === 0) {
        if (ctrlExisting.timerId != null) window.clearInterval(ctrlExisting.timerId)
        if (ctrlExisting.onFocus) window.removeEventListener('focus', ctrlExisting.onFocus)
        if (ctrlExisting.onVisibility) document.removeEventListener('visibilitychange', ctrlExisting.onVisibility)
        presenceControllers.delete(starshipId)
      }
      if (registeredStarshipIdRef.current === starshipId) {
        registeredStarshipIdRef.current = null
      }
    }
  }, [enabledSafe, starshipId])

  return {
    ...query,
    onlineUserIdSet,
    isUserOnline: (userId: string | null | undefined) => (userId ? onlineUserIdSet.has(String(userId)) : false),
  }
}

