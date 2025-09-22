import React from 'react'
import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'
import type { MessageModel } from '@starships/protocol'

interface ConversationStreaming {
  content: string
  chunks: number
  isStreaming: boolean
  version?: number
  updatedAt: number
}

// UI conversation message shape (extends protocol with UI flags)
interface UIStreamChunk {
  content: string
  position: number
  timestamp: number
}
export interface UIMessage extends MessageModel {
  sending?: boolean
  streaming?: boolean
  error?: boolean
  chunks?: UIStreamChunk[]
  streamedContent?: string
}

interface ConversationData {
  messages: UIMessage[]
  total: number
  lastActivityAt?: string
  agentId?: string
  agentName?: string
  isResponding?: boolean // Gap between message send and streaming start
}

interface StarshipUIState {
  // UI-only state
  activeStarshipId: string | null
  currentRoute: string

  // Conversations data (authoritative UI source)
  conversations: Record<string, ConversationData>

  // Streaming (ephemeral, not persisted)
  conversationsStreaming: Record<string, ConversationStreaming>

  // UI actions
  setActiveStarship: (id: string | null) => void
  navigateTo: (route: string) => void

  // Conversation data actions (UI-driven from TanStack and SSE)
  setConversationSnapshot: (conversationId: string, data: ConversationData) => void
  appendMessage: (conversationId: string, message: UIMessage) => void
  updateMessageAt: (conversationId: string, index: number, updater: Partial<UIMessage> | ((m: UIMessage) => UIMessage)) => void
  appendMessageChunk: (conversationId: string, index: number, chunk: UIStreamChunk) => void
  markMessageStreaming: (conversationId: string, index: number, isStreaming: boolean) => void
  clearConversation: (conversationId: string) => void
  setConversationAgent: (conversationId: string, agentId: string, agentName: string) => void
  setConversationResponding: (conversationId: string, isResponding: boolean) => void

  // Streaming actions (ephemeral)
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
        conversations: {},
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

        // Conversation data actions
        setConversationSnapshot: (conversationId: string, data: ConversationData) =>
          set(
            state => {
              const prev = state.conversations[conversationId]
              return {
                conversations: {
                  ...state.conversations,
                  [conversationId]: {
                    // Preserve existing per-conversation UI metadata (agentId, agentName, isResponding, etc.)
                    ...(prev || {}),
                    // Override with the latest snapshot fields
                    messages: Array.isArray(data.messages) ? data.messages : [],
                    total: typeof data.total === 'number' ? data.total : Array.isArray(data.messages) ? data.messages.length : 0,
                    lastActivityAt: data.lastActivityAt,
                  },
                },
              }
            },
            false,
            'convo/setSnapshot'
          ),

        appendMessage: (conversationId: string, message: UIMessage) =>
          set(
            state => {
              const current = state.conversations[conversationId] || { messages: [], total: 0 }
              const messages = [...current.messages, message]
              return {
                conversations: {
                  ...state.conversations,
                  [conversationId]: { ...current, messages, total: messages.length },
                },
              }
            },
            false,
            'convo/appendMessage'
          ),

        updateMessageAt: (conversationId: string, index: number, updater: Partial<UIMessage> | ((m: UIMessage) => UIMessage)) =>
          set(
            state => {
              const current = state.conversations[conversationId]
              if (!current || index < 0 || index >= current.messages.length) return { conversations: state.conversations }
              const nextMessages = [...current.messages]
              const existing = nextMessages[index]
              nextMessages[index] = typeof updater === 'function' ? (updater as any)(existing) : { ...existing, ...(updater as any) }
              return {
                conversations: {
                  ...state.conversations,
                  [conversationId]: { ...current, messages: nextMessages },
                },
              }
            },
            false,
            'convo/updateMessageAt'
          ),

        appendMessageChunk: (conversationId: string, index: number, chunk: UIStreamChunk) =>
          set(
            state => {
              const current = state.conversations[conversationId]
              if (!current || index < 0 || index >= current.messages.length) return { conversations: state.conversations }
              const nextMessages = [...current.messages]
              const target = { ...nextMessages[index] }
              const chunks = Array.isArray(target.chunks) ? [...target.chunks] : []
              chunks.push({ content: chunk.content, position: chunk.position, timestamp: chunk.timestamp })
              target.chunks = chunks
              target.streaming = true
              nextMessages[index] = target
              return {
                conversations: {
                  ...state.conversations,
                  [conversationId]: { ...current, messages: nextMessages },
                },
              }
            },
            false,
            'convo/appendMessageChunk'
          ),

        markMessageStreaming: (conversationId: string, index: number, isStreaming: boolean) =>
          set(
            state => {
              const current = state.conversations[conversationId]
              if (!current || index < 0 || index >= current.messages.length) return { conversations: state.conversations }
              const nextMessages = [...current.messages]
              nextMessages[index] = { ...nextMessages[index], streaming: isStreaming }
              return {
                conversations: {
                  ...state.conversations,
                  [conversationId]: { ...current, messages: nextMessages },
                },
              }
            },
            false,
            'convo/markMessageStreaming'
          ),

        clearConversation: (conversationId: string) =>
          set(
            state => {
              const { [conversationId]: _, ...rest } = state.conversations
              return { conversations: rest }
            },
            false,
            'convo/clear'
          ),

        setConversationAgent: (conversationId: string, agentId: string, agentName: string) =>
          set(
            state => {
              const current = state.conversations[conversationId] || { messages: [], total: 0 }
              return {
                conversations: {
                  ...state.conversations,
                  [conversationId]: { ...current, agentId, agentName },
                },
              }
            },
            false,
            'convo/setAgent'
          ),

        setConversationResponding: (conversationId: string, isResponding: boolean) =>
          set(
            state => {
              const current = state.conversations[conversationId] || { messages: [], total: 0 }
              return {
                conversations: {
                  ...state.conversations,
                  [conversationId]: { ...current, isResponding },
                },
              }
            },
            false,
            'convo/setResponding'
          ),

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
