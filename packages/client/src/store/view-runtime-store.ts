'use client'

import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import { getAtPath, setAtPath } from '@/lib/objectPath'

export type ViewQueryState = {
  status: 'idle' | 'loading' | 'success' | 'error'
  data?: unknown
  error?: string
  updatedAt?: string
}

export type ViewRuntimeSlice = {
  state: Record<string, unknown>
  queries: Record<string, ViewQueryState>
}

export type ViewRuntimeStoreState = {
  views: Record<string, ViewRuntimeSlice>
  initView: (viewId: string, initial?: Partial<ViewRuntimeSlice>) => void
  clearView: (viewId: string) => void
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

      replaceState: (viewId: string, nextState: Record<string, unknown>) => {
        if (!viewId) return
        set(
          s => {
            const cur = s.views[viewId] ?? { state: {}, queries: {} }
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
            const cur = s.views[viewId] ?? { state: {}, queries: {} }
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
            const cur = s.views[viewId] ?? { state: {}, queries: {} }
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

