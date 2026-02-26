'use client'

import { useEffect, useRef } from 'react'
import { fetchEventSource, type EventSourceMessage } from '@microsoft/fetch-event-source'
import { getCurrentToken } from '@/lib/api'
import { useViewRuntimeStore } from '@/store/view-runtime-store'

function isRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v)
}

export function useViewStream(viewId: string, enabled: boolean = true) {
  const initView = useViewRuntimeStore(s => s.initView)
  const replaceState = useViewRuntimeStore(s => s.replaceState)
  const setStateAtPath = useViewRuntimeStore(s => s.setStateAtPath)
  const lastCursorRef = useRef<string | null>(null)

  useEffect(() => {
    if (!enabled || !viewId) return
    let closed = false
    const controller = new AbortController()

    initView(viewId, { state: {}, queries: {} })

    const cursorKey = `view-stream-cursor:${viewId}`
    try {
      if (typeof window !== 'undefined') lastCursorRef.current = window.localStorage.getItem(cursorKey)
    } catch {}

    ;(async () => {
      const token = await getCurrentToken()
      const url = `/api/v1/views/${encodeURIComponent(viewId)}/stream?stream=true${lastCursorRef.current ? `&cursor=${encodeURIComponent(lastCursorRef.current)}` : ''}`

      fetchEventSource(url, {
        method: 'GET',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        openWhenHidden: true,
        signal: controller.signal,
        async onopen(response) {
          if (!response.ok) {
            controller.abort()
          }
        },
        onmessage(ev: EventSourceMessage) {
          if (closed) return
          try {
            if (typeof ev.id === 'string' && ev.id) {
              lastCursorRef.current = ev.id
              try {
                if (typeof window !== 'undefined') window.localStorage.setItem(cursorKey, ev.id)
              } catch {}
            }

            const eventType = String(ev.event || '')
            const data = ev.data ? JSON.parse(ev.data) : null
            if (!eventType || data == null) return

            if (eventType === 'snapshot') {
              const state = isRecord(data.state) ? (data.state as Record<string, unknown>) : {}
              replaceState(viewId, state)
              return
            }

            if (eventType === 'state') {
              const patch = Array.isArray((data as any).patch) ? (data as any).patch : []
              for (const p of patch) {
                if (!isRecord(p)) continue
                const path = typeof p.path === 'string' ? p.path : ''
                if (!path) continue
                setStateAtPath(viewId, path, p.value)
              }
              return
            }
          } catch {
            /* ignore parse errors */
          }
        },
        onclose() {
          closed = true
        },
        onerror() {
          // Let fetch-event-source retry by throwing; but if we were aborted, stop.
          if (controller.signal.aborted) return
          throw new Error('view stream error')
        },
      })
    })()

    return () => {
      closed = true
      controller.abort()
    }
  }, [enabled, viewId, initView, replaceState, setStateAtPath])
}

