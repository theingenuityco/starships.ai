'use client'

import React from 'react'
import type { HandlerSpec, ViewModel, ViewRuntimeActionRequest, WidgetInstanceNode } from '@starships/protocol'
import api from '@/lib/api'
import { useViewRuntime } from '@/hooks/useViewRuntime'
import { useViewStream } from '@/hooks/useViewStream'
import { useViewRuntimeStore } from '@/store/view-runtime-store'
import { WidgetTreeRenderer } from '@/components/widgets'
import { JsSandboxHost, type JsSandboxHandle } from './JsSandboxHost'

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

function isHandlerSpec(v: unknown): v is HandlerSpec {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v) && typeof (v as any).kind === 'string'
}

export function DynamicViewRenderer(props: { view: ViewModel }) {
  const { view } = props
  const runtimeSlice = useViewRuntime(view)
  useViewStream(String(view.id), true)
  const sandboxRef = React.useRef<JsSandboxHandle | null>(null)

  const setStateAtPath = useViewRuntimeStore(s => s.setStateAtPath)
  const getStateAtPath = useViewRuntimeStore(s => s.getStateAtPath)

  const dispatchAction = React.useCallback(
    async (action: ViewRuntimeActionRequest) => {
      if (!action || typeof action !== 'object') return
      if (action.type === 'set_state') {
        setStateAtPath(view.id, action.path, action.value)
        return
      }
      if (action.type === 'patch_props') {
        const basePath = `_props.${action.instanceId}`
        const prev = (getStateAtPath(view.id, basePath) as any) ?? {}
        const next = { ...(prev && typeof prev === 'object' ? prev : {}), ...(action.patch ?? {}) }
        setStateAtPath(view.id, basePath, next)
        return
      }

      // Server-handled actions (workflows/root patches).
      try {
        await api.post(`/api/v1/views/${encodeURIComponent(String(view.id))}/actions`, action)
      } catch {
        // best-effort; surfaced later via streaming/toasts
      }
    },
    [view.id, setStateAtPath, getStateAtPath]
  )

  const dispatchEvent = React.useCallback(
    async (instanceId: string, name: string, payload?: unknown) => {
      const node = findNodeById(view.root, instanceId)
      if (!node) return
      const handlers = node.handlers && typeof node.handlers === 'object' && !Array.isArray(node.handlers) ? (node.handlers as any) : null
      const raw = handlers ? handlers[name] : null
      if (!isHandlerSpec(raw)) return

      if (raw.kind === 'actions') {
        const actions = Array.isArray((raw as any).actions) ? ((raw as any).actions as ViewRuntimeActionRequest[]) : []
        for (const a of actions) await dispatchAction(a)
        return
      }

      if (raw.kind === 'script') {
        const scriptId = String((raw as any).scriptId || '')
        if (!scriptId) return
        const entrypoint = typeof (raw as any).entrypoint === 'string' ? String((raw as any).entrypoint) : undefined
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
    [view.root, runtimeSlice?.state, dispatchAction]
  )

  // Runtime-wired click support for Button nodes (v1).
  const runtimeForRenderer = React.useMemo(() => runtimeSlice ?? { state: {}, queries: {} }, [runtimeSlice])

  return (
    <>
      <JsSandboxHost ref={sandboxRef} scripts={view.runtimeConfig?.scripts} />
      <WidgetTreeRenderer
        node={view.root}
        className="w-full min-w-0"
        runtime={runtimeForRenderer}
        onEvent={dispatchEvent}
      />
    </>
  )
}

