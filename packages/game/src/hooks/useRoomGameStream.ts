import { fetchEventSource, type EventSourceMessage } from '@microsoft/fetch-event-source'
import { useEffect, useRef, useState } from 'react'
import type { RoomGameActorsJoinLeave, RoomGameActorsPatch, RoomGameSnapshot } from '../types'

function isRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v)
}

function safeJsonParse(input: string): unknown {
  try {
    return JSON.parse(input)
  } catch {
    return null
  }
}

export type RoomGameStreamState =
  | { status: 'idle' }
  | { status: 'connecting' }
  | { status: 'connected'; lastEventId?: string | null }
  | { status: 'error'; message: string }

export function useRoomGameStream(args: {
  roomConversationId: string
  enabled?: boolean
  /** Provide auth token for SSE; typically `getCurrentToken` from client. */
  getAuthToken?: () => Promise<string | null | undefined>
  /** Last cursor, persisted by caller if desired (localStorage). */
  initialCursor?: string | null
  onSnapshot: (snapshot: RoomGameSnapshot) => void
  onActorsPatch: (patch: RoomGameActorsPatch) => void
  onActorJoin: (evt: RoomGameActorsJoinLeave) => void
  onActorLeave: (evt: RoomGameActorsJoinLeave) => void
}) {
  const enabled = args.enabled ?? true
  const [streamState, setStreamState] = useState<RoomGameStreamState>({ status: 'idle' })
  const lastEventIdRef = useRef<string | null>(args.initialCursor ?? null)

  useEffect(() => {
    if (!enabled) return
    const roomConversationId = String(args.roomConversationId || '').trim()
    if (!roomConversationId) return

    let closed = false
    const controller = new AbortController()
    setStreamState({ status: 'connecting' })

    ;(async () => {
      const token = args.getAuthToken ? await args.getAuthToken().catch(() => null) : null
      const cursor = lastEventIdRef.current ? `&cursor=${encodeURIComponent(lastEventIdRef.current)}` : ''
      const url = `/api/v1/rooms/${encodeURIComponent(roomConversationId)}/game/stream?stream=true${cursor}`

      fetchEventSource(url, {
        method: 'GET',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        openWhenHidden: true,
        signal: controller.signal,
        async onopen(response) {
          if (!response.ok) {
            setStreamState({ status: 'error', message: `Stream failed (${response.status})` })
            controller.abort()
            return
          }
          setStreamState({ status: 'connected', lastEventId: lastEventIdRef.current })
        },
        onmessage(ev: EventSourceMessage) {
          if (closed) return
          if (typeof ev.id === 'string' && ev.id) {
            lastEventIdRef.current = ev.id
            setStreamState({ status: 'connected', lastEventId: ev.id })
          }
          const eventType = String(ev.event || '')
          if (!eventType) return
          const raw = typeof ev.data === 'string' ? ev.data : ''
          const parsed = raw ? safeJsonParse(raw) : null
          if (!isRecord(parsed)) return

          if (eventType === 'snapshot') {
            args.onSnapshot(parsed as unknown as RoomGameSnapshot)
            return
          }
          if (eventType === 'actors.patch') {
            args.onActorsPatch(parsed as unknown as RoomGameActorsPatch)
            return
          }
          if (eventType === 'actors.join') {
            args.onActorJoin(parsed as unknown as RoomGameActorsJoinLeave)
            return
          }
          if (eventType === 'actors.leave') {
            args.onActorLeave(parsed as unknown as RoomGameActorsJoinLeave)
            return
          }
        },
        onclose() {
          closed = true
        },
        onerror(err) {
          if (controller.signal.aborted) return
          setStreamState({ status: 'error', message: err instanceof Error ? err.message : 'room game stream error' })
          throw err
        },
      })
    })()

    return () => {
      closed = true
      controller.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, args.roomConversationId])

  return { streamState, lastEventId: lastEventIdRef.current }
}

