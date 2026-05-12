import api, { getCurrentToken } from '@/lib/api'
import type {
  ApiResponse,
  AgentModel,
  ConversationModel,
  ConversationState,
  ConversationStreamEvent,
  ConversationStreamSnapshot,
  TurnStatus as StreamTurnStatus,
  MessageModel,
  ToolCallApprovalModel,
} from '@starships/protocol'
import { experimental_streamedQuery as streamedQuery, useInfiniteQuery, useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useMemo, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { fetchEventSource, type EventSourceMessage } from '@microsoft/fetch-event-source'
import { USAGE_QUERY_KEYS } from '@/hooks/useUsage'
import { ROOM_QUERY_KEYS } from '@/hooks/useRooms'
import { getSafeErrorMessage } from '@/lib/error-utils'
import { addPendingAppendCallback, getLastAssistantMessageId, isAnimationComplete, removePendingAppendCallback } from './useMessageAnimationState'
import { useAuth } from '@/hooks/useAuth'

// Ensure only one live SSE stream exists per conversation.
// We observed duplicate assistant deltas when multiple streamedQuery instances ran concurrently
// (e.g. reload during pending tool approval, or cursor updates triggering a reconnect).
const activeSseGuards: Map<string, AbortController> = new Map()

// Import FetchResponse type
interface FetchResponse<T = any> {
  data: T
  status: number
  statusText: string
  headers: Headers
}

// Extended Message interface for client-side states
interface ClientMessage extends MessageModel {
  sending?: boolean
  streaming?: boolean
  error?: boolean
  chunks?: Array<{
    content: string
    position: number
    timestamp: number
  }>
  // Optional reasoning fields streamed and/or persisted
  reasoning?: string
  reasoningChunks?: Array<{
    content: string
    position: number
    timestamp: number
  }>
  // Flag indicating this message came from a snapshot and may have stale content
  fromSnapshot?: boolean
  // Derived/grouped tool results (not part of DB MessageModel)
  toolResults?: Array<{
    toolName?: string
    toolCallId?: string
    content?: string
    result?: unknown
  }>
  // UI actions captured from SSE (not part of DB MessageModel)
  uiActions?: Array<{
    action: string
    payload?: Record<string, unknown>
  }>
}

// Create message request interface (local definition since it's not in protocol)
interface CreateMessageRequest {
  role: 'user' | 'assistant' | 'system'
  content: string
  conversationId?: string
  agentId?: string
  starshipId?: string
  messageType?: 'user_input' | 'agent_response' | 'system_notification' | 'system_instruction' | 'workflow_output' | 'error'
  stream?: boolean
  attachmentIds?: string[]
  // OpenRouter image generation (optional)
  modalities?: Array<'image' | 'text'>
  imageConfig?: {
    aspect_ratio?: string
    [key: string]: any
  }
}

// Centralized query keys
export const CONVERSATION_QUERY_KEYS = {
  all: ['conversations'] as const,
  lists: () => [...CONVERSATION_QUERY_KEYS.all, 'list'] as const,
  byStarship: (starshipId: string) => [...CONVERSATION_QUERY_KEYS.all, 'starship', starshipId] as const,
  detail: (id: string) => [...CONVERSATION_QUERY_KEYS.all, 'detail', id] as const,
  children: (parentConversationId: string) => [...CONVERSATION_QUERY_KEYS.detail(parentConversationId), 'children'] as const,
  childrenPaged: (parentConversationId: string, limit?: number) => [...CONVERSATION_QUERY_KEYS.detail(parentConversationId), 'children', 'paged', String(limit ?? '')] as const,
  childrenPendingApprovals: (parentConversationId: string) => [...CONVERSATION_QUERY_KEYS.detail(parentConversationId), 'children', 'pending-approvals'] as const,
  messages: (conversationId: string) => [...CONVERSATION_QUERY_KEYS.detail(conversationId), 'messages'] as const,
  toolApprovalsPending: (conversationId: string) => [...CONVERSATION_QUERY_KEYS.detail(conversationId), 'tool-approvals', 'pending'] as const,
} as const

type ConversationMessagesResponseData = {
  conversationId: string
  messages: MessageModel[]
  total: number
  hasMoreBefore?: boolean
  oldestCursor?: { createdAt: string; id: string } | null
  participants?: string[]
  startedAt?: string
  lastActivityAt?: string
  agents?: AgentModel[]
  turnActive?: boolean
  lastCompleteAt?: string | null
}

export type PendingToolCallApproval = ToolCallApprovalModel & {
  toolSlug?: string
  toolName?: string
  agentName?: string
}

/**
 * Unified conversation hook - handles everything conversation-related
 * - Conversation details
 * - Messages (with real-time streaming)
 * - Send message (with streaming support)
 * - All TanStack Query benefits (caching, optimistic updates, etc.)
 */
// Additional conversation management hooks (kept from useConversations.ts)
export function useCreateConversation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: { title?: string; starshipId: string; agentSlug?: string; agentId?: string; parentConversationId?: string }): Promise<ConversationModel> => {
      const response: FetchResponse<ApiResponse<ConversationModel>> = await api.post('/api/v1/conversations', data)
      return response.data.data
    },
    onSuccess: (conversation, variables) => {
      // Invalidate starship conversations list
      if (variables.starshipId) {
        queryClient.invalidateQueries({
          queryKey: CONVERSATION_QUERY_KEYS.byStarship(variables.starshipId),
        })
      }
    },
    onError: (error: any) => {
      const errorMessage = getSafeErrorMessage(error)
      toast.error('Failed to create conversation', {
        description: errorMessage,
      })
    },
  })
}

export function useStarshipConversations(starshipId: string, enabled: boolean = true) {
  return useQuery({
    queryKey: CONVERSATION_QUERY_KEYS.byStarship(starshipId),
    queryFn: async (): Promise<{ conversations: Array<ConversationModel & { agents: AgentModel[] }> }> => {
      const response: FetchResponse<ApiResponse<Array<ConversationModel & { agents: AgentModel[] }>>> = await api.get(`/api/v1/starships/${starshipId}/conversations`)
      return { conversations: response.data.data }
    },
    enabled: !!starshipId && enabled,
    staleTime: process.env.NODE_ENV === 'development' ? 0 : 5 * 60 * 1000, // No cache in dev, 5 minutes in prod
    gcTime: process.env.NODE_ENV === 'development' ? 0 : 10 * 60 * 1000, // No cache in dev, 10 minutes in prod
  })
}

export function useChildConversations(parentConversationId: string | null, enabled: boolean = true) {
  return useQuery({
    queryKey: parentConversationId ? CONVERSATION_QUERY_KEYS.children(parentConversationId) : (['__noop__'] as const),
    enabled: Boolean(parentConversationId && enabled),
    queryFn: async (): Promise<Array<ConversationModel & { agents: AgentModel[] }>> => {
      const id = String(parentConversationId || '')
      if (!id) return []
      // Back-compat: older servers returned a raw array; newer servers return a paginated payload.
      const response: FetchResponse<ApiResponse<any>> = await api.get(`/api/v1/conversations/${id}/children`, { params: { limit: 200 } })
      const data = response.data.data
      if (Array.isArray(data)) return data || []
      const list = Array.isArray(data?.conversations) ? (data.conversations as Array<ConversationModel & { agents: AgentModel[] }>) : []
      return list
    },
    staleTime: process.env.NODE_ENV === 'development' ? 0 : 10_000,
    gcTime: process.env.NODE_ENV === 'development' ? 0 : 60_000,
    refetchOnWindowFocus: true,
  })
}

export function useChildConversationsPaged(
  parentConversationId: string | null,
  args?: { enabled?: boolean; limit?: number }
): {
  conversations: Array<ConversationModel & { agents: AgentModel[] }>
  total: number
  hasMoreBefore: boolean
  oldestCursor: { updatedAt: string; id: string } | null
  isLoading: boolean
  isFetching: boolean
  isError: boolean
  error: unknown
  isFetchingNextPage: boolean
  fetchNextPage: () => Promise<unknown>
  refetch: () => Promise<unknown>
} {
  const enabled = Boolean(parentConversationId && (args?.enabled ?? true))
  const limit = Math.max(1, Math.min(200, Number(args?.limit ?? 50)))

  type Cursor = { updatedAt: string; id: string }
  const toIso = (v: unknown): string => {
    if (v == null) return ''
    if (v instanceof Date) return v.toISOString()
    if (typeof v === 'number' && Number.isFinite(v)) return new Date(v).toISOString()
    if (typeof v === 'string') {
      const t = Date.parse(v)
      return Number.isFinite(t) ? new Date(t).toISOString() : v
    }
    try {
      const s = String(v)
      const t = Date.parse(s)
      return Number.isFinite(t) ? new Date(t).toISOString() : s
    } catch {
      return ''
    }
  }
  type Page = {
    parentConversationId: string
    conversations: Array<ConversationModel & { agents: AgentModel[] }>
    total: number
    hasMoreBefore: boolean
    oldestCursor: Cursor | null
  }

  const q = useInfiniteQuery<Page>({
    queryKey: parentConversationId ? CONVERSATION_QUERY_KEYS.childrenPaged(parentConversationId, limit) : (['__noop__'] as const),
    enabled,
    initialPageParam: null as Cursor | null,
    queryFn: async ({ pageParam }): Promise<Page> => {
      const id = String(parentConversationId || '')
      if (!id) return { parentConversationId: '', conversations: [], total: 0, hasMoreBefore: false, oldestCursor: null }

      const cursor = pageParam as Cursor | null
      const response: FetchResponse<ApiResponse<any>> = await api.get(`/api/v1/conversations/${id}/children`, {
        params: {
          limit,
          ...(cursor ? { beforeUpdatedAt: cursor.updatedAt, beforeId: cursor.id } : null),
        },
      })
      const data = response.data.data
      const conversations = Array.isArray(data?.conversations) ? (data.conversations as Array<ConversationModel & { agents: AgentModel[] }>) : []
      const totalRaw = (data as any)?.total
      const totalParsed = typeof totalRaw === 'number' ? totalRaw : typeof totalRaw === 'string' ? Number(totalRaw) : NaN
      const total = Number.isFinite(totalParsed) ? totalParsed : conversations.length
      const hasMoreBefore = Boolean(data?.hasMoreBefore)
      const oldestCursorRaw = data?.oldestCursor
      const oldestCursor =
        oldestCursorRaw && typeof oldestCursorRaw === 'object' && typeof oldestCursorRaw.updatedAt === 'string' && typeof oldestCursorRaw.id === 'string'
          ? ({ updatedAt: toIso(oldestCursorRaw.updatedAt), id: oldestCursorRaw.id } as Cursor)
          : null
      return { parentConversationId: id, conversations, total, hasMoreBefore, oldestCursor }
    },
    getNextPageParam: lastPage => {
      if (!lastPage?.hasMoreBefore) return undefined
      return lastPage.oldestCursor ?? undefined
    },
    staleTime: process.env.NODE_ENV === 'development' ? 0 : 10_000,
    gcTime: process.env.NODE_ENV === 'development' ? 0 : 60_000,
    refetchOnWindowFocus: true,
  })

  const pages = Array.isArray(q.data?.pages) ? q.data!.pages : []
  const conversations = pages.flatMap(p => (Array.isArray(p?.conversations) ? p.conversations : []))
  const lastPage = pages.length > 0 ? pages[pages.length - 1] : null
  const total = pages.length > 0 ? Number((pages[0] as any)?.total ?? conversations.length) : conversations.length

  return {
    conversations,
    total: Number.isFinite(total) ? total : conversations.length,
    hasMoreBefore: Boolean(lastPage?.hasMoreBefore),
    oldestCursor: (lastPage?.oldestCursor as Cursor | null) ?? null,
    isLoading: q.isLoading,
    isFetching: q.fetchStatus === 'fetching',
    isError: q.isError,
    error: q.error,
    isFetchingNextPage: q.isFetchingNextPage,
    fetchNextPage: () => q.fetchNextPage(),
    refetch: () => q.refetch(),
  }
}

export function useChildConversationsPendingApprovals(
  parentConversationId: string | null,
  args?: { enabled?: boolean; limit?: number }
): {
  children: Array<{ id: string; updatedAt: string; pendingCount: number; agentName: string }>
  hasMoreBefore: boolean
  oldestCursor: { updatedAt: string; id: string } | null
  isLoading: boolean
  isFetching: boolean
  refetch: () => Promise<unknown>
} {
  const enabled = Boolean(parentConversationId && (args?.enabled ?? true))
  const limit = Math.max(1, Math.min(200, Number(args?.limit ?? 10)))

  type Cursor = { updatedAt: string; id: string }
  type Payload = {
    parentConversationId: string
    children: Array<{ id: string; updatedAt: string; pendingCount: number; agentName: string }>
    hasMoreBefore: boolean
    oldestCursor: Cursor | null
  }

  const q = useQuery({
    queryKey: parentConversationId ? CONVERSATION_QUERY_KEYS.childrenPendingApprovals(parentConversationId) : (['__noop__'] as const),
    enabled,
    queryFn: async (): Promise<Payload> => {
      const id = String(parentConversationId || '')
      if (!id) return { parentConversationId: '', children: [], hasMoreBefore: false, oldestCursor: null }
      const response: FetchResponse<ApiResponse<any>> = await api.get(`/api/v1/conversations/${id}/children/pending-approvals`, { params: { limit } })
      const data = response.data.data
      const children = Array.isArray(data?.children) ? (data.children as Payload['children']) : []
      const hasMoreBefore = Boolean(data?.hasMoreBefore)
      const oldestCursorRaw = data?.oldestCursor
      const oldestCursor =
        oldestCursorRaw && typeof oldestCursorRaw === 'object' && typeof oldestCursorRaw.updatedAt === 'string' && typeof oldestCursorRaw.id === 'string'
          ? ({ updatedAt: oldestCursorRaw.updatedAt, id: oldestCursorRaw.id } as Cursor)
          : null
      return { parentConversationId: id, children, hasMoreBefore, oldestCursor }
    },
    staleTime: process.env.NODE_ENV === 'development' ? 0 : 5_000,
    gcTime: process.env.NODE_ENV === 'development' ? 0 : 60_000,
    refetchOnWindowFocus: true,
  })

  const payload = q.data as any as Payload | undefined
  return {
    children: Array.isArray(payload?.children) ? payload!.children : [],
    hasMoreBefore: Boolean(payload?.hasMoreBefore),
    oldestCursor: (payload?.oldestCursor as any) ?? null,
    isLoading: q.isLoading,
    isFetching: q.fetchStatus === 'fetching',
    refetch: () => q.refetch(),
  }
}

/**
 * Pending ask-first tool approvals for a conversation.
 *
 * Required for refresh/deeplinks: approvals are persisted in DB and are not replayed via SSE.
 */
export function usePendingToolApprovals(conversationId: string | null, enabled: boolean = true) {
  return useQuery({
    queryKey: conversationId ? CONVERSATION_QUERY_KEYS.toolApprovalsPending(conversationId) : (['__noop__'] as const),
    enabled: Boolean(conversationId && enabled),
    queryFn: async (): Promise<PendingToolCallApproval[]> => {
      const id = String(conversationId || '')
      if (!id) return []
      const response: FetchResponse<ApiResponse<PendingToolCallApproval[]>> = await api.get(`/api/v1/conversations/${id}/tool-approvals/pending`)
      return response.data.data || []
    },
    staleTime: process.env.NODE_ENV === 'development' ? 0 : 5_000, // No cache in dev
    gcTime: process.env.NODE_ENV === 'development' ? 0 : 60_000, // No cache in dev
    refetchOnWindowFocus: true,
  })
}

/**
 * Pending ask-first tool approvals for multiple conversations (e.g. child conversations).
 *
 * Returns a stable map keyed by conversationId.
 */
export function usePendingToolApprovalsMulti(conversationIds: string[], enabled: boolean = true) {
  const ids = Array.isArray(conversationIds) ? conversationIds.filter(Boolean).map(String) : []
  // Normalize + stabilize ids to avoid churn (and extra network calls) if the caller provides
  // the same set in a different order across renders.
  const uniqueIds = useMemo(() => Array.from(new Set(ids)).sort(), [ids.join('|')])

  const results = useQueries({
    queries: uniqueIds.map(conversationId => ({
      queryKey: CONVERSATION_QUERY_KEYS.toolApprovalsPending(conversationId),
      enabled: Boolean(enabled && conversationId),
      queryFn: async (): Promise<PendingToolCallApproval[]> => {
        const response: FetchResponse<ApiResponse<PendingToolCallApproval[]>> = await api.get(`/api/v1/conversations/${conversationId}/tool-approvals/pending`)
        return response.data.data || []
      },
      staleTime: process.env.NODE_ENV === 'development' ? 0 : 5_000,
      gcTime: process.env.NODE_ENV === 'development' ? 0 : 60_000,
      refetchOnWindowFocus: true,
      // Keep parent UI in sync with child approvals without requiring reload.
      // Child conversations publish tool-approval UI actions on their own stream, not the parent’s.
      // So the parent must poll these lightweight endpoints while it’s open.
      //
      // IMPORTANT:
      // This endpoint is cheap, but polling per-child-conversation every 2s scales poorly
      // and looks like a runaway loop in the network panel. Prefer a slower cadence and
      // never poll in the background.
      refetchInterval: enabled ? 15_000 : (false as const),
      refetchIntervalInBackground: false,
    })),
  })

  const byConversationId = useMemo(() => {
    const map: Record<string, PendingToolCallApproval[]> = {}
    uniqueIds.forEach((id, idx) => {
      map[id] = (results[idx]?.data as PendingToolCallApproval[] | undefined) || []
    })
    return map
  }, [results, uniqueIds.join('|')])

  const isLoading = results.some(r => r.isLoading)
  const isFetching = results.some(r => r.fetchStatus === 'fetching')
  const isError = results.some(r => r.isError)

  return { byConversationId, isLoading, isFetching, isError }
}

// Delete conversation
export function useDeleteConversation() {
  const queryClient = useQueryClient()
  const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

  return useMutation({
    mutationFn: async (conversationId: string) => {
      const response: FetchResponse<ApiResponse<any>> = await api.delete(`/api/v1/conversations/${conversationId}`)
      return response.data.data
    },
    onMutate: async conversationId => {
      // Get conversation details to know which starship it belongs to
      const conversationData = queryClient.getQueryData(CONVERSATION_QUERY_KEYS.detail(conversationId))
      const convo = isRecord(conversationData) ? conversationData['conversation'] : undefined
      let starshipId = isRecord(convo) && typeof convo['starshipId'] === 'string' ? convo['starshipId'] : undefined

      // If starshipId is not available from cached conversation, try to find it from starship conversations cache
      if (!starshipId) {
        const allQueryData = queryClient.getQueriesData({ queryKey: CONVERSATION_QUERY_KEYS.all })
        for (const [queryKey, data] of allQueryData) {
          const key = queryKey as string[]
          if (key.includes('starship') && data && typeof data === 'object' && 'conversations' in data) {
            const conversations = (data as { conversations: ConversationModel[] }).conversations
            const foundConversation = conversations.find((conv: ConversationModel) => conv.id === conversationId)
            if (foundConversation) {
              // Extract starshipId from the query key since it's part of CONVERSATION_QUERY_KEYS.byStarship(starshipId)
              const starshipIndex = key.indexOf('starship')
              if (starshipIndex !== -1 && starshipIndex + 1 < key.length) {
                starshipId = key[starshipIndex + 1]
              }
              break
            }
          }
        }
      }

      // Cancel any outgoing refetches
      if (starshipId) {
        await queryClient.cancelQueries({ queryKey: CONVERSATION_QUERY_KEYS.byStarship(starshipId) })
      }

      // Snapshot the previous conversations
      const previousConversations = starshipId ? queryClient.getQueryData(CONVERSATION_QUERY_KEYS.byStarship(starshipId)) : null

      // Optimistically remove the conversation
      if (starshipId) {
        queryClient.setQueryData(CONVERSATION_QUERY_KEYS.byStarship(starshipId), (old: { conversations: ConversationModel[] } | undefined) => {
          if (!old) return old
          return {
            ...old,
            conversations: old.conversations.filter((conversation: ConversationModel) => conversation.id !== conversationId),
          }
        })
      }

      return { previousConversations, conversationId, starshipId }
    },
    onError: (error: any, conversationId, context) => {
      // Rollback the optimistic update
      if (context?.previousConversations && context.starshipId) {
        queryClient.setQueryData(CONVERSATION_QUERY_KEYS.byStarship(context.starshipId), context.previousConversations)
      }

      // SIMPLE FIX: Use simple error sanitization
      const errorMessage = getSafeErrorMessage(error)

      toast.error('Failed to delete conversation', {
        description: errorMessage,
      })
    },
    onSuccess: (data, conversationId, context) => {
      // Remove the conversation from all caches
      queryClient.removeQueries({ queryKey: CONVERSATION_QUERY_KEYS.detail(conversationId) })
      queryClient.removeQueries({ queryKey: CONVERSATION_QUERY_KEYS.messages(conversationId) })

      toast.success('Conversation deleted successfully!')
    },
    onSettled: (data, error, conversationId, context) => {
      // Always refetch to ensure consistency - use both starshipId from context and current starship
      if (context?.starshipId) {
        queryClient.invalidateQueries({
          queryKey: CONVERSATION_QUERY_KEYS.byStarship(context.starshipId),
        })
      }

      // Also invalidate all starship conversation queries as a fallback
      // This ensures UI updates even if starshipId detection failed
      queryClient.invalidateQueries({
        queryKey: CONVERSATION_QUERY_KEYS.all,
        predicate: query => {
          const key = query.queryKey as string[]
          return key.includes('starship') && key.includes('list')
        },
      })
    },
  })
}

// Delete message
export function useDeleteMessage() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (messageId: string) => {
      const response: FetchResponse<ApiResponse<any>> = await api.delete(`/api/v1/messages/${messageId}`)
      return response.data.data
    },
    onMutate: async messageId => {
      // Since MessageModel no longer has conversationId, we need to find it from the messages cache
      // This is not ideal but necessary with the current simplified model
      return { messageId }
    },
    onSuccess: (data, messageId, context) => {
      // Invalidate all message queries to ensure consistency
      // This is less efficient but necessary without conversationId on messages
      queryClient.invalidateQueries({
        queryKey: CONVERSATION_QUERY_KEYS.all,
      })
      toast.success('Message deleted successfully!')
    },
    onError: (error: any, messageId, context) => {
      // Invalidate all message queries to ensure consistency
      queryClient.invalidateQueries({
        queryKey: CONVERSATION_QUERY_KEYS.all,
      })

      const errorMessage = getSafeErrorMessage(error)
      toast.error('Failed to delete message', {
        description: errorMessage,
      })
    },
  })
}

// Update message
export function useUpdateMessage() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ messageId, content }: { messageId: string; content: string }) => {
      const response: FetchResponse<ApiResponse<any>> = await api.put(`/api/v1/messages/${messageId}`, { content })
      return response.data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: CONVERSATION_QUERY_KEYS.all,
      })
      toast.success('Message updated successfully!')
    },
    onError: (error: any) => {
      const errorMessage = getSafeErrorMessage(error)
      toast.error('Failed to update message', {
        description: errorMessage,
      })
    },
  })
}

// Link a message to a child conversation (used for channel "threads")
export function useLinkMessageToConversation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (args: { messageId: string; linkedConversationId: string; conversationId?: string }) => {
      const response: FetchResponse<ApiResponse<any>> = await api.put(`/api/v1/messages/${args.messageId}`, {
        linkedConversationId: args.linkedConversationId,
      })
      return response.data.data
    },
    onSuccess: (_data, variables) => {
      const conversationId = typeof variables.conversationId === 'string' ? variables.conversationId : ''
      const messageId = String(variables.messageId || '').trim()
      const linkedConversationId = String(variables.linkedConversationId || '').trim()

      // IMPORTANT:
      // The channel timeline is primarily updated via SSE append events and does not emit "message updated"
      // events when we mutate linkedConversationId. So we patch the local stream cache to reflect the
      // new link immediately, ensuring the UI shows the correct "Open thread" icon for *all* messages.
      if (conversationId && messageId && linkedConversationId) {
        queryClient.setQueryData(CONVERSATION_QUERY_KEYS.messages(conversationId), (old: any) => {
          const chunks = Array.isArray(old) ? old : []
          return chunks.map((chunk: any) => {
            if (!chunk || typeof chunk !== 'object') return chunk

            // Back-compat local pre-seed event
            if (chunk.type === 'append' && chunk.message && chunk.message.id === messageId) {
              return { ...chunk, message: { ...chunk.message, linkedConversationId } }
            }

            // Snapshot event
            if (chunk.type === 'snapshot' && chunk.data && Array.isArray(chunk.data.messages)) {
              const nextMsgs = chunk.data.messages.map((m: any) => (m && m.id === messageId ? { ...m, linkedConversationId } : m))
              return { ...chunk, data: { ...chunk.data, messages: nextMsgs } }
            }

            // Standard append event
            if (chunk.type === 'message.append' && chunk.data && chunk.data.message && chunk.data.message.id === messageId) {
              return { ...chunk, data: { ...chunk.data, message: { ...chunk.data.message, linkedConversationId } } }
            }

            return chunk
          })
        })
      }

      if (conversationId) {
        queryClient.invalidateQueries({ queryKey: CONVERSATION_QUERY_KEYS.messages(conversationId) })
      } else {
        // Fallback: invalidate broadly (MessageModel may not always include conversationId in caches)
        queryClient.invalidateQueries({ queryKey: CONVERSATION_QUERY_KEYS.all })
      }
    },
    onError: (error: any) => {
      const errorMessage = getSafeErrorMessage(error)
      toast.error('Failed to create thread', { description: errorMessage })
    },
  })
}

// Toggle a reaction on a message (optimistic stream-cache patch)
export function useToggleMessageReaction() {
  const queryClient = useQueryClient()
  const { userId: authUserId } = useAuth()
  const userId = typeof authUserId === 'string' ? authUserId : ''

  type ReactionsMap = Record<string, string[]>
  type ToggleMessageReactionArgs = { conversationId: string; messageId: string; emoji: string }
  type ToggleMessageReactionResponse = { messageId: string; reactions: ReactionsMap }
  type ToggleMessageReactionContext = { conversationId: string; key: readonly unknown[]; prev: unknown }

  const normalizeReactions = (input: unknown): ReactionsMap => {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return {}
    const out: ReactionsMap = {}
    for (const [emoji, ids] of Object.entries(input as Record<string, unknown>)) {
      if (!emoji) continue
      if (!Array.isArray(ids)) continue
      out[String(emoji)] = ids.map(x => String(x)).filter(Boolean)
    }
    return out
  }

  const toggleLocal = (reactions: ReactionsMap, emoji: string): ReactionsMap => {
    if (!userId) return reactions
    const prev = Array.isArray(reactions[emoji]) ? reactions[emoji] : []
    const has = prev.includes(userId)
    const nextUsers = has ? prev.filter(x => x !== userId) : [...prev, userId]
    const next = { ...reactions }
    if (nextUsers.length === 0) delete next[emoji]
    else next[emoji] = nextUsers
    return next
  }

  const patchChunksWithReactions = (old: unknown, args: { messageId: string; reactions: ReactionsMap }) => {
    if (!Array.isArray(old)) return old
    const { messageId, reactions } = args
    return old.map((chunk: any) => {
      if (!chunk || typeof chunk !== 'object') return chunk

      // Back-compat local pre-seed event
      if (chunk.type === 'append' && chunk.message && chunk.message.id === messageId) {
        return { ...chunk, message: { ...chunk.message, reactions } }
      }

      // Snapshot event
      if (chunk.type === 'snapshot' && chunk.data && Array.isArray(chunk.data.messages)) {
        const nextMsgs = chunk.data.messages.map((m: any) => (m && m.id === messageId ? { ...m, reactions } : m))
        return { ...chunk, data: { ...chunk.data, messages: nextMsgs } }
      }

      // Standard append event
      if (chunk.type === 'message.append' && chunk.data && chunk.data.message && chunk.data.message.id === messageId) {
        return { ...chunk, data: { ...chunk.data, message: { ...chunk.data.message, reactions } } }
      }

      return chunk
    })
  }

  const appendReactionsChunk = (old: unknown, args: { conversationId: string; messageId: string; reactions: ReactionsMap }) => {
    const base = Array.isArray(old) ? old : []
    const nextChunk: { type: 'message.reactions'; data: { conversationId: string; messageId: string; reactions: ReactionsMap } } = {
      type: 'message.reactions',
      data: { conversationId: args.conversationId, messageId: args.messageId, reactions: args.reactions },
    }
    // Avoid unbounded duplicates when the last chunk is already the same update.
    try {
      const last = base.length > 0 ? (base[base.length - 1] as any) : null
      if (last?.type === 'message.reactions' && last?.data?.messageId === args.messageId) {
        const lastReactions = last?.data?.reactions
        // Cheap structural compare: if keys+stringified values match, skip.
        const a = typeof lastReactions === 'object' && lastReactions ? JSON.stringify(lastReactions) : ''
        const b = JSON.stringify(args.reactions || {})
        if (a === b) {
          return base
        }
      }
    } catch {
      /* ignore */
    }
    return [...base, nextChunk]
  }

  const findCurrentReactions = (chunks: unknown[], messageId: string): ReactionsMap => {
    for (let i = chunks.length - 1; i >= 0; i--) {
      const chunk: any = chunks[i] as any
      if (!chunk || typeof chunk !== 'object') continue

      // Stream reactions event (including synthetic optimistic chunks).
      if (chunk.type === 'message.reactions') {
        const mid = chunk?.data?.messageId
        if (typeof mid === 'string' && mid === messageId) {
          return normalizeReactions(chunk?.data?.reactions)
        }
      }

      if (chunk.type === 'message.append' && chunk.data?.message?.id === messageId) return normalizeReactions(chunk.data.message.reactions)
      if (chunk.type === 'append' && chunk.message?.id === messageId) return normalizeReactions(chunk.message.reactions)
      if (chunk.type === 'snapshot' && chunk.data && Array.isArray(chunk.data.messages)) {
        const m = chunk.data.messages.find((x: any) => x && x.id === messageId)
        if (m) return normalizeReactions(m.reactions)
      }
    }
    return {}
  }

  return useMutation<ToggleMessageReactionResponse, unknown, ToggleMessageReactionArgs, ToggleMessageReactionContext>({
    mutationFn: async (args: ToggleMessageReactionArgs) => {
      const emoji = String(args.emoji || '').trim()
      const response: FetchResponse<ApiResponse<ToggleMessageReactionResponse>> = await api.post(`/api/v1/messages/${encodeURIComponent(args.messageId)}/reactions`, { emoji })
      return response.data.data as ToggleMessageReactionResponse
    },
    onMutate: async (args: ToggleMessageReactionArgs): Promise<ToggleMessageReactionContext | undefined> => {
      const conversationId = String(args.conversationId || '').trim()
      const messageId = String(args.messageId || '').trim()
      const emoji = String(args.emoji || '').trim()
      if (!conversationId || !messageId || !emoji || !userId) return undefined

      const key = CONVERSATION_QUERY_KEYS.messages(conversationId)
      const prev = queryClient.getQueryData(key)

      queryClient.setQueryData(key, (old: any) => {
        const chunks = Array.isArray(old) ? old : []
        const current = findCurrentReactions(chunks, messageId)
        const next = toggleLocal(current, emoji)
        // IMPORTANT:
        // Append a synthetic stream event so `chunksRevisionKey` changes and the UI re-reduces immediately.
        // Mutating nested fields inside existing chunks can be missed by memoization keyed to length/last-chunk.
        return appendReactionsChunk(old, { conversationId, messageId, reactions: next })
      })

      return { conversationId, key, prev }
    },
    onError: (error: unknown, _vars, ctx) => {
      if (ctx?.key) {
        // Never restore `undefined` into the messages query cache; React Query warns on undefined data.
        // If we didn't have prior data, fall back to an empty chunk list.
        queryClient.setQueryData(ctx.key, (ctx.prev as any) ?? [])
      }
      const errorMessage = getSafeErrorMessage(error)
      toast.error('Failed to add reaction', { description: errorMessage })
    },
    onSuccess: (data, vars) => {
      const conversationId = String(vars.conversationId || '').trim()
      const messageId = typeof data?.messageId === 'string' ? String(data.messageId).trim() : String(vars.messageId || '').trim()
      const reactions = normalizeReactions(data?.reactions)
      if (!conversationId || !messageId) return

      queryClient.setQueryData(CONVERSATION_QUERY_KEYS.messages(conversationId), (old: any) => appendReactionsChunk(old, { conversationId, messageId, reactions }))
    },
  })
}

// Get conversation agents (for agent restoration on refresh)
export function useConversationAgents(conversationId: string | null) {
  return useQuery({
    queryKey: [...CONVERSATION_QUERY_KEYS.messages(conversationId!), 'agents'],
    queryFn: async (): Promise<AgentModel[]> => {
      const response: FetchResponse<ApiResponse<{ conversationId: string; agents: AgentModel[] }>> = await api.get(
        `/api/v1/conversations/${conversationId}/agents`
      )
      return response.data.data?.agents || []
    },
    enabled: !!conversationId,
    staleTime: process.env.NODE_ENV === 'development' ? 0 : 5 * 60 * 1000, // No cache in dev, 5 minutes in prod
    gcTime: process.env.NODE_ENV === 'development' ? 0 : 10 * 60 * 1000, // No cache in dev, 10 minutes in prod
  })
}

// Update conversation status
export function useUpdateConversationStatus() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: { conversationId: string; status: 'active' | 'paused' | 'completed' | 'archived' }) => {
      const response: FetchResponse<ApiResponse<ConversationModel>> = await api.patch(`/api/v1/conversations/${data.conversationId}/status`, {
        status: data.status,
      })
      return response.data.data
    },
    onSuccess: (updatedConversation, variables) => {
      // Update the conversation in cache
      queryClient.setQueryData(CONVERSATION_QUERY_KEYS.detail(variables.conversationId), (old: any) => {
        if (!old) return old
        return {
          ...old,
          conversation: updatedConversation,
        }
      })

      // Invalidate related queries to ensure consistency
      queryClient.invalidateQueries({ queryKey: CONVERSATION_QUERY_KEYS.detail(variables.conversationId) })

      toast.success(`Conversation ${variables.status} successfully!`)
    },
    onError: (error: any) => {
      const errorMessage = getSafeErrorMessage(error)
      toast.error('Failed to update status', {
        description: errorMessage,
      })
    },
  })
}

// Get conversation detail (including state)
export function useConversationDetail(
  conversationId: string | null,
  options?: {
    enabled?: boolean
    staleTime?: number
    refetchOnWindowFocus?: boolean
    refetchInterval?: number | false | ((data: ConversationModel | undefined) => number | false)
    refetchIntervalInBackground?: boolean
  }
) {
  const enabled = Boolean(conversationId && (options?.enabled ?? true))
  return useQuery({
    queryKey: conversationId ? CONVERSATION_QUERY_KEYS.detail(conversationId) : (['__noop__'] as const),
    queryFn: async (): Promise<ConversationModel> => {
      const response: FetchResponse<ApiResponse<ConversationModel>> = await api.get(`/api/v1/conversations/${conversationId}`)
      return response.data.data
    },
    enabled,
    staleTime: options?.staleTime ?? (process.env.NODE_ENV === 'development' ? 0 : 30 * 1000), // No cache in dev, 30 seconds in prod
    ...(typeof options?.refetchOnWindowFocus === 'boolean' ? { refetchOnWindowFocus: options.refetchOnWindowFocus } : null),
    ...(options?.refetchInterval != null ? { refetchInterval: options.refetchInterval as any } : null),
    ...(typeof options?.refetchIntervalInBackground === 'boolean' ? { refetchIntervalInBackground: options.refetchIntervalInBackground } : null),
  })
}

// Update conversation state (plugins, etc.)
export function useUpdateConversationState() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ conversationId, state }: { conversationId: string; state: Partial<ConversationState> | Record<string, unknown> }) => {
      const response: FetchResponse<ApiResponse<ConversationModel>> = await api.patch(`/api/v1/conversations/${conversationId}`, { state })
      return response.data.data
    },
    // Optimistic update
    onMutate: async ({ conversationId, state }) => {
      await queryClient.cancelQueries({
        queryKey: CONVERSATION_QUERY_KEYS.detail(conversationId),
      })

      const previousConversation = queryClient.getQueryData<ConversationModel>(CONVERSATION_QUERY_KEYS.detail(conversationId))

      // Optimistically update
      if (previousConversation) {
        queryClient.setQueryData(CONVERSATION_QUERY_KEYS.detail(conversationId), {
          ...previousConversation,
          state: {
            ...previousConversation.state,
            ...state,
          },
        })
      }

      return { previousConversation }
    },
    // Rollback on error
    onError: (error, variables, context) => {
      if (context?.previousConversation) {
        queryClient.setQueryData(CONVERSATION_QUERY_KEYS.detail(variables.conversationId), context.previousConversation)
      }
      const errorMessage = getSafeErrorMessage(error)
      toast.error('Failed to update conversation state', {
        description: errorMessage,
      })
    },
    // Invalidate to refetch from server
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: CONVERSATION_QUERY_KEYS.detail(variables.conversationId),
      })
    },
  })
}

// Update conversation details
export function useUpdateConversation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: { conversationId: string; title?: string }) => {
      const response: FetchResponse<ApiResponse<ConversationModel>> = await api.patch(`/api/v1/conversations/${data.conversationId}`, {
        title: data.title,
      })
      return response.data.data
    },
    onSuccess: (updatedConversation, variables) => {
      // Update the conversation in detail cache
      queryClient.setQueryData(CONVERSATION_QUERY_KEYS.detail(variables.conversationId), (old: any) => {
        if (!old) return old
        return {
          ...old,
          conversation: updatedConversation,
        }
      })

      // Update conversation in all starship conversation lists directly
      queryClient.setQueriesData({ queryKey: CONVERSATION_QUERY_KEYS.all }, (oldData: any) => {
        if (!oldData || !oldData.conversations) return oldData

        return {
          ...oldData,
          conversations: oldData.conversations.map((conv: any) =>
            conv.id === variables.conversationId ? { ...conv, title: updatedConversation.title, updatedAt: updatedConversation.updatedAt } : conv
          ),
        }
      })

      toast.success('Conversation renamed successfully!')
    },
    onError: (error: any) => {
      const errorMessage = getSafeErrorMessage(error)
      toast.error('Failed to rename conversation', {
        description: errorMessage,
      })
    },
  })
}

// Stop an in-flight streamed conversation turn across layers
export function useConversationStop() {
  const queryClient = useQueryClient()

  return useCallback(
    async (conversationId: string) => {
      if (!conversationId) return
      try {
        // Abort SSE locally
        await queryClient.cancelQueries({ queryKey: CONVERSATION_QUERY_KEYS.messages(conversationId) })
      } catch {}

      // Optimistically finalize UI immediately (query-cache only; no local component state)
      try {
        queryClient.setQueryData(CONVERSATION_QUERY_KEYS.messages(conversationId), (old: any[] | undefined) => {
          const chunks = Array.isArray(old) ? old.slice() : []
          // Conform to the stream contract: `turn.status` MUST use `data`, not `payload`.
          // We best-effort infer the latest known turnId from existing chunks.
          let inferredTurnId: string | undefined
          for (let i = chunks.length - 1; i >= 0; i--) {
            const c: any = chunks[i]
            if (c?.type === 'turn.status' && c?.data?.turnId) {
              inferredTurnId = String(c.data.turnId)
              break
            }
            if (c?.type === 'turn.started' && c?.data?.turnId) {
              inferredTurnId = String(c.data.turnId)
              break
            }
            if (c?.type === 'snapshot' && c?.data?.turn?.turnId) {
              inferredTurnId = String(c.data.turn.turnId)
              break
            }
          }

          chunks.push({
            type: 'turn.status',
            data: {
              conversationId,
              turnId: inferredTurnId ?? 'local',
              status: 'cancelled',
              at: new Date().toISOString(),
            },
          })
          return chunks
        })
      } catch {}

      try {
        // Signal server to persist partials and cancel autopilot
        await api.post(`/api/v1/conversations/${conversationId}/stop`)
      } catch (error: any) {
        const msg = getSafeErrorMessage(error)
        toast.error('Failed to stop response', { description: msg })
        return
      }

      // Force next attach to start from snapshot (safe, cross-pod)
      try {
        if (typeof window !== 'undefined') window.localStorage.removeItem(`conv:${conversationId}:cursor`)
      } catch {}
    },
    [queryClient]
  )
}

export function useConversationStreamed(conversationId: string | null, starshipId?: string | null, options?: { enabled?: boolean }) {
  const queryClient = useQueryClient()
  const enabledFlag = options?.enabled !== false
  const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null
  const lastSseOpenAtRef = useRef<number | null>(null)
  const lastSseErrorAtRef = useRef<number | null>(null)
  const lastChunksRevisionKeyLoggedRef = useRef<string | null>(null)
  const [appendGateRevision, setAppendGateRevision] = useState(0)

  const makeAbortedIterable = (convId: string, reason: string): AsyncIterable<StreamedChunk> => {
    const at = new Date().toISOString()
    // Yield a minimal snapshot so TanStack Query never treats the query result as undefined.
    // This handles mid-flight aborts where the SSE iterable would otherwise yield 0 chunks.
    return (async function* () {
      yield {
        type: 'snapshot',
        data: {
          conversationId: convId,
          messages: [],
          turn: { turnId: 'aborted', status: 'completed' },
          at,
        },
      } as any
    })()
  }

  type AwaitRequested = {
    at: string
    nodeRef: string
    kind: 'connector_event'
    spec: Record<string, unknown>
  }

  type TurnState = {
    turnId: string | null
    status: StreamTurnStatus | null
    agentId?: string | null
    agentName?: string | null
    awaitRequested?: AwaitRequested | null
  }
  type TurnUsage = {
    turnId: string
    at: string
    agentId?: string
    agentName?: string
    model?: string
    usage: { promptTokens: number; completionTokens: number; totalTokens: number; cost?: number }
  }

  type LegacyChunk = { type: 'append'; message: ClientMessage } | { type: 'turn_started'; payload?: { local?: boolean } }
  type StreamErrorChunk = { type: 'error'; error: unknown }
  // NOTE: Some client deployments may lag protocol type generation; allow await_requested explicitly.
  type StreamEventType = ConversationStreamEvent['type'] | 'await_requested'
  type StreamedChunk = { type: StreamEventType; data: any } | LegacyChunk | StreamErrorChunk

  // Bridge fetch-event-source SSE into an AsyncIterable that yields StreamedChunk events.
  // IMPORTANT: This function does not use React local state; the entire event log lives in TanStack Query cache.
  function makeSSEAsyncIterable(convId: string, token: string | null, signal?: AbortSignal): AsyncIterable<StreamedChunk> {
    const cursorKey = `conv:${convId}:cursor`
    const cursor = typeof window !== 'undefined' ? window.localStorage.getItem(cursorKey) : null
    const url = `/api/v1/conversations/${convId}/messages?stream=true${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`

    let closed = false
    const controller = new AbortController()
    const instanceController = new AbortController()
    try {
      const prev = activeSseGuards.get(convId)
      if (prev) {
        prev.abort()
      }
    } catch {}
    activeSseGuards.set(convId, instanceController)
    const timeoutId = setTimeout(() => controller.abort(), 5 * 60 * 1000)
    const combinedSignal = signal ? AbortSignal.any([signal, controller.signal, instanceController.signal]) : AbortSignal.any([controller.signal, instanceController.signal])
    const isActiveInstance = () => activeSseGuards.get(convId) === instanceController

    type Resolver = (value: IteratorResult<StreamedChunk>) => void
    const queue: StreamedChunk[] = []
    const resolvers: Resolver[] = []
    let pushedCount = 0

    const push = (item: StreamedChunk) => {
      if (closed) return
      pushedCount++
      if (resolvers.length > 0) {
        const resolve = resolvers.shift()!
        resolve({ value: item, done: false })
      } else {
        queue.push(item)
      }
    }

    const cleanup = (reason: 'onclose' | 'onerror' | 'bad_status' | 'manual' = 'manual') => {
      if (closed) return
      // If we are being manually aborted before any chunks were ever emitted,
      // inject a minimal snapshot so the streamed query never resolves to undefined.
      // This avoids the TanStack Query warning: "Query data cannot be undefined" for messages streams.
      if (reason === 'manual' && pushedCount === 0) {
        const at = new Date().toISOString()
        const synthetic: StreamedChunk = {
          type: 'snapshot',
          data: {
            conversationId: convId,
            messages: [],
            turn: { turnId: 'aborted', status: 'completed' },
            at,
            __synthetic: true,
          },
        } as any
        pushedCount++
        if (resolvers.length > 0) {
          const resolve = resolvers.shift()!
          resolve({ value: synthetic, done: false })
        } else {
          queue.push(synthetic)
        }
      }

      closed = true

      clearTimeout(timeoutId)
      controller.abort()
      instanceController.abort()
      try {
        if (activeSseGuards.get(convId) === instanceController) activeSseGuards.delete(convId)
      } catch {}
      while (resolvers.length > 0) {
        const resolve = resolvers.shift()!
        resolve({ value: undefined, done: true })
      }
      queue.length = 0
    }

    // If this instance is aborted (e.g. superseded by a newer stream), force cleanup so any
    // late events from the old fetchEventSource are ignored.
    try {
      instanceController.signal.addEventListener('abort', () => cleanup('manual'), { once: true })
    } catch {}

    try {
      fetchEventSource(url, {
        method: 'GET',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        openWhenHidden: true,
        signal: combinedSignal,
        async onopen(response) {
          if (!isActiveInstance()) {
            return
          }
          lastSseOpenAtRef.current = Date.now()
          if (!response.ok) {
            push({ type: 'error', error: { status: response.status, statusText: response.statusText } })
            cleanup('bad_status')
          }
        },
        onmessage(ev: EventSourceMessage) {
          if (!isActiveInstance()) {
            return
          }
          try {
            if (typeof ev.id === 'string' && ev.id) {
              try {
                if (typeof window !== 'undefined') window.localStorage.setItem(cursorKey, ev.id)
              } catch {}
            }

            const eventType = String(ev.event || '')
            const data = ev.data ? JSON.parse(ev.data) : null
            if (!eventType || data == null) return

            if (eventType === 'snapshot') {
              push({ type: 'snapshot', data })
              return
            }

            // All other stream events use `type`+`data` shape; we keep `data` loosely typed
            // to avoid runtime coupling and to allow forward-compatible fields.
            switch (eventType) {
              case 'turn.started':
                push({ type: 'turn.started', data })
                return
              case 'turn.status':
                push({ type: 'turn.status', data })
                return
              case 'turn.usage':
                push({ type: 'turn.usage', data })
                return
              case 'await_requested':
                push({ type: 'await_requested', data })
                return
              case 'assistant.delta':
                push({ type: 'assistant.delta', data })
                return
              case 'assistant.reasoning_delta':
                push({ type: 'assistant.reasoning_delta', data })
                return
              case 'message.append':
                push({ type: 'message.append', data })
                return
              case 'message.reactions':
                push({ type: 'message.reactions', data })
                return
              case 'ui_action':
                push({ type: 'ui_action', data })
                return
              default:
                return
            }
          } catch (e) {
            push({ type: 'error', error: e })
          }
        },
        onclose() {
          if (!isActiveInstance()) return
          cleanup('onclose')
        },
        onerror(err) {
          if (!isActiveInstance()) return
          lastSseErrorAtRef.current = Date.now()
          push({ type: 'error', error: err })
          cleanup('onerror')
        },
      })
    } catch (e) {
      throw e
    }

    return {
      [Symbol.asyncIterator]() {
        return {
          next: () => {
            if (queue.length > 0) return Promise.resolve({ value: queue.shift()!, done: false })
            if (closed) return Promise.resolve({ value: undefined, done: true })
            return new Promise<IteratorResult<StreamedChunk>>(resolve => resolvers.push(resolve))
          },
          return: () => {
            cleanup('manual')
            return Promise.resolve({ value: undefined, done: true })
          },
          throw: e => {
            cleanup('manual')
            return Promise.reject(e)
          },
        }
      },
    }
  }

  const toIsoTimestamp = (value: unknown): string | null => {
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString()
    if (typeof value === 'number' && Number.isFinite(value)) {
      const ms = value < 1e12 ? value * 1000 : value
      const d = new Date(ms)
      return Number.isNaN(d.getTime()) ? null : d.toISOString()
    }
    if (typeof value === 'string') {
      const trimmed = value.trim()
      if (!trimmed) return null
      const asNumber = Number(trimmed)
      if (Number.isFinite(asNumber)) {
        const ms = asNumber < 1e12 ? asNumber * 1000 : asNumber
        const d = new Date(ms)
        return Number.isNaN(d.getTime()) ? null : d.toISOString()
      }
      const d = new Date(trimmed)
      return Number.isNaN(d.getTime()) ? null : d.toISOString()
    }
    return null
  }

  const normalizeMessageTimestamps = (input: any): ClientMessage => {
    if (!input || typeof input !== 'object') return input as ClientMessage
    const createdRaw = input.createdAt ?? input.created_at ?? input.createdAtMs ?? input.created_at_ms ?? input.timestamp ?? input.time
    const updatedRaw = input.updatedAt ?? input.updated_at ?? input.updatedAtMs ?? input.updated_at_ms ?? input.updated_at ?? createdRaw
    const createdAt = toIsoTimestamp(createdRaw)
    const updatedAt = toIsoTimestamp(updatedRaw ?? createdRaw)
    const next = { ...input } as any
    if (createdAt) next.createdAt = createdAt
    if (updatedAt) next.updatedAt = updatedAt
    return next as ClientMessage
  }

  const withStreaming = (m: ClientMessage, streaming: boolean): ClientMessage => ({ ...m, streaming })
  const emptyMessages: ClientMessage[] = []

  function reduceMessages(acc: ClientMessage[], chunk: StreamedChunk): ClientMessage[] {
    // IMPORTANT:
    // Preserve object identity for unchanged messages.
    // Re-cloning every message on every chunk causes React to re-render the entire message list
    // for each delta, which can freeze the tab under high-frequency streaming.
    const clone = (arr: ClientMessage[]): ClientMessage[] => arr.slice()
    const toolCallKey = (m: any): string => {
      const id = m?.id != null ? String(m.id) : ''
      if (!id) return ''
      if (m?.role === 'assistant' && Array.isArray(m?.toolCalls) && m.toolCalls.length > 0) {
        const toolCallIds = m.toolCalls
          .map((tc: any) => tc?.id ?? tc?.call_id ?? tc?.toolCallId)
          .filter(Boolean)
          .map((x: any) => String(x))
          .join(',')
        return `${id}:${toolCallIds}`
      }
      return id
    }

    // Terminal turn states should stop any in-progress streaming message.
    if (chunk.type === 'turn.status') {
      const status = chunk.data?.status
      if (status === 'completed' || status === 'failed' || status === 'cancelled') {
        return acc.map(m => (m.streaming ? withStreaming(m, false) : m))
      }
      return acc
    }

    if (chunk.type === 'snapshot') {
      const msgs: ClientMessage[] = Array.isArray(chunk.data.messages) ? chunk.data.messages : []
      // Preserve streaming state for assistant messages in active turns - they may have been
      // derived from Redis stream replay and should continue accumulating deltas.
      const turn = chunk.data.turn
      const isActiveTurn = turn && (turn.status === 'active' || turn.status === 'waiting_for_tools')
      const snap = msgs.map(m => {
        const normalized = normalizeMessageTimestamps(m as any)
        // Only mark the *stream placeholder* as streaming on snapshot.
        //
        // Why:
        // The server emits deltas targeting a single messageId (usually `stream-${turnId}`).
        // Marking *all* assistant messages in the active turn as `streaming=true` makes the UI
        // think multiple messages are "actively streaming", which can move the caret and confuse
        // which bubble should visually "continue" after refresh.
        const isStreamPlaceholder = typeof (normalized as any)?.id === 'string' && typeof turn?.turnId === 'string' && String((normalized as any).id) === `stream-${turn.turnId}`
        const shouldStream = Boolean(isActiveTurn && normalized.role === 'assistant' && isStreamPlaceholder)
        const withStream = withStreaming(normalized, shouldStream)
        // Mark streaming placeholders from snapshots so we can detect stale deltas later
        if (shouldStream) {
          return { ...withStream, fromSnapshot: true }
        }
        return withStream
      })

      // Merge snapshot with existing messages carefully:
      // - Snapshot is authoritative for any given message id.
      // - We only keep "extra" messages from acc when their id is NOT present in the snapshot.
      //
      // Why: allowing multiple entries with the same `id` (even when toolCalls differ) breaks
      // `assistant.delta` routing (findIndex hits the first match), which is exactly how streaming
      // can appear to "resume" on an older bubble after refresh/tool-call phases.
      const snapIds = new Set<string>()
      for (const m of snap) {
        if (m?.id != null) snapIds.add(String(m.id))
      }
      const merged: ClientMessage[] = [...snap]
      const turnStatus = turn?.status
      const turnTerminal = turnStatus === 'completed' || turnStatus === 'failed' || turnStatus === 'cancelled'
      let keptFromAcc = 0
      for (const m of acc) {
        const id = m?.id != null ? String(m.id) : ''
        if (!id) continue
        if (turnTerminal && id.startsWith('stream-')) {
          continue
        }
        if (!snapIds.has(id)) {
          merged.push(m)
          keptFromAcc++
        }
      }

      return merged
    }

    if (chunk.type === 'append') {
      const evt: ConversationStreamEvent = {
        type: 'message.append',
        data: { conversationId: conversationId || '', message: chunk.message },
      }
      return reduceMessages(acc, evt)
    }

    if (chunk.type === 'message.append') {
      const msgRaw = chunk.data?.message
      const messages = clone(acc)
      if (!msgRaw || !msgRaw.id) return messages
      const msg = normalizeMessageTimestamps(msgRaw)

      // If a message with the same id already exists, treat this as an update rather than a new message.
      // This avoids duplicate ids, which can cause streaming deltas to "attach" to an older copy.
      const existingIdxById = messages.findIndex(m => m.id === msg.id)
      if (existingIdxById !== -1) {
        const existing = messages[existingIdxById] as ClientMessage
        // Merge toolCalls if both have them (preserve whichever is more complete).
        const nextToolCalls = (() => {
          const a = Array.isArray((existing as any)?.toolCalls) ? ((existing as any).toolCalls as any[]) : []
          const b = Array.isArray((msg as any)?.toolCalls) ? ((msg as any).toolCalls as any[]) : []
          if (a.length === 0) return b
          if (b.length === 0) return a
          const out: any[] = []
          const seen = new Set<string>()
          const add = (tc: any) => {
            const id = tc?.id ?? tc?.call_id ?? tc?.toolCallId
            const key = id != null ? String(id) : `no-id-${out.length}`
            if (seen.has(key)) return
            seen.add(key)
            out.push(tc)
          }
          // Prefer the newer message's toolCalls first, then fill with any missing from existing.
          b.forEach(add)
          a.forEach(add)
          return out
        })()
        messages[existingIdxById] = withStreaming(
          {
            ...existing,
            ...msg,
            ...(Array.isArray(nextToolCalls) ? { toolCalls: nextToolCalls as any } : null),
          } as ClientMessage,
          false
        )
        return messages
      }

      // Replace the streaming placeholder message for this turn (stream-<turnId>) if present.
      const msgTurnId = msg.turnId
      if (msg.role === 'assistant' && typeof msgTurnId === 'string') {
        const streamId = `stream-${msgTurnId}`
        const idx = messages.findIndex(m => m.id === streamId)
        if (idx !== -1) {
          // IMPORTANT:
          // We always replace the stream placeholder when the server appends a persisted assistant message
          // for this turn (including tool-call-only messages with empty content).
          //
          // Why:
          // - Tool-call assistant messages can include `reasoning` while `content` is empty.
          //   If we keep the placeholder AND append the persisted tool-call message, the UI renders
          //   the same reasoning twice (once on the placeholder, once on the persisted message).
          // - After a persisted assistant message is appended, any subsequent assistant output in the same
          //   turn will resume streaming into `stream-<turnId>`; if we've replaced it, the next delta will
          //   simply create a fresh `stream-<turnId>` shell (see assistant.delta reducer), which is fine.
          messages[idx] = withStreaming(msg, false)
          return messages
        }

        // Check if there's already an assistant message with the same turnId
        const existingAssistantIdx = messages.findIndex(m => m.role === 'assistant' && m.turnId === msgTurnId && m.id !== msg.id)
        if (existingAssistantIdx !== -1) {
          // Don't replace - add as a new message (multiple assistant messages per turn are valid)
        }
      }

      // Replace temp user message (temp-user-*) with the persisted message when it arrives.
      // ConversationMessageInput pre-seeds temp user messages for optimistic UI updates.
      if (msg.role === 'user') {
        const msgContent = String(msg.content || '')
        const msgCreatedAt = typeof msg.createdAt === 'string' ? msg.createdAt : ''
        // Find temp user message with same content and similar timestamp (within 10 seconds)
        for (let i = messages.length - 1; i >= 0; i--) {
          const m = messages[i]
          if (m.role !== 'user') continue
          const mId = typeof m.id === 'string' ? String(m.id) : ''
          if (!mId.startsWith('temp-user-')) continue
          if (String(m.content || '') !== msgContent) continue

          // Check timestamp similarity (allow 10 second window for DB vs stream timing)
          const mCreatedAt = typeof m.createdAt === 'string' ? m.createdAt : ''
          if (msgCreatedAt && mCreatedAt) {
            const diff = Math.abs(Date.parse(msgCreatedAt) - Date.parse(mCreatedAt))
            if (diff > 10000) continue
          }

          // Replace temp message with persisted message.
          // Preserve any identity fields we stamped onto the temp message in case the server echo is missing them
          // (this prevents brief "unknown author" grouping flashes in the timeline).
          const prevTemp = messages[i] as any
          const merged: any = { ...prevTemp, ...msg, id: msg.id }
          if (!merged.userId && prevTemp?.userId) merged.userId = prevTemp.userId
          if (!merged.userName && prevTemp?.userName) merged.userName = prevTemp.userName
          if (!merged.userAvatar && prevTemp?.userAvatar) merged.userAvatar = prevTemp.userAvatar
          if (!merged.clientMessageId && prevTemp?.clientMessageId) merged.clientMessageId = prevTemp.clientMessageId
          messages[i] = withStreaming(merged, false)
          return messages
        }
      }

      if (msg.role === 'assistant') {
        const lastAssistant = (() => {
          for (let i = messages.length - 1; i >= 0; i--) {
            if (messages[i]?.role === 'assistant') return messages[i] as ClientMessage
          }
          return null
        })()
        const lastContent = typeof (lastAssistant as any)?.content === 'string' ? String((lastAssistant as any).content).trim() : ''
        const nextContent = typeof (msg as any)?.content === 'string' ? String((msg as any).content).trim() : ''
        if (lastAssistant && lastContent && nextContent && lastContent === nextContent) {
          /* no-op */
        }
      }

      return [...messages, { ...msg }]
    }

    if (chunk.type === 'message.reactions') {
      const messages = clone(acc)
      const messageId = typeof chunk.data?.messageId === 'string' ? String(chunk.data.messageId) : ''
      const reactions = chunk.data?.reactions
      if (!messageId) return messages
      const idx = messages.findIndex(m => m.id === messageId)
      if (idx === -1) return messages
      messages[idx] = {
        ...(messages[idx] as any),
        reactions: reactions && typeof reactions === 'object' ? reactions : {},
      } as any
      return messages
    }

    if (chunk.type === 'assistant.delta' || chunk.type === 'assistant.reasoning_delta') {
      const messages = clone(acc)
      const messageId = chunk.data.messageId
      const delta = chunk.data.delta
      if (!messageId || !delta) return messages
      const agentId = typeof (chunk as any)?.data?.agentId === 'string' ? String((chunk as any).data.agentId).trim() : ''
      const agentName = typeof (chunk as any)?.data?.agentName === 'string' ? String((chunk as any).data.agentName).trim() : ''

      // If there are duplicates (should be prevented, but can occur during edge-case merges),
      // always apply deltas to the LAST occurrence so streaming continues at the tail.
      let idx = -1
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i]?.id === messageId) {
          idx = i
          break
        }
      }
      const at = (chunk as any)?.data?.at
      const now = typeof at === 'string' && at.trim().length > 0 ? at : new Date().toISOString()
      const evtTurnId = typeof (chunk as any)?.data?.turnId === 'string' ? String((chunk as any).data.turnId) : null
      if (idx === -1) {
        const shell: ClientMessage = {
          id: messageId,
          role: 'assistant',
          content: chunk.type === 'assistant.delta' ? delta : '',
          reasoning: chunk.type === 'assistant.reasoning_delta' ? delta : undefined,
          messageType: 'agent_response',
          // Use the server event timestamp when available to keep ordering stable across refreshes.
          createdAt: now,
          updatedAt: now,
          ...(typeof (chunk as any)?.data?.turnId === 'string' ? { turnId: String((chunk as any).data.turnId) } : null),
          ...(agentId ? { agentId } : null),
          ...(agentName ? { agentName } : null),
          streaming: true,
        }
        return [...messages, shell]
      }
      const cur: ClientMessage = { ...messages[idx] }
      const oldContentLen = String(cur.content || '').length
      const oldReasoningLen = String(cur.reasoning || '').length
      const isFromSnapshot = cur.fromSnapshot === true

      cur.updatedAt = now
      cur.streaming = true
      // Canonical identity stamping (no UI heuristics):
      // once we learn the agent for this streaming placeholder, persist it on the message record.
      if (agentId) (cur as any).agentId = agentId
      if (agentName) (cur as any).agentName = agentName

      // If this message came from a snapshot and this is the first delta, REPLACE content instead of appending
      // to avoid stale content from snapshot. Clear the flag after first delta.
      if (isFromSnapshot && chunk.type === 'assistant.delta') {
        cur.content = delta
        cur.fromSnapshot = false
      } else if (isFromSnapshot && chunk.type === 'assistant.reasoning_delta') {
        cur.reasoning = delta
        cur.fromSnapshot = false
      } else {
        if (chunk.type === 'assistant.delta') cur.content = String(cur.content || '') + delta
        else cur.reasoning = String(cur.reasoning || '') + delta
      }

      const newContentLen = String(cur.content || '').length
      const newReasoningLen = String(cur.reasoning || '').length
      messages[idx] = cur
      return messages
    }

    if (chunk.type === 'ui_action') {
      // Inline widget rendering has been removed; UI actions are still consumed elsewhere
      // for side-effects (cache invalidation, banners, etc).
      return acc
    }

    return acc
  }

  function reduceTurn(acc: TurnState, chunk: StreamedChunk): TurnState {
    if (chunk.type === 'snapshot') {
      if (chunk.data.turn)
        return {
          ...acc,
          turnId: chunk.data.turn.turnId,
          status: chunk.data.turn.status,
          agentId: typeof (chunk.data.turn as any)?.agentId === 'string' ? String((chunk.data.turn as any).agentId) : (acc.agentId ?? null),
          agentName: typeof (chunk.data.turn as any)?.agentName === 'string' ? String((chunk.data.turn as any).agentName) : (acc.agentName ?? null),
        }
      return acc
    }
    if (chunk.type === 'turn.started') {
      return {
        ...acc,
        turnId: chunk.data.turnId,
        status: 'active',
        agentId: typeof (chunk.data as any)?.agentId === 'string' ? String((chunk.data as any).agentId) : (acc.agentId ?? null),
        agentName: typeof (chunk.data as any)?.agentName === 'string' ? String((chunk.data as any).agentName) : (acc.agentName ?? null),
      }
    }
    if (chunk.type === 'turn.status') {
      const data = chunk.data
      const status = data?.status
      if (!status) return acc
      return { ...acc, turnId: data?.turnId ?? acc.turnId, status }
    }
    if (chunk.type === 'await_requested') {
      const d = chunk.data as unknown
      const rec = d && typeof d === 'object' ? (d as Record<string, unknown>) : null
      const at = typeof rec?.at === 'string' ? String(rec.at) : new Date().toISOString()
      const nodeRef = typeof rec?.nodeRef === 'string' ? String(rec.nodeRef) : ''
      const kind = typeof rec?.kind === 'string' ? String(rec.kind) : ''
      const specRaw = rec?.spec
      const spec = specRaw && typeof specRaw === 'object' && !Array.isArray(specRaw) ? (specRaw as Record<string, unknown>) : null
      if (!nodeRef || kind !== 'connector_event' || !spec) return acc
      return { ...acc, awaitRequested: { at, nodeRef, kind: 'connector_event', spec } }
    }
    if (chunk.type === 'assistant.delta' || chunk.type === 'assistant.reasoning_delta') {
      // If the server did not (or could not) emit turn.started with agent identity, learn it from the first delta.
      const d = (chunk as { data?: unknown }).data
      const rec = d && typeof d === 'object' ? (d as Record<string, unknown>) : null
      const tid = typeof rec?.turnId === 'string' ? String(rec.turnId) : ''
      if (!tid) return acc
      if (acc.turnId && String(acc.turnId) !== tid) return acc
      const agentId = typeof rec?.agentId === 'string' ? String(rec.agentId) : ''
      const agentName = typeof rec?.agentName === 'string' ? String(rec.agentName) : ''
      if (!agentId && !agentName) return acc
      return {
        ...acc,
        turnId: acc.turnId ?? tid,
        agentId: agentId || (acc.agentId ?? null),
        agentName: agentName || (acc.agentName ?? null),
      }
    }
    // Back-compat for local pre-seed
    if (chunk.type === 'turn_started' && chunk.payload?.local === true) {
      return { turnId: acc.turnId ?? 'pending', status: 'active' }
    }
    return acc
  }

  const messagesQuery = useQuery<StreamedChunk[]>({
    queryKey: conversationId ? CONVERSATION_QUERY_KEYS.messages(conversationId) : ['__noop__'],
    queryFn: streamedQuery({
      queryFn: async (_ctx: any) => {
        const token = await getCurrentToken()
        if (_ctx?.signal?.aborted) {
          return makeAbortedIterable(conversationId!, 'ctx.signal.aborted after token')
        }
        const iterable = makeSSEAsyncIterable(conversationId!, token, _ctx?.signal)
        return iterable
      },
      refetchMode: 'append',
    }),
    enabled: !!conversationId && enabledFlag,
    refetchOnWindowFocus: false,
    staleTime: 0,
    gcTime: 2 * 60 * 1000,
  })

  const chunks: StreamedChunk[] = messagesQuery.data ?? []
  const chunksLen = Array.isArray(chunks) ? chunks.length : 0
  const lastChunk = chunksLen > 0 ? chunks[chunksLen - 1] : null
  const lastChunkSig = lastChunk?.type ? String(lastChunk.type) : 'none'
  // IMPORTANT:
  // This key intentionally avoids depending on the entire `chunks` array for perf,
  // but it MUST be unique across conversation switches to avoid stale memoization
  // (which can surface as "mixed" messages when navigating between conversations).
  const lastChunkDataSig = (() => {
    const c: any = lastChunk as any
    if (!c) return ''
    const d: any = c?.data
    if (d?.turnId) return String(d.turnId)
    if (d?.messageId) return String(d.messageId)
    if (d?.message?.id) return String(d.message.id)
    if (d?.at) return String(d.at)
    if (c?.type === 'snapshot') {
      if (d?.turn?.turnId) return String(d.turn.turnId)
      if (d?.turn?.status) return String(d.turn.status)
    }
    return ''
  })()
  const chunksRevisionKey = `${conversationId ?? 'none'}|${chunksLen}|${lastChunkSig}|${lastChunkDataSig}`

  // Queue for message.append chunks that are delayed due to animation
  const queuedAppendChunksRef = useRef<StreamedChunk[]>([])
  const processedChunksRef = useRef<StreamedChunk[]>([])
  // Track last computed messages to use in animation check (avoids re-reducing all chunks)
  const lastComputedMessagesRef = useRef<ClientMessage[]>([])
  // Track how many filteredChunks we've processed in computedMessages (separate from processedChunksRef!)
  const lastReducedChunkCountRef = useRef<number>(0)

  // CRITICAL: Reset all cross-render refs when switching conversations.
  //
  // Without this, queued `message.append` chunks from conversation A (held back by animation gating)
  // can be appended into conversation B when the gating condition later resolves, which manifests as
  // "mixed messages from a different conversation/agent" after navigation.
  useEffect(() => {
    queuedAppendChunksRef.current = []
    processedChunksRef.current = []
    lastComputedMessagesRef.current = []
    lastReducedChunkCountRef.current = 0
  }, [conversationId])

  const turnState = useMemo<TurnState>(() => chunks.reduce(reduceTurn, { turnId: null, status: null, agentId: null, agentName: null, awaitRequested: null }), [chunksRevisionKey])

  function reduceTurnUsage(acc: Record<string, TurnUsage>, chunk: StreamedChunk): Record<string, TurnUsage> {
    if (chunk.type === 'snapshot') {
      const d: any = (chunk as any)?.data
      const snapMap = d?.turnUsageByTurnId
      if (!snapMap || typeof snapMap !== 'object') return acc
      const nextAcc: Record<string, TurnUsage> = { ...acc }
      for (const [k, v] of Object.entries(snapMap as Record<string, any>)) {
        const tid = typeof (v as any)?.turnId === 'string' ? String((v as any).turnId) : typeof k === 'string' ? String(k) : ''
        if (!tid) continue
        const at = typeof (v as any)?.at === 'string' ? String((v as any).at) : new Date().toISOString()
        const u = (v as any)?.usage
        if (!u || typeof u !== 'object') continue
        const promptTokens = typeof u.promptTokens === 'number' ? u.promptTokens : 0
        const completionTokens = typeof u.completionTokens === 'number' ? u.completionTokens : 0
        const totalTokens = typeof u.totalTokens === 'number' ? u.totalTokens : Number(promptTokens) + Number(completionTokens)
        const cost = typeof u.cost === 'number' && Number.isFinite(u.cost) ? u.cost : undefined
        nextAcc[tid] = {
          turnId: tid,
          at,
          ...(typeof (v as any)?.agentId === 'string' ? { agentId: String((v as any).agentId) } : null),
          ...(typeof (v as any)?.agentName === 'string' ? { agentName: String((v as any).agentName) } : null),
          ...(typeof (v as any)?.model === 'string' ? { model: String((v as any).model) } : null),
          usage: { promptTokens, completionTokens, totalTokens, ...(typeof cost === 'number' ? { cost } : null) },
        }
      }
      return nextAcc
    }
    if (chunk.type !== 'turn.usage') return acc
    const d: any = (chunk as any)?.data
    const turnId = typeof d?.turnId === 'string' ? String(d.turnId) : ''
    if (!turnId) return acc
    const at = typeof d?.at === 'string' ? String(d.at) : new Date().toISOString()
    const usageNode = d?.usage && typeof d.usage === 'object' ? d.usage : null
    if (!usageNode) return acc
    const promptTokens = typeof usageNode.promptTokens === 'number' ? usageNode.promptTokens : 0
    const completionTokens = typeof usageNode.completionTokens === 'number' ? usageNode.completionTokens : 0
    const totalTokens = typeof usageNode.totalTokens === 'number' ? usageNode.totalTokens : Number(promptTokens) + Number(completionTokens)
    const cost = typeof usageNode.cost === 'number' && Number.isFinite(usageNode.cost) ? usageNode.cost : undefined

    // A single assistant "turn" can include multiple LLM calls (tool flows, retries, etc).
    // For UX, we want the *total tokens/cost burned in the turn*, so we aggregate by turnId.
    const prev = acc[turnId]
    if (!prev) {
      const next: TurnUsage = {
        turnId,
        at,
        ...(typeof d?.agentId === 'string' ? { agentId: String(d.agentId) } : null),
        ...(typeof d?.agentName === 'string' ? { agentName: String(d.agentName) } : null),
        ...(typeof d?.model === 'string' ? { model: String(d.model) } : null),
        usage: { promptTokens, completionTokens, totalTokens, ...(typeof cost === 'number' ? { cost } : null) },
      }
      return { ...acc, [turnId]: next }
    }

    const prevPrompt = Number(prev?.usage?.promptTokens ?? 0)
    const prevCompletion = Number(prev?.usage?.completionTokens ?? 0)
    const prevTotal = Number(prev?.usage?.totalTokens ?? prevPrompt + prevCompletion)
    const prevCost = typeof prev?.usage?.cost === 'number' && Number.isFinite(prev.usage.cost) ? Number(prev.usage.cost) : 0
    const nextCost = typeof cost === 'number' && Number.isFinite(cost) ? cost : 0

    const next: TurnUsage = {
      ...prev,
      // Keep latest timestamp for display/debug.
      at,
      // Preserve prior metadata if present; otherwise fill from incoming.
      ...(typeof prev?.agentId === 'string' ? { agentId: prev.agentId } : typeof d?.agentId === 'string' ? { agentId: String(d.agentId) } : null),
      ...(typeof prev?.agentName === 'string' ? { agentName: prev.agentName } : typeof d?.agentName === 'string' ? { agentName: String(d.agentName) } : null),
      ...(typeof prev?.model === 'string' ? { model: prev.model } : typeof d?.model === 'string' ? { model: String(d.model) } : null),
      usage: {
        promptTokens: prevPrompt + Number(promptTokens),
        completionTokens: prevCompletion + Number(completionTokens),
        totalTokens: prevTotal + Number(totalTokens),
        ...(prevCost + nextCost > 0 ? { cost: prevCost + nextCost } : null),
      },
    }
    return { ...acc, [turnId]: next }
  }

  // Filter chunks to delay message.append until animation completes
  const filteredChunks = useMemo(() => {
    const processed: StreamedChunk[] = []
    const queued: StreamedChunk[] = []
    const shouldGateByAnimation = turnState.status === 'active' || turnState.status === 'waiting_for_tools'

    for (const chunk of chunks) {
      if (chunk.type === 'message.append') {
        const msg = chunk.data?.message
        if (msg?.role === 'assistant') {
          const hasToolCalls = Array.isArray(msg?.toolCalls) && msg.toolCalls.length > 0
          const attachmentIdsUnknown = isRecord(msg) ? msg['attachmentIds'] : undefined
          const hasAttachments = Array.isArray(attachmentIdsUnknown) && attachmentIdsUnknown.length > 0
          // IMPORTANT:
          // Do NOT delay assistant message.append events that contain attachments.
          //
          // Why (runtime evidence):
          // - Image generation often yields attachment-only assistant messages (contentLength=0)
          // - The "last assistant" is frequently the streaming placeholder `stream-<turnId>`
          // - If that placeholder never reaches animationComplete, the attachment message.append is queued forever
          //   (images only appear after full page reload/snapshot).
          if (hasAttachments) {
            processed.push(chunk)
            continue
          }
          if (!hasToolCalls) {
            // Check if previous assistant message animation is complete
            // Use LAST computed messages (from previous render) to avoid re-reduction
            const lastAssistantId = getLastAssistantMessageId(lastComputedMessagesRef.current)
            if (lastAssistantId && !isAnimationComplete(lastAssistantId) && shouldGateByAnimation) {
              // Queue this chunk for later processing
              queued.push(chunk)
              continue
            }
          }
        }
      }
      processed.push(chunk)
    }

    // Store queued chunks
    // IMPORTANT:
    // Never accumulate queued chunks across renders. The source-of-truth `chunks` array already contains
    // these items; we only need to remember what is currently gated for *this* render pass.
    // Accumulating here can explode memory and lead to duplicated chunk insertion.
    queuedAppendChunksRef.current = queued
    processedChunksRef.current = processed

    return processed
  }, [chunksRevisionKey, turnState.status, appendGateRevision])

  const turnUsageByTurnId = useMemo<Record<string, TurnUsage>>(() => filteredChunks.reduce(reduceTurnUsage, {}), [chunksRevisionKey])

  // Process queued chunks when animation completes
  useEffect(() => {
    if (queuedAppendChunksRef.current.length === 0) return

    const processQueued = () => {
      const currentMessages = processedChunksRef.current.reduce(reduceMessages, emptyMessages)
      const lastAssistantId = getLastAssistantMessageId(currentMessages)
      const turnStatus = turnState.status
      const shouldBypassAnimation = turnStatus === 'completed' || turnStatus === 'failed' || turnStatus === 'cancelled'

      if (!lastAssistantId || isAnimationComplete(lastAssistantId) || shouldBypassAnimation) {
        // Animation complete: DO NOT mutate the TanStack Query cache (the queued chunks are already present in `chunks`).
        // Instead, clear the queue and bump a local revision so `filteredChunks` recomputes and naturally includes them.
        queuedAppendChunksRef.current = []
        setAppendGateRevision(r => r + 1)
        return true
      }
      return false
    }

    // Try processing immediately
    if (!processQueued()) {
      // If not ready, set up callback for when animation completes
      const callback = () => {
        processQueued()
      }
      addPendingAppendCallback(callback)
      return () => {
        removePendingAppendCallback(callback)
      }
    }
  }, [filteredChunks, conversationId, turnState.status])

  // CRITICAL FIX: Incremental message reduction - only process NEW filtered chunks
  const computedMessages = useMemo(() => {
    const lastProcessedCount = lastReducedChunkCountRef.current // Use SEPARATE ref!
    const currentCount = filteredChunks.length

    // If count decreased (query reset) or is zero, start from scratch
    if (currentCount < lastProcessedCount || currentCount === 0) {
      const result = filteredChunks.reduce(reduceMessages, [] as ClientMessage[])
      lastComputedMessagesRef.current = result
      lastReducedChunkCountRef.current = currentCount
      return result
    }

    // Get only NEW chunks that haven't been processed yet
    const newChunks = filteredChunks.slice(lastProcessedCount)

    if (newChunks.length === 0) {
      return lastComputedMessagesRef.current
    }

    // Apply only new chunks to previous result (incremental)
    // NOTE:
    // `reduceMessages()` is implemented to avoid mutating its accumulator or message objects in-place,
    // so we can safely reuse the previous array and preserve identity for unchanged rows.
    const result = newChunks.reduce(reduceMessages, lastComputedMessagesRef.current)
    lastComputedMessagesRef.current = result
    lastReducedChunkCountRef.current = currentCount // Update the count!

    return result
  }, [filteredChunks, conversationId])

  const isAwaitingToolResults = turnState.status === 'waiting_for_tools'
  const isAssistantStreaming = useMemo(() => computedMessages.some(m => m.streaming === true), [computedMessages])
  const turnActive = turnState.status === 'active' || turnState.status === 'waiting_for_tools'
  const isResponding = Boolean(turnActive || isAssistantStreaming)
  const isAwaitingAssistant = Boolean(isResponding && !isAssistantStreaming && !isAwaitingToolResults)

  // When a turn completes, refresh usage so any header indicators update immediately.
  useEffect(() => {
    if (!conversationId) return
    const s = turnState.status
    if (s === 'completed' || s === 'failed' || s === 'cancelled') {
      queryClient.invalidateQueries({ queryKey: USAGE_QUERY_KEYS.conversationTotals(conversationId) })
    }
  }, [conversationId, turnState.status, queryClient])

  const lastUIAction = useMemo(() => {
    if (!Array.isArray(chunks) || chunks.length === 0) return null
    for (let i = chunks.length - 1; i >= 0; i--) {
      const c: any = chunks[i]
      if (c?.type === 'ui_action') return c.data ?? null
    }
    return null
  }, [chunksRevisionKey])

  // Consume non-render UI actions that should update query caches.
  //
  // Why:
  // Some UI actions (like `conversation_title_updated`) are emitted on the conversation's SSE stream,
  // but the UI component showing the title (e.g. a linked thread card elsewhere) relies on cached
  // `useConversationDetail()` data. Without invalidation, the title can remain stale for up to the
  // query staleTime.
  const lastProcessedUIActionKeyRef = useRef<string | null>(null)
  useEffect(() => {
    if (!lastUIAction) return
    try {
      const key = JSON.stringify(lastUIAction)
      if (lastProcessedUIActionKeyRef.current === key) return
      lastProcessedUIActionKeyRef.current = key

      const action = typeof (lastUIAction as any)?.action === 'string' ? String((lastUIAction as any).action) : ''
      const payload = (lastUIAction as any)?.payload

      switch (action) {
        case 'tool_approval_required':
        case 'tool_approval_resolved': {
          const cid = typeof payload?.conversationId === 'string' ? String(payload.conversationId) : ''
          if (cid) queryClient.invalidateQueries({ queryKey: CONVERSATION_QUERY_KEYS.toolApprovalsPending(cid) })
          break
        }
        case 'room_invite_approval_required':
        case 'room_invite_approval_resolved': {
          const roomId = typeof payload?.roomConversationId === 'string' ? String(payload.roomConversationId) : ''
          const cid = typeof payload?.conversationId === 'string' ? String(payload.conversationId) : ''
          if (roomId && cid) queryClient.invalidateQueries({ queryKey: ROOM_QUERY_KEYS.inviteApprovalsPending(roomId, cid) })
          if (roomId) queryClient.invalidateQueries({ queryKey: ROOM_QUERY_KEYS.participants(roomId) })
          break
        }
        case 'conversation_title_updated': {
          const cid = typeof payload?.conversationId === 'string' ? String(payload.conversationId) : ''
          if (cid) queryClient.invalidateQueries({ queryKey: CONVERSATION_QUERY_KEYS.detail(cid) })
          if (starshipId) queryClient.invalidateQueries({ queryKey: CONVERSATION_QUERY_KEYS.byStarship(starshipId) })
          break
        }
        case 'child_conversation_created': {
          const parentId = typeof payload?.parentConversationId === 'string' ? String(payload.parentConversationId) : ''
          const sid = typeof payload?.starshipId === 'string' ? String(payload.starshipId) : starshipId || ''
          if (sid) queryClient.invalidateQueries({ queryKey: CONVERSATION_QUERY_KEYS.byStarship(sid) })
          if (parentId) queryClient.invalidateQueries({ queryKey: CONVERSATION_QUERY_KEYS.children(parentId) })
          break
        }
        default:
          break
      }
    } catch {
      // ignore UI action parsing failures
    }
  }, [lastUIAction, queryClient, starshipId])

  type HistoryCursor = { createdAt: string; id: string }
  const latestSnapshot = useMemo(() => {
    if (!Array.isArray(chunks) || chunks.length === 0) {
      return { hasMoreBefore: false, oldestCursor: null as HistoryCursor | null, snapshotData: null as ConversationStreamSnapshot | null }
    }
    for (let i = chunks.length - 1; i >= 0; i--) {
      const c: any = chunks[i] as any
      if (c?.type === 'snapshot' && c?.data && typeof c.data === 'object') {
        const d = c.data as ConversationStreamSnapshot & { hasMoreBefore?: boolean; oldestCursor?: HistoryCursor | null }
        const hasMoreBefore = Boolean((d as any).hasMoreBefore)
        const oldestCursorRaw = (d as any).oldestCursor
        const oldestCursor =
          oldestCursorRaw && typeof oldestCursorRaw === 'object' && typeof oldestCursorRaw.createdAt === 'string' && typeof oldestCursorRaw.id === 'string'
            ? ({ createdAt: oldestCursorRaw.createdAt, id: oldestCursorRaw.id } as HistoryCursor)
            : null
        return { hasMoreBefore, oldestCursor, snapshotData: d }
      }
    }
    return { hasMoreBefore: false, oldestCursor: null as HistoryCursor | null, snapshotData: null as ConversationStreamSnapshot | null }
  }, [chunksRevisionKey])

  const [isLoadingOlder, setIsLoadingOlder] = useState(false)
  const loadOlder = useCallback(
    async (args?: { limit?: number }) => {
      const convId = String(conversationId || '')
      if (!convId) return
      const snap = latestSnapshot.snapshotData as any
      const cursor = latestSnapshot.oldestCursor
      if (!snap || !cursor) return
      if (isLoadingOlder) return

      setIsLoadingOlder(true)
      try {
        const limit = Math.max(1, Math.min(200, Number(args?.limit ?? 30)))
        const response: FetchResponse<ApiResponse<any>> = await api.get(`/api/v1/conversations/${convId}/messages`, {
          params: {
            limit,
            beforeCreatedAt: cursor.createdAt,
            beforeId: cursor.id,
          },
        })
        const payload = response.data.data as any
        const olderRaw = Array.isArray(payload?.messages) ? (payload.messages as ClientMessage[]) : []
        const older = olderRaw.map(m => normalizeMessageTimestamps(m as any))
        const hasMoreBefore = Boolean(payload?.hasMoreBefore)
        const oldestCursor = payload?.oldestCursor ?? null

        const existingIds = new Set<string>()
        const snapMsgs: any[] = Array.isArray(snap?.messages) ? snap.messages : []
        snapMsgs.forEach((m: any) => {
          if (m?.id != null) existingIds.add(String(m.id))
        })
        const olderFiltered = older.filter(m => m?.id != null && !existingIds.has(String(m.id)))

        const nextSnapshot = {
          ...snap,
          messages: [...olderFiltered, ...snapMsgs],
          hasMoreBefore,
          oldestCursor,
        }

        queryClient.setQueryData(CONVERSATION_QUERY_KEYS.messages(convId), (old: any) => {
          const chunks = Array.isArray(old) ? old : []
          return [...chunks, { type: 'snapshot', data: nextSnapshot }]
        })
      } catch (error: any) {
        const msg = getSafeErrorMessage(error)
        toast.error('Failed to load older messages', { description: msg })
      } finally {
        setIsLoadingOlder(false)
      }
    },
    [conversationId, latestSnapshot, isLoadingOlder, queryClient]
  )

  const sendMessageMutation = useMutation({
    mutationFn: async (data: CreateMessageRequest & { conversationId: string }) => {
      const response: FetchResponse<ApiResponse<any>> = await api.post(`/api/v1/conversations/${data.conversationId}/messages`, {
        content: data.content,
        agentId: data.agentId,
        attachmentIds: data.attachmentIds,
        modalities: data.modalities,
        imageConfig: data.imageConfig,
      })
      return response.data
    },
    onMutate: async variables => {
      const now = Date.now()
      const lastErrorAt = lastSseErrorAtRef.current
      const lastOpenAt = lastSseOpenAtRef.current
      const errorRecently = typeof lastErrorAt === 'number' ? now - lastErrorAt < 5 * 60 * 1000 : false
      const openStale = typeof lastOpenAt === 'number' ? now - lastOpenAt > 2 * 60 * 1000 : true
      if (errorRecently || openStale) {
        // Restart the stream so the response can render even after idle disconnects.
        if (variables?.conversationId) {
          queryClient.invalidateQueries({ queryKey: CONVERSATION_QUERY_KEYS.messages(variables.conversationId) })
        }
      }
      // No optimistic updates - wait for server to send message.append and turn.started events
      // This avoids duplicate messages and keeps the UI in sync with server state
    },
    onError: (error: any) => {
      const errorMessage = getSafeErrorMessage(error)
      toast.error('Failed to send message', { description: errorMessage })
    },
  })

  return {
    messages: computedMessages,
    isLoading: messagesQuery.isLoading,
    error: messagesQuery.error,
    // For streaming queries, `fetchStatus` can remain "fetching" while the SSE connection stays open.
    // Consumers should use this flag to distinguish "empty but hydrated" from "still waiting on first snapshot".
    hasSnapshot: Boolean(latestSnapshot.snapshotData),
    isStreaming: isResponding,
    isResponding,
    isAssistantStreaming,
    isAwaitingAssistant,
    isAwaitingToolResults,
    hasCompleteEvent: turnState.status === 'completed' || turnState.status === 'failed' || turnState.status === 'cancelled',
    turnId: turnState.turnId,
    turnStatus: turnState.status,
    turnAgentId: turnState.agentId ?? null,
    turnAgentName: turnState.agentName ?? null,
    awaitRequested: turnState.awaitRequested ?? null,
    turnUsageByTurnId,
    lastUIAction,
    hasMoreBefore: latestSnapshot.hasMoreBefore,
    oldestCursor: latestSnapshot.oldestCursor,
    isLoadingOlder,
    loadOlder,
    isFetching: messagesQuery.fetchStatus === 'fetching',
    sendMessage: (data: CreateMessageRequest & { conversationId: string }) => sendMessageMutation.mutateAsync(data),
    isSending: sendMessageMutation.isPending,
    refetch: messagesQuery.refetch,
    invalidate: () => {
      if (!conversationId) return Promise.resolve()
      return queryClient.invalidateQueries({ queryKey: CONVERSATION_QUERY_KEYS.messages(conversationId) })
    },
    stop: () => {
      // Explicitly abort the active SSE stream for this conversation (if any).
      // This is useful for transient subscribers (e.g. thread cards) that want to ensure
      // they don't leave background streams open after completion/unmount.
      const id = typeof conversationId === 'string' ? conversationId : ''
      if (!id) return
      try {
        const guard = activeSseGuards.get(id)
        guard?.abort()
        // `makeSSEAsyncIterable`'s cleanup will also delete the guard; best-effort delete here too.
        activeSseGuards.delete(id)
      } catch {
        // ignore
      }
    },
  }
}
