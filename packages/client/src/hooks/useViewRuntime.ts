'use client'

import { useEffect } from 'react'
import type { ViewModel } from '@starships/protocol'
import api from '@/lib/api'
import { useViewRuntimeStore } from '@/store/view-runtime-store'

export function useViewRuntime(view: ViewModel | undefined) {
  const viewId = view?.id ? String(view.id) : ''
  const initView = useViewRuntimeStore(s => s.initView)
  const runtimeSlice = useViewRuntimeStore(s => (viewId ? s.views[viewId] : undefined))
  const setQueryState = useViewRuntimeStore(s => s.setQueryState)

  // Ensure slice exists
  useEffect(() => {
    if (!viewId) return
    initView(viewId, { root: view?.root ?? null, state: {}, queries: {} })
  }, [viewId, view?.root, initView])

  // v1 query runner (best-effort): executes http + same-origin api routes.
  useEffect(() => {
    if (!viewId) return
    const queries = view?.runtimeConfig?.queries
    if (!queries) return
    let cancelled = false

    async function runOne(queryId: string, specUnknown: unknown) {
      if (!queryId || !specUnknown || typeof specUnknown !== 'object' || Array.isArray(specUnknown)) return
      const spec = specUnknown as { kind?: unknown; url?: unknown; method?: unknown; bodyTemplate?: unknown }
      if (spec.kind !== 'http') return
      const url = typeof spec.url === 'string' ? spec.url : ''
      const method = spec.method === 'POST' ? 'POST' : 'GET'
      if (!url || !url.startsWith('/')) return

      setQueryState(viewId, queryId, { status: 'loading', error: undefined })
      try {
        const resp = method === 'POST' ? await api.post(url, spec.bodyTemplate ?? {}) : await api.get(url)
        const data = (resp as { data?: unknown } | null)?.data
        const unwrapped =
          data && typeof data === 'object' && !Array.isArray(data) && 'data' in (data as Record<string, unknown>)
            ? (data as Record<string, unknown>).data
            : data ?? resp
        if (cancelled) return
        setQueryState(viewId, queryId, { status: 'success', data: unwrapped })
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

