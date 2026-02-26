'use client'

import { useEffect, useRef } from 'react'
import { fetchEventSource, type EventSourceMessage } from '@microsoft/fetch-event-source'
import { toast } from 'sonner'
import type { ViewPatchOp, WidgetInstanceNode } from '@starships/protocol'
import { getCurrentToken } from '@/lib/api'
import { useViewRuntimeStore } from '@/store/view-runtime-store'

function isRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v)
}

function isWidgetInstanceNode(v: unknown): v is WidgetInstanceNode {
  if (!isRecord(v)) return false
  if (typeof v.id !== 'string' || !v.id.trim()) return false
  if (typeof v.type !== 'string' || !v.type.trim()) return false
  if (!isRecord(v.props)) return false
  // children/bindings/handlers are optional; we don't validate deep here
  return true
}

function isViewPatchOp(v: unknown): v is ViewPatchOp {
  if (!isRecord(v)) return false
  const op = v.op
  const path = v.path
  if (
    op !== 'add' &&
    op !== 'remove' &&
    op !== 'replace' &&
    op !== 'move' &&
    op !== 'copy' &&
    op !== 'test'
  )
    return false
  if (typeof path !== 'string' || !path) return false
  if ((op === 'move' || op === 'copy') && typeof v.from !== 'string') return false
  if ((op === 'add' || op === 'replace' || op === 'test') && !('value' in v)) return false
  return true
}

export function useViewStream(viewId: string, enabled: boolean = true) {
  const initView = useViewRuntimeStore(s => s.initView)
  const replaceRoot = useViewRuntimeStore(s => s.replaceRoot)
  const applyRootPatch = useViewRuntimeStore(s => s.applyRootPatch)
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
              const root = isWidgetInstanceNode((data as Record<string, unknown>).root) ? ((data as Record<string, unknown>).root as WidgetInstanceNode) : null
              const state = isRecord((data as Record<string, unknown>).state) ? ((data as Record<string, unknown>).state as Record<string, unknown>) : {}
              replaceRoot(viewId, root)
              replaceState(viewId, state)
              return
            }

            if (eventType === 'patch') {
              const patchRaw = isRecord(data) && Array.isArray(data.patch) ? (data.patch as unknown[]) : []
              const patch: ViewPatchOp[] = patchRaw.filter(isViewPatchOp)
              if (patch.length) applyRootPatch(viewId, patch)
              return
            }

            if (eventType === 'state') {
              const patchRaw = isRecord(data) && Array.isArray(data.patch) ? (data.patch as unknown[]) : []
              for (const p of patchRaw) {
                if (!isRecord(p)) continue
                const path = typeof p.path === 'string' ? p.path : ''
                if (!path) continue
                setStateAtPath(viewId, path, p.value)
              }
              return
            }

            if (eventType === 'toast') {
              const message = isRecord(data) && typeof data.message === 'string' ? data.message : ''
              if (!message) return
              const level = isRecord(data) && typeof data.level === 'string' ? data.level : 'info'
              if (level === 'success') toast.success(message)
              else if (level === 'warning') toast.warning(message)
              else if (level === 'error') toast.error(message)
              else toast(message)
              return
            }

            if (eventType === 'error') {
              const message = isRecord(data) && typeof data.message === 'string' ? data.message : ''
              if (message) toast.error(message)
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
  }, [enabled, viewId, initView, replaceRoot, applyRootPatch, replaceState, setStateAtPath])
}

