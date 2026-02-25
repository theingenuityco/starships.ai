'use client'

import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import type { BindingSpec, HandlerSpec, ViewModel, ViewRuntimeActionRequest, ViewRuntimeConfig, ViewScript, WidgetInstanceNode } from '@starships/protocol'
import { setAtPath } from '@/lib/objectPath'
import { getChildIndex, getParentId, insertChild, moveNode, removeNode, reorderChild, updateNode } from '../treeOps'
import { getWidgetDefinition } from '@/components/widgets/widgetDefinitions'

export type ViewEditorMode = 'design' | 'preview'

export type ViewEditorSnapshot = {
  draftRoot: WidgetInstanceNode | null
  draftRuntimeConfig: ViewRuntimeConfig
  selectedId: string
}

export type ViewEditorState = {
  mode: ViewEditorMode
  draftRoot: WidgetInstanceNode | null
  draftRuntimeConfig: ViewRuntimeConfig
  selectedId: string
  dirty: boolean
  historyPast: ViewEditorSnapshot[]
  historyFuture: ViewEditorSnapshot[]

  initFromView: (view: ViewModel) => void
  setMode: (mode: ViewEditorMode) => void
  setSelectedId: (id: string) => void

  canUndo: () => boolean
  canRedo: () => boolean
  undo: () => void
  redo: () => void
  markSaved: () => void

  // Atomic editor actions (history-aware)
  setSelectedType: (type: string) => void
  setSelectedProp: (path: string, value: unknown) => void
  setSelectedPropsFromJson: (json: string) => void
  setSelectedBinding: (propPath: string, spec: BindingSpec | null) => void
  setSelectedHandler: (eventName: string, spec: HandlerSpec | null) => void
  setSelectedActionsHandlerFromJson: (eventName: string, json: string) => void
  upsertScript: (scriptId: string, source: string) => void
  ensureScript: (scriptId: string) => void
  addChildToSelected: (child: WidgetInstanceNode) => void
  insertChild: (parentId: string, child: WidgetInstanceNode, index?: number) => void
  moveExistingNode: (nodeId: string, toParentId: string, toIndex: number) => void
  reorderChildren: (parentId: string, fromIndex: number, toIndex: number) => void
  deleteSelected: () => void
}

const HISTORY_LIMIT = 50

function clone<T>(v: T): T {
  const sc = (globalThis as any).structuredClone as undefined | ((x: any) => any)
  if (typeof sc === 'function') return sc(v)
  return JSON.parse(JSON.stringify(v)) as T
}

function snapshotOf(state: Pick<ViewEditorState, 'draftRoot' | 'draftRuntimeConfig' | 'selectedId'>): ViewEditorSnapshot {
  return {
    draftRoot: state.draftRoot ? clone(state.draftRoot) : null,
    draftRuntimeConfig: clone(state.draftRuntimeConfig ?? {}),
    selectedId: String(state.selectedId ?? 'root'),
  }
}

export const useViewEditorStore = create<ViewEditorState>()(
  devtools(
    (set, get) => ({
      mode: 'design',
      draftRoot: null,
      draftRuntimeConfig: {},
      selectedId: 'root',
      dirty: false,
      historyPast: [],
      historyFuture: [],

      initFromView: (view: ViewModel) => {
        set(
          () => ({
            draftRoot: view.root,
            draftRuntimeConfig: view.runtimeConfig ?? {},
            selectedId: String(view.root?.id ?? 'root'),
            dirty: false,
            historyPast: [],
            historyFuture: [],
          }),
          false,
          'viewEditor/initFromView'
        )
      },

      setMode: (mode: ViewEditorMode) => set(() => ({ mode }), false, 'viewEditor/setMode'),
      setSelectedId: (selectedId: string) => set(() => ({ selectedId }), false, 'viewEditor/setSelectedId'),

      canUndo: () => get().historyPast.length > 0,
      canRedo: () => get().historyFuture.length > 0,

      undo: () => {
        set(
          (s) => {
            if (!s.historyPast.length) return s
            const prev = s.historyPast[s.historyPast.length - 1]
            const current = snapshotOf(s)
            const nextPast = s.historyPast.slice(0, -1)
            const nextFuture = [current, ...s.historyFuture].slice(0, HISTORY_LIMIT)
            return {
              ...s,
              draftRoot: prev.draftRoot ? clone(prev.draftRoot) : null,
              draftRuntimeConfig: clone(prev.draftRuntimeConfig ?? {}),
              selectedId: String(prev.selectedId ?? (prev.draftRoot?.id ?? 'root')),
              historyPast: nextPast,
              historyFuture: nextFuture,
              dirty: true,
            }
          },
          false,
          'viewEditor/undo'
        )
      },

      redo: () => {
        set(
          (s) => {
            if (!s.historyFuture.length) return s
            const next = s.historyFuture[0]
            const current = snapshotOf(s)
            const nextFuture = s.historyFuture.slice(1)
            const nextPast = [...s.historyPast, current].slice(-HISTORY_LIMIT)
            return {
              ...s,
              draftRoot: next.draftRoot ? clone(next.draftRoot) : null,
              draftRuntimeConfig: clone(next.draftRuntimeConfig ?? {}),
              selectedId: String(next.selectedId ?? (next.draftRoot?.id ?? 'root')),
              historyPast: nextPast,
              historyFuture: nextFuture,
              dirty: true,
            }
          },
          false,
          'viewEditor/redo'
        )
      },

      markSaved: () =>
        set(
          () => ({
            dirty: false,
          }),
          false,
          'viewEditor/markSaved'
        ),

      setSelectedType: (type: string) => {
        const s0 = get()
        if (!s0.draftRoot) return
        const id = String(s0.selectedId)
        const nextRoot = updateNode(s0.draftRoot, id, (n) => ({ ...n, type: String(type || n.type) }))
        const snap = snapshotOf(s0)
        set(
          () => ({
            draftRoot: nextRoot,
            dirty: true,
            historyPast: [...s0.historyPast, snap].slice(-HISTORY_LIMIT),
            historyFuture: [],
          }),
          false,
          'viewEditor/setSelectedType'
        )
      },

      setSelectedProp: (path: string, value: unknown) => {
        const s0 = get()
        if (!s0.draftRoot) return
        const id = String(s0.selectedId)
        const snap = snapshotOf(s0)
        const nextRoot = updateNode(s0.draftRoot, id, (n) => {
          const base = n.props && typeof n.props === 'object' && !Array.isArray(n.props) ? (n.props as Record<string, any>) : {}
          const nextProps = setAtPath(base, path, value)
          return { ...n, props: nextProps }
        })
        set(
          () => ({
            draftRoot: nextRoot,
            dirty: true,
            historyPast: [...s0.historyPast, snap].slice(-HISTORY_LIMIT),
            historyFuture: [],
          }),
          false,
          'viewEditor/setSelectedProp'
        )
      },

      setSelectedPropsFromJson: (json: string) => {
        const s0 = get()
        if (!s0.draftRoot) return
        const id = String(s0.selectedId)
        try {
          const parsed = JSON.parse(String(json ?? ''))
          if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return
          const snap = snapshotOf(s0)
          const nextRoot = updateNode(s0.draftRoot, id, (n) => ({ ...n, props: parsed }))
          set(
            () => ({
              draftRoot: nextRoot,
              dirty: true,
              historyPast: [...s0.historyPast, snap].slice(-HISTORY_LIMIT),
              historyFuture: [],
            }),
            false,
            'viewEditor/setSelectedPropsFromJson'
          )
        } catch {
          // ignore invalid JSON while typing
        }
      },

      setSelectedBinding: (propPath: string, spec: BindingSpec | null) => {
        const s0 = get()
        if (!s0.draftRoot) return
        const id = String(s0.selectedId)
        const key = String(propPath || '').trim()
        if (!key) return
        const snap = snapshotOf(s0)
        const nextRoot = updateNode(s0.draftRoot, id, (n) => {
          const cur = n.bindings && typeof n.bindings === 'object' && !Array.isArray(n.bindings) ? (n.bindings as Record<string, BindingSpec>) : {}
          const next: Record<string, BindingSpec> = { ...cur }
          if (!spec) delete next[key]
          else next[key] = spec
          const has = Object.keys(next).length > 0
          return { ...n, ...(has ? { bindings: next } : { bindings: undefined }) }
        })
        set(
          () => ({
            draftRoot: nextRoot,
            dirty: true,
            historyPast: [...s0.historyPast, snap].slice(-HISTORY_LIMIT),
            historyFuture: [],
          }),
          false,
          'viewEditor/setSelectedBinding'
        )
      },

      setSelectedHandler: (eventName: string, spec: HandlerSpec | null) => {
        const s0 = get()
        if (!s0.draftRoot) return
        const id = String(s0.selectedId)
        const key = String(eventName || '').trim()
        if (!key) return
        const snap = snapshotOf(s0)
        const nextRoot = updateNode(s0.draftRoot, id, (n) => {
          const cur = n.handlers && typeof n.handlers === 'object' && !Array.isArray(n.handlers) ? (n.handlers as Record<string, HandlerSpec>) : {}
          const next: Record<string, HandlerSpec> = { ...cur }
          if (!spec) delete next[key]
          else next[key] = spec
          const has = Object.keys(next).length > 0
          return { ...n, ...(has ? { handlers: next } : { handlers: undefined }) }
        })
        set(
          () => ({
            draftRoot: nextRoot,
            dirty: true,
            historyPast: [...s0.historyPast, snap].slice(-HISTORY_LIMIT),
            historyFuture: [],
          }),
          false,
          'viewEditor/setSelectedHandler'
        )
      },

      setSelectedActionsHandlerFromJson: (eventName: string, json: string) => {
        const s0 = get()
        if (!s0.draftRoot) return
        const key = String(eventName || '').trim()
        if (!key) return
        try {
          const parsed = JSON.parse(String(json ?? ''))
          if (!Array.isArray(parsed)) return
          const actions = parsed as ViewRuntimeActionRequest[]
          get().setSelectedHandler(key, { kind: 'actions', actions })
        } catch {
          // ignore invalid JSON while typing
        }
      },

      ensureScript: (scriptId: string) => {
        const s0 = get()
        const id = String(scriptId || '').trim()
        if (!id) return
        const scripts = (s0.draftRuntimeConfig?.scripts ?? {}) as Record<string, ViewScript>
        if (scripts[id]) return
        const snap = snapshotOf(s0)
        const nextCfg: ViewRuntimeConfig = {
          ...(s0.draftRuntimeConfig ?? {}),
          scripts: {
            ...scripts,
            [id]: { language: 'javascript', source: '' },
          },
        }
        set(
          () => ({
            draftRuntimeConfig: nextCfg,
            dirty: true,
            historyPast: [...s0.historyPast, snap].slice(-HISTORY_LIMIT),
            historyFuture: [],
          }),
          false,
          'viewEditor/ensureScript'
        )
      },

      upsertScript: (scriptId: string, source: string) => {
        const s0 = get()
        const id = String(scriptId || '').trim()
        if (!id) return
        const snap = snapshotOf(s0)
        const scripts = (s0.draftRuntimeConfig?.scripts ?? {}) as Record<string, ViewScript>
        const prev = scripts[id]
        const next: ViewScript = { language: 'javascript', source: String(source ?? '') }
        if (prev && prev.language === next.language && prev.source === next.source) return
        const nextCfg: ViewRuntimeConfig = {
          ...(s0.draftRuntimeConfig ?? {}),
          scripts: {
            ...scripts,
            [id]: next,
          },
        }
        set(
          () => ({
            draftRuntimeConfig: nextCfg,
            dirty: true,
            historyPast: [...s0.historyPast, snap].slice(-HISTORY_LIMIT),
            historyFuture: [],
          }),
          false,
          'viewEditor/upsertScript'
        )
      },

      addChildToSelected: (child: WidgetInstanceNode) => {
        const s0 = get()
        if (!s0.draftRoot) return
        const parentId = String(s0.selectedId)
        const parent = findNodeFast(s0.draftRoot, parentId)
        if (!parent) return
        const def = getWidgetDefinition(parent.type)
        if (def && !def.acceptsChildren) return
        const existingCount = Array.isArray(parent?.children) ? parent!.children!.length : 0
        const nextRoot = insertChild(s0.draftRoot, parentId, existingCount, child)
        if (nextRoot === s0.draftRoot) return
        const snap = snapshotOf(s0)
        set(
          () => ({
            draftRoot: nextRoot,
            dirty: true,
            historyPast: [...s0.historyPast, snap].slice(-HISTORY_LIMIT),
            historyFuture: [],
          }),
          false,
          'viewEditor/addChildToSelected'
        )
      },

      insertChild: (parentId: string, child: WidgetInstanceNode, index?: number) => {
        const s0 = get()
        if (!s0.draftRoot) return
        const p = String(parentId || '')
        if (!p) return
        const parent = findNodeFast(s0.draftRoot, p)
        if (!parent) return
        const def = getWidgetDefinition(parent.type)
        if (def && !def.acceptsChildren) return
        const len = Array.isArray(parent?.children) ? parent!.children!.length : 0
        const i = typeof index === 'number' ? index : len
        const nextRoot = insertChild(s0.draftRoot, p, i, child)
        if (nextRoot === s0.draftRoot) return
        const snap = snapshotOf(s0)
        set(
          () => ({
            draftRoot: nextRoot,
            selectedId: String(child.id),
            dirty: true,
            historyPast: [...s0.historyPast, snap].slice(-HISTORY_LIMIT),
            historyFuture: [],
          }),
          false,
          'viewEditor/insertChild'
        )
      },

      moveExistingNode: (nodeId: string, toParentId: string, toIndex: number) => {
        const s0 = get()
        if (!s0.draftRoot) return
        const id = String(nodeId || '')
        const parentId = String(toParentId || '')
        if (!id || !parentId) return
        if (String(s0.draftRoot.id) === id) return

        const parent = findNodeFast(s0.draftRoot, parentId)
        if (!parent) return
        const def = getWidgetDefinition(parent.type)
        if (def && !def.acceptsChildren) return

        const nextRoot = moveNode(s0.draftRoot, id, parentId, toIndex)
        if (nextRoot === s0.draftRoot) return
        const snap = snapshotOf(s0)
        set(
          () => ({
            draftRoot: nextRoot,
            selectedId: id,
            dirty: true,
            historyPast: [...s0.historyPast, snap].slice(-HISTORY_LIMIT),
            historyFuture: [],
          }),
          false,
          'viewEditor/moveExistingNode'
        )
      },

      reorderChildren: (parentId: string, fromIndex: number, toIndex: number) => {
        const s0 = get()
        if (!s0.draftRoot) return
        const pid = String(parentId || '')
        if (!pid) return
        const nextRoot = reorderChild(s0.draftRoot, pid, fromIndex, toIndex)
        if (nextRoot === s0.draftRoot) return
        const snap = snapshotOf(s0)
        set(
          () => ({
            draftRoot: nextRoot,
            dirty: true,
            historyPast: [...s0.historyPast, snap].slice(-HISTORY_LIMIT),
            historyFuture: [],
          }),
          false,
          'viewEditor/reorderChildren'
        )
      },

      deleteSelected: () => {
        const s0 = get()
        if (!s0.draftRoot) return
        const id = String(s0.selectedId)
        if (String(s0.draftRoot.id) === id) return
        const nextRoot = removeNode(s0.draftRoot, id)
        const snap = snapshotOf(s0)
        set(
          () => ({
            draftRoot: nextRoot,
            selectedId: String(nextRoot.id),
            dirty: true,
            historyPast: [...s0.historyPast, snap].slice(-HISTORY_LIMIT),
            historyFuture: [],
          }),
          false,
          'viewEditor/deleteSelected'
        )
      },
    }),
    { name: 'view-editor-store' }
  )
)

// Lightweight local search used for insert counts without importing findNode into store public API.
function findNodeFast(root: WidgetInstanceNode, id: string): WidgetInstanceNode | null {
  if (!root || !id) return null
  if (String(root.id) === String(id)) return root
  const children = Array.isArray(root.children) ? root.children : []
  for (const c of children) {
    const found = findNodeFast(c, id)
    if (found) return found
  }
  return null
}

