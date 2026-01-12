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
import { experimental_streamedQuery as streamedQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
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
      const response: FetchResponse<ApiResponse<Array<ConversationModel & { agents: AgentModel[] }>>> = await api.get(
        `/api/v1/starships/${starshipId}/conversations`
      )
      return { conversations: response.data.data }
    },
    enabled: !!starshipId && enabled,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
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
    staleTime: 5_000,
    gcTime: 60_000,
    refetchOnWindowFocus: true,
  })
}

// Delete conversation
export function useDeleteConversation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (conversationId: string) => {
      const response: FetchResponse<ApiResponse<any>> = await api.delete(`/api/v1/conversations/${conversationId}`)
      return response.data.data
    },
    onMutate: async conversationId => {
      // Get conversation details to know which starship it belongs to
      const conversationData = queryClient.getQueryData(CONVERSATION_QUERY_KEYS.detail(conversationId)) as any
      let starshipId = conversationData?.conversation?.starshipId

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
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
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
    staleTime: 30 * 1000, // 30 seconds
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

  type TurnState = { turnId: string | null; status: StreamTurnStatus | null }

  type LegacyChunk = { type: 'append'; message: ClientMessage } | { type: 'turn_started'; payload?: { local?: boolean } }
  type StreamErrorChunk = { type: 'error'; error: unknown }
  type StreamedChunk = ConversationStreamEvent | LegacyChunk | StreamErrorChunk

  // Bridge fetch-event-source SSE into an AsyncIterable that yields StreamedChunk events.
  // IMPORTANT: This function does not use React local state; the entire event log lives in TanStack Query cache.
  function makeSSEAsyncIterable(convId: string, token: string | null, signal?: AbortSignal): AsyncIterable<StreamedChunk> {
    const cursorKey = `conv:${convId}:cursor`
    const cursor = typeof window !== 'undefined' ? window.localStorage.getItem(cursorKey) : null
    const url = `/api/v1/conversations/${convId}/messages?stream=true${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/f94efb64-8fc4-4319-97c1-245fc1440b35',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'pre-fix',hypothesisId:'D',location:'useConversations.ts:makeSSEAsyncIterable',message:'SSE connect v2',data:{convId,hasCursor:!!cursor,cursor:cursor?String(cursor).slice(0,32):null,urlHasCursor:!!cursor,url},timestamp:Date.now()})}).catch(()=>{});
    // #endregion

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
        resolve({ value: undefined as any, done: true })
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

          if (eventType === 'stream_debug') {
            // #region agent log
            try {
              const dAny: any = data
              fetch('http://127.0.0.1:7242/ingest/f94efb64-8fc4-4319-97c1-245fc1440b35',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H',location:'useConversations.ts:onmessage:stream_debug',message:'SSE stream_debug received',data:{convId,evId:ev.id||null,cursor:dAny?.cursor??null,lastId:dAny?.lastId??null,len:dAny?.len??null},timestamp:Date.now()})}).catch(()=>{});
            } catch {}
            // #endregion
            return
          }

          if (eventType === 'snapshot') {
            // #region agent log
            try {
              const snapAny: any = data
              const turn = snapAny?.turn ?? null
              const msgs = Array.isArray(snapAny?.messages) ? snapAny.messages : []
              const last = msgs.length > 0 ? msgs[msgs.length - 1] : null
              fetch('http://127.0.0.1:7242/ingest/f94efb64-8fc4-4319-97c1-245fc1440b35',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'pre-fix',hypothesisId:'C',location:'useConversations.ts:onmessage:snapshot',message:'SSE snapshot received',data:{convId,evId:ev.id||null,msgsLen:msgs.length,turnId:turn?.turnId??null,turnStatus:turn?.status??null,lastMsgId:last?.id??null,lastMsgRole:last?.role??null},timestamp:Date.now()})}).catch(()=>{});
            } catch {}
            // #endregion
            push({ type: 'snapshot', data: data as ConversationStreamSnapshot })
            return
          }

          // All other stream events are typed by the shared protocol contract:
          // event name == ConversationStreamEvent['type'], data == ConversationStreamEvent['data']
          if (
            eventType === 'turn.started' ||
            eventType === 'turn.status' ||
            eventType === 'assistant.delta' ||
            eventType === 'assistant.reasoning_delta' ||
            eventType === 'message.append' ||
            eventType === 'ui_action'
          ) {
            // #region agent log
            try {
              const dAny: any = data
              const msgId = (eventType === 'assistant.delta' || eventType === 'assistant.reasoning_delta') ? (dAny?.messageId ?? null) : null
              const turnId = (eventType === 'assistant.delta' || eventType === 'assistant.reasoning_delta' || eventType === 'turn.started' || eventType === 'turn.status') ? (dAny?.turnId ?? null) : null
              const deltaLen = (eventType === 'assistant.delta' || eventType === 'assistant.reasoning_delta') ? (typeof dAny?.delta === 'string' ? dAny.delta.length : null) : null
              fetch('http://127.0.0.1:7242/ingest/f94efb64-8fc4-4319-97c1-245fc1440b35',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'pre-fix',hypothesisId:'A',location:'useConversations.ts:onmessage:event',message:'SSE event received',data:{convId,evId:ev.id||null,eventType,turnId,msgId,deltaLen},timestamp:Date.now()})}).catch(()=>{});
            } catch {}
            // #endregion
            push({ type: eventType as ConversationStreamEvent['type'], data } as ConversationStreamEvent)
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
            if (closed) return Promise.resolve({ value: undefined as any, done: true })
            return new Promise<IteratorResult<StreamedChunk>>(resolve => resolvers.push(resolve))
          },
          return: () => {
            cleanup('manual')
            return Promise.resolve({ value: undefined as any, done: true })
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

  function reduceMessages(acc: ClientMessage[], chunk: StreamedChunk): ClientMessage[] {
    const clone = (arr: ClientMessage[]) => arr.map(m => ({ ...m }) as ClientMessage)
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
      // NOTE: Some local/legacy chunks used `payload` instead of `data`.
      const status: any = (chunk as any)?.data?.status ?? (chunk as any)?.payload?.status
      if (status === 'completed' || status === 'failed' || status === 'cancelled') {
        return acc.map(m => (m.streaming ? withStreaming(m, false) : m))
      }
      return acc
    }

    if (chunk.type === 'snapshot') {
      const msgs = Array.isArray(chunk.data.messages) ? (chunk.data.messages as ClientMessage[]) : []
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
        return withStreaming(m, shouldStream)
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

      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/f94efb64-8fc4-4319-97c1-245fc1440b35',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'pre-fix',hypothesisId:'C',location:'useConversations.ts:reduceMessages:snapshot',message:'reduceMessages applied snapshot',data:{convId:conversationId||null,accLen:acc.length,snapLen:snap.length,mergedLen:merged.length,keptFromAcc,isActiveTurn:!!isActiveTurn,turnId:turn?.turnId??null,turnStatus:turn?.status??null},timestamp:Date.now()})}).catch(()=>{});
      // #endregion

      return merged
    }

    if (chunk.type === 'append') {
      return reduceMessages(acc, {
        type: 'message.append',
        data: { conversationId: conversationId || '', message: chunk.message },
      } as ConversationStreamEvent)
    }

    if (chunk.type === 'message.append') {
      const msg = chunk.data.message as ClientMessage
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
          const hasToolCalls = Array.isArray((msg as any)?.toolCalls) && (msg as any).toolCalls.length > 0
          const hasContent = typeof msg.content === 'string' && msg.content.trim().length > 0
          const willReplaceStreamPlaceholder = !(hasToolCalls && !hasContent)

          // #region agent log
          try {
            fetch('http://127.0.0.1:7242/ingest/f94efb64-8fc4-4319-97c1-245fc1440b35',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'post-fix',hypothesisId:'J',location:'useConversations.ts:reduceMessages:message_append:streamPlaceholder',message:'message.append saw stream placeholder',data:{convId:conversationId||null,msgId:String(msg.id),msgTurnId,streamId,streamIdx:idx,hasToolCalls,hasContent,action:willReplaceStreamPlaceholder?'replace_stream_placeholder':'keep_stream_placeholder'},timestamp:Date.now()})}).catch(()=>{});
          } catch {}
          // #endregion

          // IMPORTANT:
          // During a turn with tool calls, the server can append an assistant "tool-call message"
          // (toolCalls present, content often empty) while *still* streaming deltas into `stream-<turnId>`.
          // If we replace the stream placeholder with the tool-call message, subsequent deltas no longer
          // find `stream-<turnId>` and we recreate shells → duplicated/out-of-order chunks until the final append.
          if (willReplaceStreamPlaceholder) {
            messages[idx] = withStreaming(msg, false)
            return messages
          }
          // Keep the stream placeholder; allow this tool-call message to be appended separately below.
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
      // #region agent log
      try {
        const occurrences = messages.reduce((n, m) => (m?.id === messageId ? n + 1 : n), 0)
        fetch('http://127.0.0.1:7242/ingest/f94efb64-8fc4-4319-97c1-245fc1440b35',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'pre-fix',hypothesisId:'I',location:'useConversations.ts:reduceMessages:assistant_delta:occurrences',message:'assistant delta occurrences check',data:{convId:conversationId||null,chunkType:chunk.type,messageId,occurrences,messagesLen:messages.length},timestamp:Date.now()})}).catch(()=>{});
      } catch {}
      // #endregion
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
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/f94efb64-8fc4-4319-97c1-245fc1440b35',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'pre-fix',hypothesisId:'E',location:'useConversations.ts:reduceMessages:assistant_delta:newShell',message:'assistant delta created new shell (messageId not in current messages)',data:{convId:conversationId||null,chunkType:chunk.type,messageId,deltaLen:typeof delta==='string'?delta.length:null,turnId:(chunk as any)?.data?.turnId??null,existingMsgIdsTail:messages.slice(-3).map(m=>String(m.id))},timestamp:Date.now()})}).catch(()=>{});
        // #endregion
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
        } as ClientMessage
        return [...messages, shell]
      }
      const cur: ClientMessage = { ...(messages[idx] as ClientMessage) }
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/f94efb64-8fc4-4319-97c1-245fc1440b35',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'pre-fix',hypothesisId:'A',location:'useConversations.ts:reduceMessages:assistant_delta:append',message:'assistant delta appended to existing message',data:{convId:conversationId||null,chunkType:chunk.type,messageId,idx,deltaLen:typeof delta==='string'?delta.length:null,beforeLen:(chunk.type==='assistant.delta'?String(cur.content||'').length:String(cur.reasoning||'').length),turnId:(chunk as any)?.data?.turnId??null},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      cur.updatedAt = now
      cur.streaming = true
      if (chunk.type === 'assistant.delta') cur.content = String(cur.content || '') + delta
      else cur.reasoning = String(cur.reasoning || '') + delta
      messages[idx] = cur
      return messages
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
      // NOTE: Some local/legacy chunks used `payload` instead of `data`.
      const data: any = (chunk as any)?.data ?? (chunk as any)?.payload
      const status: any = data?.status
      if (!status) return acc
      return { turnId: data?.turnId ?? acc.turnId, status }
    }
    // Back-compat for local pre-seed
    if (chunk.type === 'turn_started' && chunk.payload?.local === true) {
      return { turnId: acc.turnId ?? 'pending', status: 'active' }
    }
    return acc
  }

  const messagesQuery = useQuery({
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

  const chunks = (messagesQuery.data as StreamedChunk[]) || []
  const chunksLen = Array.isArray(chunks) ? chunks.length : 0
  const lastChunkAny: any = chunksLen > 0 ? (chunks as any)[chunksLen - 1] : null
  const lastChunkSig = lastChunkAny?.type ? String(lastChunkAny.type) : 'none'
  const chunksRevisionKey = `${chunksLen}|${lastChunkSig}`

  // Queue for message.append chunks that are delayed due to animation
  const queuedAppendChunksRef = useRef<StreamedChunk[]>([])
  const processedChunksRef = useRef<StreamedChunk[]>([])

  // Filter chunks to delay message.append until animation completes
  const filteredChunks = useMemo(() => {
    const processed: StreamedChunk[] = []
    const queued: StreamedChunk[] = []

    for (const chunk of chunks) {
      if (chunk.type === 'message.append') {
        const msg = (chunk as any).data?.message
        if (msg?.role === 'assistant') {
          const hasToolCalls = Array.isArray(msg?.toolCalls) && msg.toolCalls.length > 0
          if (!hasToolCalls) {
            // Check if previous assistant message animation is complete
            const currentMessages = processed.reduce(reduceMessages, [] as ClientMessage[])
            const lastAssistantId = getLastAssistantMessageId(currentMessages)
            if (lastAssistantId && !isAnimationComplete(lastAssistantId)) {
              // #region agent log
              fetch('http://127.0.0.1:7242/ingest/f94efb64-8fc4-4319-97c1-245fc1440b35',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'pre-fix',hypothesisId:'B',location:'useConversations.ts:filteredChunks:queueAppend',message:'Queued assistant message.append waiting for animation complete',data:{convId:conversationId||null,queuedMsgId:msg?.id??null,lastAssistantId,hasToolCalls:false,isLastAssistantAnimationComplete:false},timestamp:Date.now()})}).catch(()=>{});
              // #endregion
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
      const currentMessages = processedChunksRef.current.reduce(reduceMessages, [] as ClientMessage[])
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

  const computedMessages = useMemo(() => filteredChunks.reduce(reduceMessages, [] as ClientMessage[]), [filteredChunks])
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
