import React from 'react'
import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'
import type { MessageModel } from '@starships/protocol'

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
  // Optional reasoning fields streamed and/or persisted during assistant thinking
  reasoning?: string
  reasoningChunks?: UIStreamChunk[]
  // Optional grouped tool results for display convenience (derived in UI)
  toolResults?: any[]
}

interface ConversationData {
  messages: UIMessage[]
  total: number
  lastActivityAt?: string
  agentId?: string
  agentName?: string
  // Stream / turn state (UI derived, store-authoritative)
  isSending?: boolean
  isResponding?: boolean
  isAssistantStreaming?: boolean
  isAwaitingAssistant?: boolean
  // Internal: lightweight signature to prevent no-op updates causing render loops
  __sig?: string
}

interface StarshipUIState {
  // UI-only state
  activeStarshipId: string | null
  currentRoute: string

  // Conversations data (authoritative UI source)
  conversations: Record<string, ConversationData>

  // UI actions
  setActiveStarship: (id: string | null) => void
  navigateTo: (route: string) => void

  // Conversation data actions (UI-driven from TanStack and SSE)
  setConversationSnapshot: (conversationId: string, data: ConversationData) => void
  setConversationMeta: (conversationId: string, meta: Partial<ConversationData>) => void
  appendMessage: (conversationId: string, message: UIMessage) => void
  updateMessageAt: (conversationId: string, index: number, updater: Partial<UIMessage> | ((m: UIMessage) => UIMessage)) => void
  appendMessageChunk: (conversationId: string, index: number, chunk: UIStreamChunk) => void
  markMessageStreaming: (conversationId: string, index: number, isStreaming: boolean) => void
  clearConversation: (conversationId: string) => void
  setConversationAgent: (conversationId: string, agentId: string, agentName: string) => void
}

export const useStarshipUIStore = create<StarshipUIState>()(
  devtools(
    persist(
      set => ({
        // Initial state
        activeStarshipId: null,
        currentRoute: '/',
        conversations: {},

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
              const nextMessages = Array.isArray(data.messages) ? data.messages : []
              const nextTotal = typeof data.total === 'number' ? data.total : nextMessages.length
              const last: any = nextMessages.length > 0 ? nextMessages[nextMessages.length - 1] : null
              const lastId = last?.id != null ? String(last.id) : ''
              const lastUpdatedAt = String(last?.updatedAt || last?.createdAt || '')
              const lastStreaming = last?.role === 'assistant' ? (last as any)?.streaming === true : false
              // Include streaming progress so we re-render while assistant is streaming.
              // Without this, the snapshot can look "unchanged" (same id/updatedAt) even though
              // chunks are growing, which makes the UI only update at completion.
              const lastChunksLen = last?.role === 'assistant' && Array.isArray((last as any)?.chunks) ? Number((last as any).chunks.length) : 0
              const lastRChunksLen = last?.role === 'assistant' && Array.isArray((last as any)?.reasoningChunks) ? Number((last as any).reasoningChunks.length) : 0
              const lastChunkTs =
                lastChunksLen > 0 && last?.role === 'assistant'
                  ? String((last as any)?.chunks?.[lastChunksLen - 1]?.timestamp ?? '')
                  : ''
              const lastRChunkTs =
                lastRChunksLen > 0 && last?.role === 'assistant'
                  ? String((last as any)?.reasoningChunks?.[lastRChunksLen - 1]?.timestamp ?? '')
                  : ''
              const nextSig = [
                'v1',
                nextTotal,
                lastId,
                lastUpdatedAt,
                lastStreaming ? 1 : 0,
                lastChunksLen,
                lastChunkTs,
                lastRChunksLen,
                lastRChunkTs,
                data.isSending ? 1 : 0,
                data.isResponding ? 1 : 0,
                data.isAssistantStreaming ? 1 : 0,
                data.isAwaitingAssistant ? 1 : 0,
              ].join('|')

              // If nothing meaningful changed, return the SAME state object (no notifications).
              if (prev?.__sig === nextSig) return state

              return {
                conversations: {
                  ...state.conversations,
                  [conversationId]: {
                    // Preserve only allowed metadata
                    agentId: prev?.agentId,
                    agentName: prev?.agentName,
                    isSending: typeof data.isSending === 'boolean' ? data.isSending : prev?.isSending,
                    isResponding: typeof data.isResponding === 'boolean' ? data.isResponding : prev?.isResponding,
                    isAssistantStreaming: typeof data.isAssistantStreaming === 'boolean' ? data.isAssistantStreaming : prev?.isAssistantStreaming,
                    isAwaitingAssistant: typeof data.isAwaitingAssistant === 'boolean' ? data.isAwaitingAssistant : prev?.isAwaitingAssistant,
                    // Override with the latest snapshot fields
                    messages: nextMessages,
                    total: nextTotal,
                    lastActivityAt: data.lastActivityAt,
                    __sig: nextSig,
                  },
                },
              }
            },
            false,
            'convo/setSnapshot'
          ),

        setConversationMeta: (conversationId: string, meta: Partial<ConversationData>) =>
          set(
            state => {
              const current = state.conversations[conversationId] || { messages: [], total: 0 }
              // If meta is a no-op (common when multiple layers race), avoid notifying.
              const nextIsSending = typeof meta.isSending === 'boolean' ? meta.isSending : current.isSending
              const nextIsResponding = typeof meta.isResponding === 'boolean' ? meta.isResponding : current.isResponding
              const nextIsAssistantStreaming = typeof meta.isAssistantStreaming === 'boolean' ? meta.isAssistantStreaming : current.isAssistantStreaming
              const nextIsAwaitingAssistant = typeof meta.isAwaitingAssistant === 'boolean' ? meta.isAwaitingAssistant : current.isAwaitingAssistant
              const nextLastActivityAt = meta.lastActivityAt ?? current.lastActivityAt
              const noChange =
                nextIsSending === current.isSending &&
                nextIsResponding === current.isResponding &&
                nextIsAssistantStreaming === current.isAssistantStreaming &&
                nextIsAwaitingAssistant === current.isAwaitingAssistant &&
                nextLastActivityAt === current.lastActivityAt
              if (noChange) return state
              return {
                conversations: {
                  ...state.conversations,
                  [conversationId]: {
                    ...current,
                    ...meta,
                    // Protect invariants
                    messages: Array.isArray(meta.messages) ? (meta.messages as any) : current.messages,
                    total: typeof meta.total === 'number' ? meta.total : current.total,
                  },
                },
              }
            },
            false,
            'convo/setMeta'
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
