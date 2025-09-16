import React from 'react'
import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'

interface ConversationStreaming {
  content: string
  chunks: number
  isStreaming: boolean
  version?: number
  updatedAt: number
}

interface StarshipUIState {
  // UI-only state
  activeStarshipId: string | null
  currentRoute: string

  // Streaming (ephemeral, not persisted)
  conversationsStreaming: Record<string, ConversationStreaming>

  // UI actions
  setActiveStarship: (id: string | null) => void
  navigateTo: (route: string) => void

  // Streaming actions
  startStreaming: (conversationId: string, version?: number) => void
  appendStreamingChunk: (conversationId: string, text: string, version?: number) => void
  endStreaming: (conversationId: string) => void
  clearStreaming: (conversationId: string) => void
}

export const useStarshipUIStore = create<StarshipUIState>()(
  devtools(
    persist(
      set => ({
        // Initial state
        activeStarshipId: null,
        currentRoute: '/',
        conversationsStreaming: {},

        // UI actions
        setActiveStarship: (id: string | null) => {
          set({ activeStarshipId: id }, false, 'ui/setActiveStarship')

          // Also sync with localStorage for cross-tab consistency
          if (typeof window !== 'undefined') {
            if (id) {
              localStorage.setItem('activeStarshipId', id)
            } else {
              localStorage.removeItem('activeStarshipId')
            }
          }
        },

        navigateTo: (route: string) => set({ currentRoute: route }, false, 'ui/navigate'),

        // Streaming actions (ephemeral)
        startStreaming: (conversationId: string, version?: number) =>
          set(
            state => {
              const current = state.conversationsStreaming[conversationId]
              return {
                conversationsStreaming: {
                  ...state.conversationsStreaming,
                  [conversationId]: {
                    content: current?.content ?? '',
                    chunks: current?.chunks ?? 0,
                    isStreaming: true,
                    version: version ?? current?.version,
                    updatedAt: Date.now(),
                  },
                },
              }
            },
            false,
            'stream/start'
          ),

        appendStreamingChunk: (conversationId: string, text: string, version?: number) =>
          set(
            state => {
              const current = state.conversationsStreaming[conversationId] || {
                content: '',
                chunks: 0,
                isStreaming: true,
                version,
                updatedAt: 0,
              }
              return {
                conversationsStreaming: {
                  ...state.conversationsStreaming,
                  [conversationId]: {
                    content: current.content + text,
                    chunks: current.chunks + 1,
                    isStreaming: true,
                    version: version ?? current.version,
                    updatedAt: Date.now(),
                  },
                },
              }
            },
            false,
            'stream/append'
          ),

        endStreaming: (conversationId: string) =>
          set(
            state => {
              const current = state.conversationsStreaming[conversationId]
              if (!current) return { conversationsStreaming: state.conversationsStreaming }
              return {
                conversationsStreaming: {
                  ...state.conversationsStreaming,
                  [conversationId]: { ...current, isStreaming: false, updatedAt: Date.now() },
                },
              }
            },
            false,
            'stream/end'
          ),

        clearStreaming: (conversationId: string) =>
          set(
            state => {
              const { [conversationId]: _, ...rest } = state.conversationsStreaming
              return { conversationsStreaming: rest }
            },
            false,
            'stream/clear'
          ),
      }),
      {
        name: 'starship-ui-store',
        partialize: state => ({
          activeStarshipId: state.activeStarshipId,
          currentRoute: state.currentRoute,
        }),
      }
    ),
    {
      name: 'starship-ui-store',
    }
  )
)

// Utility hook to sync active starship with localStorage on hydration
export function useStarshipUIHydration() {
  const { setActiveStarship, activeStarshipId } = useStarshipUIStore()

  // Hydrate from localStorage on mount
  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      const storedId = localStorage.getItem('activeStarshipId')
      if (storedId && storedId !== activeStarshipId) {
        setActiveStarship(storedId)
      }
    }
  }, [setActiveStarship, activeStarshipId])
}
