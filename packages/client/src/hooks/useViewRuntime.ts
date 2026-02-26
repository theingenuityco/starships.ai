'use client'

import { useEffect } from 'react'
import type { ViewModel } from '@starships/protocol'
import api from '@/lib/api'
import { useViewRuntimeStore } from '@/store/view-runtime-store'

function isRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v)
}

export function useViewRuntime(view: ViewModel | undefined) {
  const viewId = view?.id ? String(view.id) : ''
  const initView = useViewRuntimeStore(s => s.initView)
  const runtimeSlice = useViewRuntimeStore(s => (viewId ? s.views[viewId] : undefined))
  const setQueryState = useViewRuntimeStore(s => s.setQueryState)

  // Ensure slice exists
  useEffect(() => {
    if (!viewId) return
    initView(viewId, { state: {}, queries: {} })
  }, [viewId, initView])

  // v1 query runner (best-effort): executes http + same-origin api routes.
  useEffect(() => {
    if (!viewId || !view?.runtimeConfig || !isRecord(view.runtimeConfig) || !isRecord((view.runtimeConfig as any).queries)) return
    const queries = (view.runtimeConfig as any).queries as Record<string, unknown>
    let cancelled = false

    async function runOne(queryId: string, specUnknown: unknown) {
      if (!queryId || !isRecord(specUnknown)) return
      const kind = typeof specUnknown.kind === 'string' ? specUnknown.kind : ''
      if (kind !== 'http') return
      const url = typeof specUnknown.url === 'string' ? specUnknown.url : ''
      const method = typeof specUnknown.method === 'string' ? String(specUnknown.method).toUpperCase() : 'GET'
      if (!url || !url.startsWith('/')) return

      setQueryState(viewId, queryId, { status: 'loading', error: undefined })
      try {
        const resp = method === 'POST' ? await api.post(url, specUnknown.bodyTemplate ?? {}) : await api.get(url)
        const data = (resp as any)?.data?.data ?? (resp as any)?.data ?? resp
        if (cancelled) return
        setQueryState(viewId, queryId, { status: 'success', data })
      } catch (e) {
        if (cancelled) return
        setQueryState(viewId, queryId, { status: 'error', error: e instanceof Error ? e.message : String(e) })
      }
    }

    for (const [queryId, spec] of Object.entries(queries)) {
      void runOne(queryId, spec)
    }

    return () => {
      cancelled = true
    }
  }, [viewId, view?.version, setQueryState, view?.runtimeConfig])

  return runtimeSlice
}

