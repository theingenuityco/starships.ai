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
import { experimental_streamedQuery as streamedQuery, useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useMemo, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { fetchEventSource, type EventSourceMessage } from '@microsoft/fetch-event-source'
import { USAGE_QUERY_KEYS } from '@/hooks/useUsage'
import { WALLET_QUERY_KEYS } from '@/hooks/useWallet'
import { getSafeErrorMessage } from '@/lib/error-utils'
import { addPendingAppendCallback, getLastAssistantMessageId, isAnimationComplete, removePendingAppendCallback } from './useMessageAnimationState'

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
  messages: (conversationId: string) => [...CONVERSATION_QUERY_KEYS.detail(conversationId), 'messages'] as const,
  toolApprovalsPending: (conversationId: string) => [...CONVERSATION_QUERY_KEYS.detail(conversationId), 'tool-approvals', 'pending'] as const,
} as const

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
    mutationFn: async (data: { title?: string; starshipId: string; agentSlug?: string }): Promise<ConversationModel> => {
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
      const response: FetchResponse<ApiResponse<Array<ConversationModel & { agents: AgentModel[] }>>> = await api.get(`/api/v1/conversations/${id}/children`)
      return response.data.data || []
    },
    staleTime: process.env.NODE_ENV === 'development' ? 0 : 10_000,
    gcTime: process.env.NODE_ENV === 'development' ? 0 : 60_000,
    refetchOnWindowFocus: true,
  })
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
  const uniqueIds = useMemo(() => Array.from(new Set(ids)), [ids.join('|')])

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
      refetchInterval: enabled ? 2_000 : false,
      refetchIntervalInBackground: true,
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

// Get conversation agents (for agent restoration on refresh)
export function useConversationAgents(conversationId: string | null) {
  return useQuery({
    queryKey: [...CONVERSATION_QUERY_KEYS.messages(conversationId!), 'agents'],
    queryFn: async (): Promise<any[]> => {
      const response: FetchResponse<any> = await api.get(`/api/v1/conversations/${conversationId}/messages`, {
        params: { limit: 1, page: 1 }, // We only need agents, not all messages
      })
      return response.data.data.agents || []
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
export function useConversationDetail(conversationId: string | null) {
  return useQuery({
    queryKey: CONVERSATION_QUERY_KEYS.detail(conversationId!),
    queryFn: async (): Promise<ConversationModel> => {
      const response: FetchResponse<ApiResponse<ConversationModel>> = await api.get(`/api/v1/conversations/${conversationId}`)
      return response.data.data
    },
    enabled: !!conversationId,
    staleTime: process.env.NODE_ENV === 'development' ? 0 : 30 * 1000, // No cache in dev, 30 seconds in prod
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

  type TurnState = { turnId: string | null; status: StreamTurnStatus | null }

  type LegacyChunk = { type: 'append'; message: ClientMessage } | { type: 'turn_started'; payload?: { local?: boolean } }
  type StreamErrorChunk = { type: 'error'; error: unknown }
  type StreamedChunk = { type: ConversationStreamEvent['type']; data: any } | LegacyChunk | StreamErrorChunk

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
      if (prev) prev.abort()
    } catch {}
    activeSseGuards.set(convId, instanceController)
    const timeoutId = setTimeout(() => controller.abort(), 5 * 60 * 1000)
    const combinedSignal = signal ? AbortSignal.any([signal, controller.signal, instanceController.signal]) : AbortSignal.any([controller.signal, instanceController.signal])

    type Resolver = (value: IteratorResult<StreamedChunk>) => void
    const queue: StreamedChunk[] = []
    const resolvers: Resolver[] = []

    const push = (item: StreamedChunk) => {
      if (closed) return
      if (resolvers.length > 0) {
        const resolve = resolvers.shift()!
        resolve({ value: item, done: false })
      } else {
        queue.push(item)
      }
    }

    const cleanup = (reason: 'onclose' | 'onerror' | 'bad_status' | 'manual' = 'manual') => {
      if (closed) return
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

    fetchEventSource(url, {
      method: 'GET',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      openWhenHidden: true,
      signal: combinedSignal,
      async onopen(response) {
        if (!response.ok) {
          push({ type: 'error', error: { status: response.status, statusText: response.statusText } })
          cleanup('bad_status')
        }
      },
      onmessage(ev: EventSourceMessage) {
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
            case 'assistant.delta':
              push({ type: 'assistant.delta', data })
              return
            case 'assistant.reasoning_delta':
              push({ type: 'assistant.reasoning_delta', data })
              return
            case 'message.append':
              push({ type: 'message.append', data })
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
        cleanup('onclose')
      },
      onerror(err) {
        push({ type: 'error', error: err })
        cleanup('onerror')
      },
    })

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

  const withStreaming = (m: ClientMessage, streaming: boolean): ClientMessage => ({ ...m, streaming })
  const emptyMessages: ClientMessage[] = []

  function reduceMessages(acc: ClientMessage[], chunk: StreamedChunk): ClientMessage[] {
    const clone = (arr: ClientMessage[]): ClientMessage[] => arr.map(m => ({ ...m }))
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
        // Only mark the *stream placeholder* as streaming on snapshot.
        //
        // Why:
        // The server emits deltas targeting a single messageId (usually `stream-${turnId}`).
        // Marking *all* assistant messages in the active turn as `streaming=true` makes the UI
        // think multiple messages are "actively streaming", which can move the caret and confuse
        // which bubble should visually "continue" after refresh.
        const isStreamPlaceholder = typeof (m as any)?.id === 'string' && typeof turn?.turnId === 'string' && String((m as any).id) === `stream-${turn.turnId}`
        const shouldStream = Boolean(isActiveTurn && m.role === 'assistant' && isStreamPlaceholder)
        const withStream = withStreaming(m, shouldStream)
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
      let keptFromAcc = 0
      for (const m of acc) {
        const id = m?.id != null ? String(m.id) : ''
        if (!id) continue
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
      const msg = chunk.data?.message
      const messages = clone(acc)
      if (!msg || !msg.id) return messages
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

          // Replace temp message with persisted message
          messages[i] = withStreaming(msg, false)
          return messages
        }
      }

      return [...messages, { ...msg }]
    }

    if (chunk.type === 'assistant.delta' || chunk.type === 'assistant.reasoning_delta') {
      const messages = clone(acc)
      const messageId = chunk.data.messageId
      const delta = chunk.data.delta
      if (!messageId || !delta) return messages

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
      const messages = clone(acc)
      const payload = chunk.data
      const action = payload.__ui_action
      if (action !== 'widget_created' && action !== 'widget_updated') {
        return messages
      }

      const widgetUnknown = payload['widget']
      if (!isRecord(widgetUnknown)) return messages
      const widget = widgetUnknown
      const widgetId = typeof widget['id'] === 'string' ? widget['id'] : widget['id'] != null ? String(widget['id']) : ''
      const widgetType = typeof widget['widgetType'] === 'string' ? widget['widgetType'] : widget['widgetType'] != null ? String(widget['widgetType']) : ''
      const props = widget['props']
      if (!widgetId || !widgetType || !props || typeof props !== 'object') return messages

      const toolCallIdUnknown = payload['toolCallId']
      const toolCallId = typeof toolCallIdUnknown === 'string' ? toolCallIdUnknown : toolCallIdUnknown != null ? String(toolCallIdUnknown) : ''
      const toolName = action === 'widget_updated' ? 'update-widget' : 'create-widget'

      const msgId = `ui-widget-${widgetId}`
      const now = new Date().toISOString()

      const toolResultLike = {
        toolName,
        toolCallId,
        content: JSON.stringify(widget),
      }

      const existingIdx = messages.findIndex(m => m.id === msgId)
      if (existingIdx !== -1) {
        const existing = messages[existingIdx]
        const createdAtUnknown = widget['createdAt']
        const updatedAtUnknown = widget['updatedAt']
        const createdAt =
          (typeof existing?.createdAt === 'string' && existing.createdAt) ||
          (typeof createdAtUnknown === 'string' ? createdAtUnknown : now)

        messages[existingIdx] = {
          ...existing,
          id: msgId,
          role: 'assistant',
          messageType: 'agent_response',
          content: '',
          createdAt,
          updatedAt: typeof updatedAtUnknown === 'string' ? updatedAtUnknown : now,
          streaming: false,
          toolResults: [toolResultLike],
        }
        return messages
      }

      const createdAtUnknown = widget['createdAt']
      const updatedAtUnknown = widget['updatedAt']
      const createdAt = typeof createdAtUnknown === 'string' ? createdAtUnknown : now
      return [
        ...messages,
        {
          id: msgId,
          role: 'assistant',
          content: '',
          messageType: 'agent_response',
          createdAt,
          updatedAt: typeof updatedAtUnknown === 'string' ? updatedAtUnknown : now,
          streaming: false,
          toolResults: [toolResultLike],
        },
      ]
    }

    return acc
  }

  function reduceTurn(acc: TurnState, chunk: StreamedChunk): TurnState {
    if (chunk.type === 'snapshot') {
      if (chunk.data.turn) return { turnId: chunk.data.turn.turnId, status: chunk.data.turn.status }
      return acc
    }
    if (chunk.type === 'turn.started') {
      return { turnId: chunk.data.turnId, status: 'active' }
    }
    if (chunk.type === 'turn.status') {
      const data = chunk.data
      const status = data?.status
      if (!status) return acc
      return { turnId: data?.turnId ?? acc.turnId, status }
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
        return makeSSEAsyncIterable(conversationId!, token, _ctx?.signal)
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

  // Filter chunks to delay message.append until animation completes
  const filteredChunks = useMemo(() => {
    const processed: StreamedChunk[] = []
    const queued: StreamedChunk[] = []

    for (const chunk of chunks) {
      if (chunk.type === 'message.append') {
        const msg = chunk.data?.message
        if (msg?.role === 'assistant') {
          const hasToolCalls = Array.isArray(msg?.toolCalls) && msg.toolCalls.length > 0
          if (!hasToolCalls) {
            // Check if previous assistant message animation is complete
            // Use LAST computed messages (from previous render) to avoid re-reduction
            const lastAssistantId = getLastAssistantMessageId(lastComputedMessagesRef.current)
            if (lastAssistantId && !isAnimationComplete(lastAssistantId)) {
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
    queuedAppendChunksRef.current = [...queuedAppendChunksRef.current, ...queued]
    processedChunksRef.current = processed

    return processed
  }, [chunksRevisionKey])

  // Process queued chunks when animation completes
  useEffect(() => {
    if (queuedAppendChunksRef.current.length === 0) return

    const processQueued = () => {
      const currentMessages = processedChunksRef.current.reduce(reduceMessages, emptyMessages)
      const lastAssistantId = getLastAssistantMessageId(currentMessages)

      if (!lastAssistantId || isAnimationComplete(lastAssistantId)) {
        // Animation complete, add queued chunks to the query data
        const queued = queuedAppendChunksRef.current.splice(0)
        if (queued.length > 0 && conversationId) {
          queryClient.setQueryData(CONVERSATION_QUERY_KEYS.messages(conversationId), (old: any) => {
            if (!Array.isArray(old)) return old
            return [...old, ...queued]
          })
        }
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

      // Also poll periodically as fallback
      const intervalId = setInterval(() => {
        if (processQueued()) {
          clearInterval(intervalId)
          removePendingAppendCallback(callback)
        }
      }, 100) // Check every 100ms

      return () => {
        clearInterval(intervalId)
        removePendingAppendCallback(callback)
      }
    }
  }, [filteredChunks, conversationId, queryClient])

  // CRITICAL FIX: Incremental message reduction - only process NEW filtered chunks
  // IMPORTANT: Deep copy previous messages to prevent mutation
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

    // CRITICAL: Deep copy previous messages to prevent reducer from mutating them
    const previousMessagesCopy = lastComputedMessagesRef.current.map(msg => ({
      ...msg,
      content: msg.content,
      reasoning: msg.reasoning,
      toolCalls: msg.toolCalls ? [...msg.toolCalls] : undefined,
      fromSnapshot: msg.fromSnapshot,
    }))

    // Apply only new chunks to previous result (incremental)
    const result = newChunks.reduce(reduceMessages, previousMessagesCopy)
    lastComputedMessagesRef.current = result
    lastReducedChunkCountRef.current = currentCount // Update the count!

    return result
  }, [filteredChunks, conversationId])

  const turnState = useMemo<TurnState>(() => chunks.reduce(reduceTurn, { turnId: null, status: null }), [chunksRevisionKey])

  const isAwaitingToolResults = turnState.status === 'waiting_for_tools'
  const isAssistantStreaming = useMemo(() => computedMessages.some(m => m.streaming === true), [computedMessages])
  const turnActive = turnState.status === 'active' || turnState.status === 'waiting_for_tools'
  const isResponding = Boolean(turnActive || isAssistantStreaming)
  const isAwaitingAssistant = Boolean(isResponding && !isAssistantStreaming && !isAwaitingToolResults)

  // When a turn completes, refresh usage + wallet so any header indicators update immediately.
  useEffect(() => {
    if (!conversationId) return
    const s = turnState.status
    if (s === 'completed' || s === 'failed' || s === 'cancelled') {
      queryClient.invalidateQueries({ queryKey: USAGE_QUERY_KEYS.conversationTotals(conversationId) })
      if (starshipId) queryClient.invalidateQueries({ queryKey: WALLET_QUERY_KEYS.detail(starshipId) })
    }
  }, [conversationId, starshipId, turnState.status, queryClient])

  const lastUIAction = useMemo(() => {
    if (!Array.isArray(chunks) || chunks.length === 0) return null
    for (let i = chunks.length - 1; i >= 0; i--) {
      const c: any = chunks[i]
      if (c?.type === 'ui_action') return c.data ?? null
    }
    return null
  }, [chunksRevisionKey])

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
    isStreaming: isResponding,
    isResponding,
    isAssistantStreaming,
    isAwaitingAssistant,
    isAwaitingToolResults,
    hasCompleteEvent: turnState.status === 'completed' || turnState.status === 'failed' || turnState.status === 'cancelled',
    lastUIAction,
    isFetching: messagesQuery.fetchStatus === 'fetching',
    sendMessage: (data: CreateMessageRequest & { conversationId: string }) => sendMessageMutation.mutateAsync(data),
    isSending: sendMessageMutation.isPending,
    refetch: messagesQuery.refetch,
    invalidate: () => {
      if (!conversationId) return Promise.resolve()
      return queryClient.invalidateQueries({ queryKey: CONVERSATION_QUERY_KEYS.messages(conversationId) })
    },
  }
}
