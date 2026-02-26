'use client'

import React from 'react'
import type { BindingSpec, WidgetInstanceNode } from '@starships/protocol'
import { WIDGET_CATALOG_BY_TYPE } from './widgetCatalog'
import { getAtPath, setAtPath } from '@/lib/objectPath'

export type WidgetTreeRendererProps = {
  node: WidgetInstanceNode
  className?: string
  runtime?: {
    state?: Record<string, unknown>
    queries?: Record<string, { data?: unknown }>
  }
  onEvent?: (instanceId: string, name: string, payload?: unknown) => void | Promise<void>
}

function UnknownWidgetType(props: { type: string }) {
  return (
    <div className="p-4 border border-red-500 rounded-lg bg-red-50 dark:bg-red-950/20">
      <p className="text-sm text-red-600 dark:text-red-400">Unknown widget type: {props.type}</p>
      <p className="text-xs text-muted-foreground mt-1">Available: {Object.keys(WIDGET_CATALOG_BY_TYPE).join(', ')}</p>
    </div>
  )
}

function WidgetRenderError(props: { error: unknown; node: WidgetInstanceNode }) {
  const message = props.error instanceof Error ? props.error.message : 'Unknown error'
  return (
    <div className="p-4 border border-red-500 rounded-lg bg-red-50 dark:bg-red-950/20">
      <p className="text-sm text-red-600 dark:text-red-400">Error rendering widget: {message}</p>
      <details className="mt-2">
        <summary className="text-xs text-muted-foreground cursor-pointer">Node details</summary>
        <pre className="text-xs mt-2 overflow-auto">{JSON.stringify(props.node, null, 2)}</pre>
      </details>
    </div>
  )
}

export function WidgetTreeRenderer({ node, className, runtime, onEvent }: WidgetTreeRendererProps): React.JSX.Element {
  const Component = WIDGET_CATALOG_BY_TYPE[node.type]?.Component
  const children = Array.isArray(node.children) ? node.children : []

  if (!Component) return <UnknownWidgetType type={node.type} />

  try {
    let props: Record<string, unknown> = (node.props && typeof node.props === 'object' ? (node.props as Record<string, unknown>) : {}) as Record<string, unknown>

    // Apply ephemeral per-instance prop patches (e.g. from sandbox ops).
    const patchedProps = getAtPath(runtime?.state ?? {}, `_props.${String(node.id)}`)
    if (patchedProps && typeof patchedProps === 'object' && !Array.isArray(patchedProps)) {
      props = { ...props, ...(patchedProps as Record<string, unknown>) }
    }

    // Apply deterministic bindings as computed prop overrides.
    if (node.bindings && typeof node.bindings === 'object' && !Array.isArray(node.bindings)) {
      const bindings = node.bindings as Record<string, BindingSpec>
      for (const [propPath, spec] of Object.entries(bindings)) {
        if (!spec || typeof spec !== 'object') continue
        const v = resolveBinding(spec, runtime)
        if (v !== undefined) {
          props = setAtPath(props, propPath, v)
        }
      }
    }

    // v1 event wiring: Button -> click.
    const handlersRec = node.handlers && typeof node.handlers === 'object' && !Array.isArray(node.handlers) ? (node.handlers as any) : null
    if (node.type === 'Button' && typeof (props as any).onClick !== 'function' && handlersRec?.click && typeof onEvent === 'function') {
      ;(props as any).onClick = () => onEvent(String(node.id), 'click')
    }

    // v1 event wiring: basic form controls -> change.
    const supportsChange = node.type === 'Input' || node.type === 'Textarea' || node.type === 'Select' || node.type === 'Checkbox' || node.type === 'Switch'
    if (supportsChange && typeof (props as any).onChange !== 'function' && handlersRec?.change && typeof onEvent === 'function') {
      ;(props as any).onChange = (payload: unknown) => onEvent(String(node.id), 'change', payload)
    }

    const renderedChildren = children.length
      ? children.map(child => <WidgetTreeRenderer key={child.id} node={child} runtime={runtime} onEvent={onEvent} />)
      : undefined

    // NOTE: Children are passed as React children. Container widgets should render them.
    const propsClassName = typeof (props as any).className === 'string' ? String((props as any).className) : ''
    const mergedClassName = [propsClassName, className].filter(Boolean).join(' ') || undefined
    return (
      <Component {...(props as any)} className={mergedClassName}>
        {renderedChildren}
      </Component>
    )
  } catch (error) {
    return <WidgetRenderError error={error} node={node} />
  }
}

function resolveBinding(spec: BindingSpec, runtime: WidgetTreeRendererProps['runtime']): unknown {
  if (!spec || typeof spec !== 'object') return undefined
  if (spec.kind === 'state') {
    return getAtPath(runtime?.state ?? {}, spec.path || '')
  }
  if (spec.kind === 'query') {
    const q = runtime?.queries?.[spec.queryId]
    return spec.path ? getAtPath(q?.data, spec.path) : q?.data
  }
  // v1: expr bindings are not evaluated here; reserved for a future safe-expression engine.
  return undefined
}

