'use client'

import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import { applyPatch, type Operation } from 'fast-json-patch'
import type { ViewPatchOp, WidgetInstanceNode } from '@starships/protocol'
import { getAtPath, setAtPath } from '@/lib/objectPath'

export type ViewQueryState = {
  status: 'idle' | 'loading' | 'success' | 'error'
  data?: unknown
  error?: string
  updatedAt?: string
}

export type ViewRuntimeSlice = {
  root: WidgetInstanceNode | null
  state: Record<string, unknown>
  queries: Record<string, ViewQueryState>
}

export type ViewRuntimeStoreState = {
  views: Record<string, ViewRuntimeSlice>
  initView: (viewId: string, initial?: Partial<ViewRuntimeSlice>) => void
  clearView: (viewId: string) => void
  replaceRoot: (viewId: string, nextRoot: WidgetInstanceNode | null) => void
  applyRootPatch: (viewId: string, patch: ViewPatchOp[]) => void
  replaceState: (viewId: string, nextState: Record<string, unknown>) => void

  getStateAtPath: (viewId: string, path: string) => unknown
  setStateAtPath: (viewId: string, path: string, value: unknown) => void

  setQueryState: (viewId: string, queryId: string, next: Partial<ViewQueryState>) => void
}

export const useViewRuntimeStore = create<ViewRuntimeStoreState>()(
  devtools(
    (set, get) => ({
      views: {},

      initView: (viewId: string, initial?: Partial<ViewRuntimeSlice>) => {
        if (!viewId) return
        set(
          s => {
            if (s.views[viewId]) return s
            return {
              views: {
                ...s.views,
                [viewId]: {
                  root: initial?.root ?? null,
                  state: initial?.state ?? {},
                  queries: initial?.queries ?? {},
                },
              },
            }
          },
          false,
          'viewRuntime/initView'
        )
      },

      clearView: (viewId: string) => {
        if (!viewId) return
        set(
          s => {
            if (!s.views[viewId]) return s
            const { [viewId]: _, ...rest } = s.views
            return { views: rest }
          },
          false,
          'viewRuntime/clearView'
        )
      },

      replaceRoot: (viewId: string, nextRoot: WidgetInstanceNode | null) => {
        if (!viewId) return
        set(
          s => {
            const cur = s.views[viewId] ?? { root: null, state: {}, queries: {} }
            return { views: { ...s.views, [viewId]: { ...cur, root: nextRoot ?? null } } }
          },
          false,
          'viewRuntime/replaceRoot'
        )
      },

      applyRootPatch: (viewId: string, patch: ViewPatchOp[]) => {
        if (!viewId) return
        if (!Array.isArray(patch) || patch.length === 0) return
        set(
          s => {
            const cur = s.views[viewId] ?? { root: null, state: {}, queries: {} }
            if (!cur.root) return s
            try {
              const base: WidgetInstanceNode =
                typeof structuredClone === 'function' ? structuredClone(cur.root) : (JSON.parse(JSON.stringify(cur.root)) as WidgetInstanceNode)
              const ops: Operation[] = patch
              const res = applyPatch<WidgetInstanceNode>(base, ops, /*validate*/ true, /*mutateDocument*/ true)
              return { views: { ...s.views, [viewId]: { ...cur, root: res.newDocument } } }
            } catch {
              return s
            }
          },
          false,
          'viewRuntime/applyRootPatch'
        )
      },

      replaceState: (viewId: string, nextState: Record<string, unknown>) => {
        if (!viewId) return
        set(
          s => {
            const cur = s.views[viewId] ?? { root: null, state: {}, queries: {} }
            return { views: { ...s.views, [viewId]: { ...cur, state: nextState ?? {} } } }
          },
          false,
          'viewRuntime/replaceState'
        )
      },

      getStateAtPath: (viewId: string, path: string) => {
        const slice = get().views[viewId]
        if (!slice) return undefined
        return getAtPath(slice.state, path)
      },

      setStateAtPath: (viewId: string, path: string, value: unknown) => {
        if (!viewId) return
        set(
          s => {
            const cur = s.views[viewId] ?? { root: null, state: {}, queries: {} }
            const nextState = setAtPath(cur.state, path, value)
            return {
              views: {
                ...s.views,
                [viewId]: { ...cur, state: nextState },
              },
            }
          },
          false,
          'viewRuntime/setStateAtPath'
        )
      },

      setQueryState: (viewId: string, queryId: string, next: Partial<ViewQueryState>) => {
        if (!viewId || !queryId) return
        set(
          s => {
            const cur = s.views[viewId] ?? { root: null, state: {}, queries: {} }
            const prevQ = cur.queries[queryId] ?? { status: 'idle' as const }
            return {
              views: {
                ...s.views,
                [viewId]: {
                  ...cur,
                  queries: {
                    ...cur.queries,
                    [queryId]: {
                      ...prevQ,
                      ...next,
                      ...(next.status === 'success' ? { updatedAt: new Date().toISOString() } : null),
                    },
                  },
                },
              },
            }
          },
          false,
          'viewRuntime/setQueryState'
        )
      },
    }),
    { name: 'view-runtime-store' }
  )
)

