'use client'

import React from 'react'
import type { HandlerSpec, ViewModel, ViewQueryId, ViewQuerySpec, ViewRuntimeActionRequest, WidgetInstanceNode } from '@starships/protocol'
import api from '@/lib/api'
import { useViewRuntime } from '@/hooks/useViewRuntime'
import { useViewStream } from '@/hooks/useViewStream'
import { useViewRuntimeStore } from '@/store/view-runtime-store'
import { WidgetTreeRenderer } from '@/components/widgets'
import { JsSandboxHost, type JsSandboxHandle } from './JsSandboxHost'
import { templateDeep, templateString } from '@/lib/viewTemplates'

function findNodeById(root: WidgetInstanceNode, id: string): WidgetInstanceNode | null {
  if (!root || !id) return null
  if (String(root.id) === String(id)) return root
  const children = Array.isArray(root.children) ? root.children : []
  for (const c of children) {
    const found = findNodeById(c, id)
    if (found) return found
  }
  return null
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v)
}

function unwrapApiData(resp: unknown): unknown {
  // Supports axios-like { data: ... } and our ApiResponse { success, data } shape.
  if (!isPlainObject(resp)) return resp
  if ('data' in resp) {
    const d = (resp as Record<string, unknown>).data
    if (isPlainObject(d) && 'data' in d) return (d as Record<string, unknown>).data
    return d
  }
  return resp
}

export function DynamicViewRenderer(props: { view: ViewModel }) {
  const { view } = props
  const runtimeSlice = useViewRuntime(view)
  useViewStream(String(view.id), true)
  const sandboxRef = React.useRef<JsSandboxHandle | null>(null)

  const setStateAtPath = useViewRuntimeStore(s => s.setStateAtPath)
  const getStateAtPath = useViewRuntimeStore(s => s.getStateAtPath)
  const setQueryState = useViewRuntimeStore(s => s.setQueryState)

  const dispatchAction = React.useCallback(
    async (action: ViewRuntimeActionRequest) => {
      if (!action || typeof action !== 'object') return
      if (action.type === 'set_state') {
        setStateAtPath(view.id, action.path, action.value)
        return
      }
      if (action.type === 'patch_props') {
        const basePath = `_props.${action.instanceId}`
        const prev = getStateAtPath(view.id, basePath)
        const next = { ...(isPlainObject(prev) ? prev : {}), ...(action.patch ?? {}) }
        setStateAtPath(view.id, basePath, next)
        return
      }

      if (action.type === 'run_query') {
        const queryId = String(action.queryId || '').trim()
        if (!queryId) return
        const queries = view.runtimeConfig?.queries
        const spec: ViewQuerySpec | undefined =
          queries && Object.prototype.hasOwnProperty.call(queries, queryId) ? queries[queryId as ViewQueryId] : undefined
        if (!spec) return
        // IMPORTANT:
        // Queries must use the latest runtime state from the store, not the render-time snapshot.
        // This matters for script handlers that do `set_state` then `run_query` in the same tick.
        const latestState = getStateAtPath(view.id, '')
        const ctx = { state: (isPlainObject(latestState) ? latestState : {}) as Record<string, unknown> }

        // v1: http queries execute client-side (same-origin only)
        if (spec.kind === 'http') {
          const urlRaw = spec.url
          const url = templateString(urlRaw, ctx)
          const method = spec.method === 'POST' ? 'POST' : 'GET'
          if (!url || !url.startsWith('/')) {
            setQueryState(view.id, queryId, { status: 'error', error: 'HTTP query url must start with "/" (same-origin only)' })
            return
          }

          setQueryState(view.id, queryId, { status: 'loading', error: undefined })
          try {
            const body = method === 'POST' ? templateDeep(spec.bodyTemplate ?? {}, ctx) : undefined
            const resp = method === 'POST' ? await api.post(url, body ?? {}) : await api.get(url)
            setQueryState(view.id, queryId, { status: 'success', data: unwrapApiData(resp) })
          } catch (e) {
            setQueryState(view.id, queryId, { status: 'error', error: e instanceof Error ? e.message : String(e) })
          }
          return
        }

        // connector_action queries execute via the server (auth + permissions).
        if (spec.kind === 'connector_action') {
          setQueryState(view.id, queryId, { status: 'loading', error: undefined })
          try {
            const resp = await api.post(`/api/v1/views/${encodeURIComponent(String(view.id))}/queries/${encodeURIComponent(queryId)}/run`, {
              state: ctx.state,
            })
            setQueryState(view.id, queryId, { status: 'success', data: unwrapApiData(resp) })
          } catch (e) {
            setQueryState(view.id, queryId, { status: 'error', error: e instanceof Error ? e.message : String(e) })
          }
          return
        }

        return
      }

      // Server-handled actions (workflows/root patches).
      try {
        await api.post(`/api/v1/views/${encodeURIComponent(String(view.id))}/actions`, action)
      } catch {
        // best-effort; surfaced later via streaming/toasts
      }
    },
    [view.id, view.runtimeConfig, runtimeSlice?.state, setStateAtPath, getStateAtPath, setQueryState]
  )

  const dispatchEvent = React.useCallback(
    async (instanceId: string, name: string, payload?: unknown) => {
      const liveRoot = runtimeSlice?.root ?? view.root
      const node = findNodeById(liveRoot, instanceId)
      if (!node) return
      const raw: HandlerSpec | undefined = node.handlers?.[name]
      if (!raw) return

      if (raw.kind === 'actions') {
        for (const a of raw.actions) await dispatchAction(a)
        return
      }

      if (raw.kind === 'script') {
        const scriptId = raw.scriptId
        const entrypoint = raw.entrypoint
        const ops = await sandboxRef.current?.run(
          {
            scriptId,
            entrypoint,
            event: { name, payload, instanceId },
            state: (runtimeSlice?.state ?? {}) as Record<string, unknown>,
          },
          { timeoutMs: 1500 }
        )
        if (!ops) return
        for (const op of ops) await dispatchAction(op)
      }
    },
    [view.root, runtimeSlice?.root, runtimeSlice?.state, dispatchAction]
  )

  // Runtime-wired click support for Button nodes (v1).
  const runtimeForRenderer = React.useMemo(() => runtimeSlice ?? { state: {}, queries: {} }, [runtimeSlice])
  const rootForRenderer = runtimeSlice?.root ?? view.root

  return (
    <>
      <JsSandboxHost ref={sandboxRef} scripts={view.runtimeConfig?.scripts} />
      <WidgetTreeRenderer
        node={rootForRenderer}
        className="w-full min-w-0"
        runtime={runtimeForRenderer}
        onEvent={dispatchEvent}
      />
    </>
  )
}

