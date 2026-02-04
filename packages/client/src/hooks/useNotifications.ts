import api, { getCurrentToken } from '@/lib/api'
import { playNotificationChime } from '@/lib/notificationSound'
import type { ApiResponse, NotificationModel } from '@starships/protocol'
import { experimental_streamedQuery as streamedQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchEventSource, type EventSourceMessage } from '@microsoft/fetch-event-source'
import { useEffect, useMemo, useRef } from 'react'

export const NOTIFICATION_QUERY_KEYS = {
  all: ['notifications'] as const,
  byStarship: (starshipId: string) => [...NOTIFICATION_QUERY_KEYS.all, 'starship', starshipId] as const,
  stream: (starshipId: string) => [...NOTIFICATION_QUERY_KEYS.byStarship(starshipId), 'stream'] as const,
} as const

type UnreadSummary = {
  totalUnread: number
  dmUnreadByConversationId: Record<string, number>
  mentionUnreadByConversationId: Record<string, number>
}

export type NotificationsSnapshot = {
  starshipId: string
  userId: string
  notifications: NotificationModel[]
  unread: UnreadSummary
}

type StreamChunk =
  | { type: 'snapshot'; data: NotificationsSnapshot }
  | { type: 'notification.append'; data: { notification: NotificationModel } }
  | { type: 'notification.state'; data: { unread: UnreadSummary } }
  | { type: 'error'; error: unknown }

const playedNotificationIdsByStarship = new Map<string, Set<string>>()
const MAX_TRACKED_STARSHIPS = 10
const MAX_TRACKED_IDS_PER_STARSHIP = 500
function shouldPlayForNotification(n: NotificationModel): boolean {
  const typ = String((n as any)?.type || '')
  // Current UI treats only these as unread-notification types.
  return typ === 'dm' || typ === 'mention'
}

export function useNotificationsStream(
  starshipId: string | null,
  enabled: boolean = true,
  opts?: {
    /**
     * When provided, notification sounds will be suppressed ONLY when:
     * - the app/tab is foreground AND
     * - the incoming notification is for this active conversation.
     *
     * (In background, sound still plays.)
     */
    activeConversationId?: string | null
  }
) {
  const queryClient = useQueryClient()
  const activeGuardRef = useRef<AbortController | null>(null)
  const activeConversationId = useMemo(() => String(opts?.activeConversationId || '').trim() || null, [opts?.activeConversationId])

  function makeSSEAsyncIterable(sid: string, token: string | null, signal?: AbortSignal): AsyncIterable<StreamChunk> {
    const cursorKey = `notif:${sid}:cursor`
    const cursor = typeof window !== 'undefined' ? window.localStorage.getItem(cursorKey) : null
    const url = `/api/v1/starships/${sid}/notifications?stream=true${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`

    let closed = false
    const controller = new AbortController()
    const instance = new AbortController()
    try {
      activeGuardRef.current?.abort()
    } catch {}
    activeGuardRef.current = instance

    const combinedSignal = signal ? AbortSignal.any([signal, controller.signal, instance.signal]) : AbortSignal.any([controller.signal, instance.signal])
    const isActive = () => activeGuardRef.current === instance

    type Resolver = (value: IteratorResult<StreamChunk>) => void
    const queue: StreamChunk[] = []
    const resolvers: Resolver[] = []

    const push = (item: StreamChunk) => {
      if (closed) return
      if (resolvers.length > 0) {
        const resolve = resolvers.shift()!
        resolve({ value: item, done: false })
      } else {
        queue.push(item)
      }
    }

    const cleanup = () => {
      if (closed) return
      closed = true
      controller.abort()
      instance.abort()
      while (resolvers.length > 0) {
        const resolve = resolvers.shift()!
        resolve({ value: undefined, done: true })
      }
      queue.length = 0
    }

    fetchEventSource(url, {
      method: 'GET',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      openWhenHidden: true,
      signal: combinedSignal,
      async onopen(response) {
        if (!isActive()) return
        if (!response.ok) {
          push({ type: 'error', error: { status: response.status, statusText: response.statusText } })
          cleanup()
        }
      },
      onmessage(ev: EventSourceMessage) {
        if (!isActive()) return
        try {
          if (typeof ev.id === 'string' && ev.id) {
            try {
              if (typeof window !== 'undefined') window.localStorage.setItem(cursorKey, ev.id)
            } catch {}
          }
          const eventType = String(ev.event || '')
          const data = ev.data ? JSON.parse(ev.data) : null
          if (!eventType || data == null) return
          if (eventType === 'snapshot') {
            push({ type: 'snapshot', data })
            return
          }
          if (eventType === 'notification.append') {
            push({ type: 'notification.append', data })
            return
          }
          if (eventType === 'notification.state') {
            push({ type: 'notification.state', data })
            return
          }
        } catch (e) {
          push({ type: 'error', error: e })
        }
      },
      onclose() {
        if (!isActive()) return
        cleanup()
      },
      onerror(err) {
        if (!isActive()) return
        push({ type: 'error', error: err })
        cleanup()
      },
    })

    return {
      [Symbol.asyncIterator]() {
        return {
          next: () => {
            if (queue.length > 0) return Promise.resolve({ value: queue.shift()!, done: false })
            if (closed) return Promise.resolve({ value: undefined, done: true })
            return new Promise<IteratorResult<StreamChunk>>(resolve => resolvers.push(resolve))
          },
          return: () => {
            cleanup()
            return Promise.resolve({ value: undefined, done: true })
          },
        }
      },
    }
  }

  const q = useQuery<StreamChunk[]>({
    queryKey: starshipId ? NOTIFICATION_QUERY_KEYS.stream(starshipId) : (['__noop__'] as const),
    queryFn: streamedQuery({
      queryFn: async ctx => {
        const token = await getCurrentToken()
        return makeSSEAsyncIterable(starshipId!, token, ctx?.signal)
      },
      refetchMode: 'append',
    }),
    enabled: Boolean(starshipId && enabled),
    refetchOnWindowFocus: false,
    staleTime: 0,
    gcTime: 2 * 60 * 1000,
  })

  const chunks = q.data ?? []
  const snapshot = useMemo(() => {
    for (let i = chunks.length - 1; i >= 0; i--) {
      const c = chunks[i] as any
      if (c?.type === 'snapshot') return c.data as NotificationsSnapshot
    }
    return null
  }, [chunks.length, starshipId])

  const unread = useMemo<UnreadSummary>(() => {
    // Start with snapshot unread, then apply state updates + append increments.
    let base: UnreadSummary = snapshot?.unread ?? { totalUnread: 0, dmUnreadByConversationId: {}, mentionUnreadByConversationId: {} }
    // Copy so we can mutate safely
    let cur: UnreadSummary = {
      totalUnread: Number(base.totalUnread ?? 0) || 0,
      dmUnreadByConversationId: { ...(base.dmUnreadByConversationId ?? {}) },
      mentionUnreadByConversationId: { ...(base.mentionUnreadByConversationId ?? {}) },
    }
    for (const ch of chunks) {
      const c: any = ch as any
      if (c?.type === 'notification.state' && c?.data?.unread) {
        const u = c.data.unread as UnreadSummary
        cur = {
          totalUnread: Number(u.totalUnread ?? 0) || 0,
          dmUnreadByConversationId: { ...(u.dmUnreadByConversationId ?? {}) },
          mentionUnreadByConversationId: { ...(u.mentionUnreadByConversationId ?? {}) },
        }
      }
      if (c?.type === 'notification.append' && c?.data?.notification) {
        const n = c.data.notification as NotificationModel
        const cid = String((n as any).conversationId || '')
        const typ = String((n as any).type || '')
        if (cid && (typ === 'dm' || typ === 'mention')) {
          cur.totalUnread += 1
          if (typ === 'dm') cur.dmUnreadByConversationId[cid] = (cur.dmUnreadByConversationId[cid] || 0) + 1
          if (typ === 'mention') cur.mentionUnreadByConversationId[cid] = (cur.mentionUnreadByConversationId[cid] || 0) + 1
        }
      }
    }
    return cur
  }, [chunks.length, snapshot])

  const notifications = useMemo(() => {
    const list: NotificationModel[] = snapshot?.notifications ? [...snapshot.notifications] : []
    for (const ch of chunks) {
      const c: any = ch as any
      if (c?.type === 'notification.append' && c?.data?.notification) {
        const n = c.data.notification as NotificationModel
        // Dedup by id
        if (!list.some(x => x.id === n.id)) list.unshift(n)
      }
      if (c?.type === 'snapshot' && c?.data?.notifications) {
        // Snapshot is authoritative
        list.splice(0, list.length, ...c.data.notifications)
      }
    }
    return list
  }, [chunks.length, snapshot])

  const markSeen = useMutation({
    mutationFn: async (args?: { before?: string | null }) => {
      const sid = String(starshipId || '')
      const resp = await api.post(`/api/v1/starships/${sid}/notifications/mark-seen`, { before: args?.before ?? null })
      return (resp as any).data?.data as { updated: number; unread: UnreadSummary }
    },
    onSuccess: data => {
      // Best-effort: update cached state immediately
      const sid = String(starshipId || '')
      if (!sid || !data?.unread) return
      queryClient.setQueryData(NOTIFICATION_QUERY_KEYS.stream(sid), (old: any) => {
        const arr = Array.isArray(old) ? old.slice() : []
        arr.push({ type: 'notification.state', data: { unread: data.unread } })
        return arr
      })
    },
  })

  const markRead = useMutation({
    mutationFn: async (args?: { conversationId?: string | null }) => {
      const sid = String(starshipId || '')
      const resp = await api.post(`/api/v1/starships/${sid}/notifications/mark-read`, { conversationId: args?.conversationId ?? null })
      return (resp as any).data?.data as { updated: number; unread: UnreadSummary }
    },
    onSuccess: data => {
      const sid = String(starshipId || '')
      if (!sid || !data?.unread) return
      queryClient.setQueryData(NOTIFICATION_QUERY_KEYS.stream(sid), (old: any) => {
        const arr = Array.isArray(old) ? old.slice() : []
        arr.push({ type: 'notification.state', data: { unread: data.unread } })
        return arr
      })
    },
  })

  // Play a short notification sound for newly appended notifications.
  // Important: this hook can be mounted in multiple places; dedupe globally by notification id.
  const lastProcessedIdxRef = useRef(0)
  const initRef = useRef(false)
  useEffect(() => {
    // Reset when switching starships or disabling.
    initRef.current = false
    lastProcessedIdxRef.current = 0
  }, [starshipId, enabled])

  // Auto-mark notifications read for the active conversation while in foreground.
  //
  // Why:
  // We intentionally suppress DM badges while the user is already viewing that DM.
  // However, notification rows can be created slightly after the message arrives (race),
  // so if we only mark-read based on message stream timing, unread can accumulate invisibly
  // and then "reappear" as a badge when the user navigates away.
  const autoMarkIdxRef = useRef(0)
  const autoMarkInitRef = useRef(false)
  const lastAutoMarkAtRef = useRef<number>(0)
  useEffect(() => {
    autoMarkInitRef.current = false
    autoMarkIdxRef.current = 0
    lastAutoMarkAtRef.current = 0
  }, [starshipId, enabled])

  useEffect(() => {
    if (!starshipId || !enabled) return
    if (!activeConversationId) return

    const isForeground = (): boolean => {
      try {
        if (typeof document === 'undefined') return true
        if (document.visibilityState && document.visibilityState !== 'visible') return false
        if (typeof document.hasFocus === 'function' && !document.hasFocus()) return false
        return true
      } catch {
        return true
      }
    }

    // On first mount, don't act on historical chunks.
    if (!autoMarkInitRef.current) {
      autoMarkInitRef.current = true
      autoMarkIdxRef.current = chunks.length
      return
    }

    const start = Math.max(0, autoMarkIdxRef.current)
    if (chunks.length <= start) {
      autoMarkIdxRef.current = chunks.length
      return
    }

    const foreground = isForeground()
    if (!foreground) {
      // In background, we *do not* auto-mark read; user hasn't actually viewed the new message.
      autoMarkIdxRef.current = chunks.length
      return
    }

    for (let i = start; i < chunks.length; i++) {
      const c: any = chunks[i] as any
      if (c?.type !== 'notification.append' || !c?.data?.notification) continue
      const n = c.data.notification as NotificationModel
      if (!shouldPlayForNotification(n)) continue

      const notifConversationId = String((n as any)?.conversationId || '').trim()
      if (!notifConversationId) continue
      if (notifConversationId !== activeConversationId) {
        continue
      }

      // Throttle: many notifications can arrive in a burst; one mark-read clears the conversation.
      const now = Date.now()
      if (now - lastAutoMarkAtRef.current < 750) continue
      lastAutoMarkAtRef.current = now
      void markRead.mutateAsync({ conversationId: notifConversationId }).catch(() => undefined)
      // After scheduling mark-read, we can stop scanning this batch.
      break
    }

    autoMarkIdxRef.current = chunks.length
  }, [activeConversationId, chunks.length, enabled, starshipId, markRead])

  useEffect(() => {
    if (!starshipId || !enabled) return

    const isForeground = (): boolean => {
      try {
        if (typeof document === 'undefined') return true
        if (document.visibilityState && document.visibilityState !== 'visible') return false
        if (typeof document.hasFocus === 'function' && !document.hasFocus()) return false
        return true
      } catch {
        return true
      }
    }

    // On first mount, don't replay historical chunks; just start tracking from "now".
    if (!initRef.current) {
      initRef.current = true
      lastProcessedIdxRef.current = chunks.length
      return
    }

    const start = Math.max(0, lastProcessedIdxRef.current)
    if (chunks.length <= start) {
      lastProcessedIdxRef.current = chunks.length
      return
    }

    for (let i = start; i < chunks.length; i++) {
      const c: any = chunks[i] as any
      if (c?.type !== 'notification.append' || !c?.data?.notification) continue
      const n = c.data.notification as NotificationModel
      if (!shouldPlayForNotification(n)) continue

      // Sound UX:
      // - Always play if the tab/app is in the background.
      // - Only suppress when the app is foreground AND the user is already viewing the conversation
      //   that the notification is for (handled by passing an activeConversationId from call sites).
      const foreground = isForeground()
      const notifConversationId = String((n as any)?.conversationId || '').trim()
      if (foreground && notifConversationId && activeConversationId && notifConversationId === activeConversationId) {
        continue
      }

      const sid = String(starshipId)
      const id = String((n as any)?.id ?? '')
      if (!id) continue

      let set = playedNotificationIdsByStarship.get(sid)
      if (!set) {
        set = new Set<string>()
        playedNotificationIdsByStarship.set(sid, set)
      }
      // Refresh insertion order (so least-recently-used starships can be dropped).
      playedNotificationIdsByStarship.delete(sid)
      playedNotificationIdsByStarship.set(sid, set)

      // Cap total number of starships tracked in a long-lived session.
      while (playedNotificationIdsByStarship.size > MAX_TRACKED_STARSHIPS) {
        const oldestKey = playedNotificationIdsByStarship.keys().next().value as string | undefined
        if (!oldestKey) break
        playedNotificationIdsByStarship.delete(oldestKey)
      }

      if (set.has(id)) continue
      set.add(id)

      // Prevent unbounded growth if the tab is open for a long time.
      if (set.size > MAX_TRACKED_IDS_PER_STARSHIP) {
        const keep = new Set(Array.from(set).slice(-Math.floor(MAX_TRACKED_IDS_PER_STARSHIP / 2)))
        playedNotificationIdsByStarship.set(sid, keep)
      }

      playNotificationChime()
    }

    lastProcessedIdxRef.current = chunks.length
  }, [activeConversationId, chunks.length, enabled, starshipId])

  return {
    notifications,
    unread,
    isLoading: q.isLoading,
    isFetching: q.fetchStatus === 'fetching',
    isError: q.isError,
    error: q.error,
    markSeen: (args?: { before?: string | null }) => markSeen.mutateAsync(args),
    markRead: (args?: { conversationId?: string | null }) => markRead.mutateAsync(args),
  }
}

export function useNotificationsList(starshipId: string | null, enabled: boolean = true) {
  return useQuery({
    queryKey: starshipId ? NOTIFICATION_QUERY_KEYS.byStarship(starshipId) : (['__noop__'] as const),
    enabled: Boolean(starshipId && enabled),
    queryFn: async (): Promise<{ notifications: NotificationModel[]; unread: UnreadSummary }> => {
      const sid = String(starshipId || '')
      const resp = await api.get(`/api/v1/starships/${sid}/notifications`, { params: { limit: 50 } })
      const data = (resp as any).data?.data as any
      return {
        notifications: (data?.notifications as NotificationModel[]) ?? [],
        unread: (data?.unread as UnreadSummary) ?? { totalUnread: 0, dmUnreadByConversationId: {}, mentionUnreadByConversationId: {} },
      }
    },
  })
}

export function useUnreadByConversationIds(starshipId: string | null, conversationIds: string[], enabled: boolean = true) {
  const ids = Array.isArray(conversationIds) ? conversationIds.filter(Boolean).map(String) : []
  const stableIds = useMemo(() => Array.from(new Set(ids)).sort(), [ids.join('|')])
  return useQuery({
    queryKey: starshipId ? [...NOTIFICATION_QUERY_KEYS.byStarship(starshipId), 'unread', stableIds.join('|')] : (['__noop__'] as const),
    enabled: Boolean(starshipId && enabled && stableIds.length > 0),
    queryFn: async (): Promise<{ unreadByConversationId: Record<string, { hasUnread: boolean; lastMessageAt: string | null; lastReadAt: string | null }> }> => {
      const sid = String(starshipId || '')
      const resp = await api.post(`/api/v1/starships/${sid}/unread`, { conversationIds: stableIds })
      const data = (resp as any).data?.data as any
      return { unreadByConversationId: (data?.unreadByConversationId as any) ?? {} }
    },
    staleTime: 10_000,
    gcTime: 60_000,
    refetchOnWindowFocus: true,
  })
}

export function useMarkConversationRead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (conversationId: string): Promise<{ readState: any; unread: any }> => {
      const cid = String(conversationId || '')
      const resp = await api.post(`/api/v1/conversations/${cid}/read`)
      return (resp as any).data?.data as any
    },
    onSuccess: data => {
      // Best-effort: invalidate unread queries + update notification stream cache with new unread state
      queryClient.invalidateQueries({ queryKey: NOTIFICATION_QUERY_KEYS.all })
      try {
        const sid = String((data as any)?.unread?.starshipId || '')
        void sid
      } catch {}
    },
  })
}
