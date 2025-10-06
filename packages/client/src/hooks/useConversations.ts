import api, { getCurrentToken } from '@/lib/api'
import type { ApiResponse, ConversationModel, MessageModel } from '@starships/protocol'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useMemo, useEffect } from 'react'
import { toast } from 'sonner'
import { fetchEventSource } from '@microsoft/fetch-event-source'
import { USAGE_QUERY_KEYS } from '@/hooks/useUsage'

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
}

// Centralized query keys
export const CONVERSATION_QUERY_KEYS = {
  all: ['conversations'] as const,
  lists: () => [...CONVERSATION_QUERY_KEYS.all, 'list'] as const,
  byStarship: (starshipId: string) => [...CONVERSATION_QUERY_KEYS.all, 'starship', starshipId] as const,
  detail: (id: string) => [...CONVERSATION_QUERY_KEYS.all, 'detail', id] as const,
  messages: (conversationId: string) => [...CONVERSATION_QUERY_KEYS.detail(conversationId), 'messages'] as const,
} as const

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
    mutationFn: async (data: { title?: string; starshipId: string; agentId?: string }): Promise<ConversationModel> => {
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
      toast.success('New conversation created successfully!')
    },
    onError: (error: any) => {
      const errorMessage = error?.response?.data?.error || error?.message || 'Failed to create conversation'
      toast.error('Failed to create conversation', {
        description: errorMessage,
      })
    },
  })
}

export function useStarshipConversations(starshipId: string, enabled: boolean = true) {
  return useQuery({
    queryKey: CONVERSATION_QUERY_KEYS.byStarship(starshipId),
    queryFn: async (): Promise<{ conversations: ConversationModel[] }> => {
      const response: FetchResponse<ApiResponse<ConversationModel[]>> = await api.get(`/api/v1/starships/${starshipId}/conversations`)
      return { conversations: response.data.data }
    },
    enabled: !!starshipId && enabled,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
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
      const starshipId = conversationData?.conversation?.starshipId

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

      const errorMessage = error?.response?.data?.error || error?.message || 'Failed to delete conversation'
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
      // Always refetch to ensure consistency
      if (context?.starshipId) {
        queryClient.invalidateQueries({
          queryKey: CONVERSATION_QUERY_KEYS.byStarship(context.starshipId),
        })
      }
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

      const errorMessage = error?.response?.data?.error || error?.message || 'Failed to delete message'
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
      const errorMessage = error?.response?.data?.error || error?.message || 'Failed to update conversation status'
      toast.error('Failed to update status', {
        description: errorMessage,
      })
    },
  })
}

// --- StreamedQuery-based conversation hook (experimental) ---
import { experimental_streamedQuery as streamedQuery } from '@tanstack/react-query'

// Streamed chunk events translated from SSE
type StreamedChunk =
  | { type: 'append'; message: ClientMessage }
  | { type: 'append_chunk'; which: 'content' | 'reasoning'; content: string; position?: number; timestamp?: number }
  | { type: 'replace_tool_calls'; value: any[] }
  | { type: 'replace_content'; value: string }
  | { type: 'replace_reasoning'; value: string }
  | { type: 'update_last_assistant'; fields: Partial<ClientMessage> }
  | { type: 'mark_last_assistant_streaming'; streaming: boolean }
  | { type: 'ui_action'; payload: any }
  | { type: 'complete' }
  | { type: 'error'; error: any }

// Bridge fetch-event-source SSE into an AsyncIterable that yields StreamedChunk events
function makeSSEAsyncIterable(conversationId: string, token: string | null, signal?: AbortSignal, baselineLength?: number): AsyncIterable<StreamedChunk> {
  let url = `/api/v1/conversations/${conversationId}/messages?stream=true`
  if (typeof baselineLength === 'number' && baselineLength >= 0) {
    url += `&baselineLength=${baselineLength}`
  }
  let closed = false

  // Controller to explicitly close SSE on completion or aborts
  const localController = new AbortController()

  // Track if we've seen a complete event (for state tracking, but don't close connection)
  let seenComplete = false

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

  const end = () => {
    if (closed) return
    closed = true
    while (resolvers.length > 0) {
      const resolve = resolvers.shift()!
      resolve({ value: undefined as any, done: true })
    }
  }

  if (signal) {
    // Ensure aborts (e.g., refetch, unmount) close both the iterable and the SSE connection
    const abortBoth = () => {
      end()
      try {
        localController.abort()
      } catch {}
    }
    if (signal.aborted) {
      abortBoth()
    } else {
      signal.addEventListener('abort', abortBoth, { once: true })
    }
  }

  // Start SSE subscription
  fetchEventSource(url, {
    method: 'GET',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    openWhenHidden: true,
    signal: localController.signal,
    async onopen(response) {
      if (!response.ok) {
        push({ type: 'error', error: { status: response.status, statusText: response.statusText } })
      }
    },
    onmessage(event) {
      try {
        if (!event.data) return
        const parsed = JSON.parse(event.data)
        const evt = (event as any).event || null

        switch (evt) {
          case 'message': {
            push({ type: 'append', message: parsed as ClientMessage })
            break
          }
          case 'delta': {
            const raw = parsed || {}
            const op = raw.op
            const path = String(raw.path || '')

            // Support both server-normalized numeric indexes and '-1' placeholders
            const addMessageRe = /^\/messages\/(?:-|\d+)$/i
            const addChunkRe = /^\/messages\/(?:-1|\d+)\/chunks\/-$/i
            const addReasoningChunkRe = /^\/messages\/(?:-1|\d+)\/reasoningChunks\/-$/i
            const replaceToolCallsRe = /^\/messages\/(?:-1|\d+)\/toolCalls$/i
            const replaceContentRe = /^\/messages\/(?:-1|\d+)\/content$/i
            const replaceReasoningRe = /^\/messages\/(?:-1|\d+)\/reasoning$/i
            const replaceIdRe = /^\/messages\/(?:-1|\d+)\/id$/i
            const replaceUpdatedAtRe = /^\/messages\/(?:-1|\d+)\/updatedAt$/i
            const replaceStreamingRe = /^\/messages\/(?:-1|\d+)\/streaming$/i

            // Add assistant/user/tool messages
            if (op === 'add' && addMessageRe.test(path)) {
              push({ type: 'append', message: raw.value as ClientMessage })
              break
            }

            // Stream content chunks
            if (op === 'add' && addChunkRe.test(path)) {
              const v = raw.value || {}
              push({
                type: 'append_chunk',
                which: 'content',
                content: typeof v.content === 'string' ? v.content : '',
                position: typeof v.position === 'number' ? v.position : undefined,
                timestamp: typeof v.timestamp === 'number' ? v.timestamp : Date.now(),
              })
              break
            }

            // Stream reasoning chunks
            if (op === 'add' && addReasoningChunkRe.test(path)) {
              const v = raw.value || {}
              push({
                type: 'append_chunk',
                which: 'reasoning',
                content: typeof v.content === 'string' ? v.content : '',
                position: typeof v.position === 'number' ? v.position : undefined,
                timestamp: typeof v.timestamp === 'number' ? v.timestamp : Date.now(),
              })
              break
            }

            // Replace toolCalls
            if (op === 'replace' && replaceToolCallsRe.test(path)) {
              const value = Array.isArray(raw.value) ? raw.value : []
              push({ type: 'replace_tool_calls', value })
              break
            }

            // Replace content / reasoning
            if (op === 'replace' && replaceContentRe.test(path)) {
              push({ type: 'replace_content', value: typeof raw.value === 'string' ? raw.value : '' })
              break
            }
            if (op === 'replace' && replaceReasoningRe.test(path)) {
              push({ type: 'replace_reasoning', value: typeof raw.value === 'string' ? raw.value : '' })
              break
            }

            // Update id / updatedAt on the last assistant
            if (op === 'replace' && replaceIdRe.test(path)) {
              push({ type: 'update_last_assistant', fields: { id: String(raw.value) } as Partial<ClientMessage> })
              break
            }
            if (op === 'replace' && replaceUpdatedAtRe.test(path)) {
              push({ type: 'update_last_assistant', fields: { updatedAt: String(raw.value) } as Partial<ClientMessage> })
              break
            }

            // Mark streaming flag
            if (op === 'replace' && replaceStreamingRe.test(path) && raw.value === false) {
              push({ type: 'mark_last_assistant_streaming', streaming: false })
              break
            }
            break
          }
          case 'complete': {
            // Ensure we flip streaming=false before completion (UI caret off)
            push({ type: 'mark_last_assistant_streaming', streaming: false })
            push({ type: 'complete' })
            // Mark that we've seen complete, but don't close the connection
            // The connection should stay open for the entire conversation
            seenComplete = true
            break
          }
          case 'ui_action': {
            push({ type: 'ui_action', payload: parsed })
            break
          }
          case 'error': {
            push({ type: 'error', error: parsed })
            break
          }
          default: {
            // ignore 'heartbeat', 'connection', unknown
            break
          }
        }
      } catch (e) {
        push({ type: 'error', error: e })
      }
    },
    onclose() {
      end()
    },
    onerror(err) {
      push({ type: 'error', error: err })
      // Let the stream finish; streamedQuery will treat further chunks/end accordingly
      end()
    },
  })

  return {
    [Symbol.asyncIterator]() {
      return {
        next: () => {
          if (queue.length > 0) {
            const value = queue.shift()!
            return Promise.resolve({ value, done: false })
          }
          if (closed) {
            return Promise.resolve({ value: undefined as any, done: true })
          }
          return new Promise<IteratorResult<StreamedChunk>>(resolve => {
            resolvers.push(resolve)
          })
        },
        return: () => {
          end()
          return Promise.resolve({ value: undefined as any, done: true })
        },
        throw: e => {
          end()
          return Promise.reject(e)
        },
      }
    },
  }
}

// Reducer to fold streamed chunks into a message array
function reduceMessages(acc: ClientMessage[], chunk: StreamedChunk): ClientMessage[] {
  const clone = (arr: ClientMessage[]) => arr.map(m => ({ ...m }) as ClientMessage)
  switch (chunk.type) {
    case 'append': {
      const msg = chunk.message
      if (msg?.id && acc.some(m => m.id === msg.id)) {
        return acc
      }
      return [...acc, { ...msg }]
    }
    case 'append_chunk': {
      const messages = clone(acc)
      // Find last assistant message, prefer streaming=true
      let idx = -1
      for (let i = messages.length - 1; i >= 0; i--) {
        const m = messages[i]
        if (m.role === 'assistant' && (m as any).streaming === true) {
          idx = i
          break
        }
      }
      if (idx === -1) {
        for (let i = messages.length - 1; i >= 0; i--) {
          if (messages[i].role === 'assistant') {
            idx = i
            break
          }
        }
      }
      // If no assistant exists yet, create a shell
      if (idx === -1) {
        const shell: ClientMessage = {
          id: `temp-assistant-${Date.now()}`,
          role: 'assistant',
          content: '',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          messageType: 'agent_response',
          streaming: true,
          chunks: [],
          reasoningChunks: [],
        }
        messages.push(shell)
        idx = messages.length - 1
      }

      const target = { ...(messages[idx] as any) }
      if (chunk.which === 'content') {
        const chunks = Array.isArray(target.chunks) ? [...target.chunks] : []
        chunks.push({
          content: chunk.content,
          position: typeof chunk.position === 'number' ? chunk.position : chunks.length > 0 ? chunks[chunks.length - 1].position + chunk.content.length : 0,
          timestamp: typeof chunk.timestamp === 'number' ? chunk.timestamp : Date.now(),
        })
        target.chunks = chunks
        target.streaming = true
      } else {
        const rChunks = Array.isArray(target.reasoningChunks) ? [...target.reasoningChunks] : []
        rChunks.push({
          content: chunk.content,
          position: typeof chunk.position === 'number' ? chunk.position : rChunks.length > 0 ? rChunks[rChunks.length - 1].position + chunk.content.length : 0,
          timestamp: typeof chunk.timestamp === 'number' ? chunk.timestamp : Date.now(),
        })
        target.reasoningChunks = rChunks
        target.streaming = true
      }

      messages[idx] = target
      return messages as ClientMessage[]
    }
    case 'replace_tool_calls': {
      const messages = clone(acc)
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === 'assistant') {
          ;(messages[i] as any).toolCalls = chunk.value
          break
        }
      }
      return messages
    }
    case 'replace_content': {
      const messages = clone(acc)
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === 'assistant') {
          // Preserve existing streaming flag; server may finalize after streaming=false
          const prev: any = messages[i]
          messages[i] = { ...prev, content: chunk.value } as ClientMessage
          break
        }
      }
      return messages
    }
    case 'replace_reasoning': {
      const messages = clone(acc)
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === 'assistant') {
          // Preserve existing streaming flag
          const prev: any = messages[i]
          messages[i] = { ...prev, reasoning: chunk.value } as ClientMessage
          break
        }
      }
      return messages
    }
    case 'update_last_assistant': {
      const messages = clone(acc)
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === 'assistant') {
          messages[i] = { ...(messages[i] as any), ...(chunk.fields as any) }
          break
        }
      }
      return messages
    }
    case 'mark_last_assistant_streaming': {
      const messages = clone(acc)
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === 'assistant' && (messages[i] as any).streaming) {
          const hasFinal = typeof messages[i].content === 'string' && messages[i].content.trim().length > 0
          const next: any = { ...(messages[i] as any), streaming: false }
          if (hasFinal) {
            next.chunks = undefined
          }
          messages[i] = next
          break
        }
      }
      return messages
    }
    case 'complete':
    case 'error': {
      // no structural change; lifecycle handled by streamedQuery
      return acc
    }
    default:
      return acc
  }
}

/**
 * Pure TanStack Query streaming hook for a conversation
 * Uses experimental_streamedQuery to manage the SSE lifecycle and cache updates.
 */
export function useConversationStreamed(conversationId: string | null) {
  const queryClient = useQueryClient()

  // Compute baselineLength from cached chunks to let the server replay any missed messages on reconnect
  const cachedChunks = conversationId ? (queryClient.getQueryData(CONVERSATION_QUERY_KEYS.messages(conversationId)) as StreamedChunk[] | undefined) : undefined
  const baselineLength = Array.isArray(cachedChunks) ? cachedChunks.reduce(reduceMessages, [] as ClientMessage[]).length : 0

  const messagesQuery = useQuery({
    queryKey: conversationId ? CONVERSATION_QUERY_KEYS.messages(conversationId) : ['__noop__'],
    queryFn: streamedQuery({
      queryFn: async (_ctx: any) => {
        const token = await getCurrentToken()
        return makeSSEAsyncIterable(conversationId!, token, _ctx?.signal, baselineLength)
      },
      refetchMode: 'append',
    }),
    enabled: !!conversationId,
    refetchOnWindowFocus: false,
    staleTime: 0,
    gcTime: 2 * 60 * 1000,
  })

  // Fold streamed chunks into final message array in-memory
  const chunks = (messagesQuery.data as StreamedChunk[]) || []
  const computedMessages = useMemo(() => chunks.reduce(reduceMessages, [] as ClientMessage[]), [chunks])

  // Extract last UI action payload (from 'ui_action' SSE events) for consumers
  const lastUIAction = useMemo(() => {
    if (!Array.isArray(chunks) || chunks.length === 0) return null
    for (let i = chunks.length - 1; i >= 0; i--) {
      const c: any = chunks[i]
      if (c?.type === 'ui_action') return c.payload ?? null
    }
    return null
  }, [chunks])

  // Invalidate usage totals on end-of-turn (SSE 'complete') to update context bar post-turn
  useEffect(() => {
    if (!conversationId || !Array.isArray(chunks) || chunks.length === 0) return
    const last = chunks[chunks.length - 1]
    if (last.type === 'complete') {
      queryClient.invalidateQueries({ queryKey: USAGE_QUERY_KEYS.conversationTotals(conversationId) })
    }
  }, [chunks, conversationId, queryClient])

  // Check if we've received a 'complete' event in the chunk stream
  const hasCompleteEvent = useMemo(() => {
    if (!Array.isArray(chunks) || chunks.length === 0) return false
    for (let i = chunks.length - 1; i >= 0; i--) {
      if (chunks[i].type === 'complete') return true
      // Stop checking once we hit a new 'append' of a user message (new turn started)
      if (chunks[i].type === 'append' && (chunks[i] as any).message?.role === 'user') break
    }
    return false
  }, [chunks])

  // Derived streaming flags - ensure we stop streaming when complete event is received
  const isAssistantStreaming = useMemo(() => {
    if (hasCompleteEvent) return false
    return computedMessages.some(m => (m as any)?.streaming === true)
  }, [computedMessages, hasCompleteEvent])

  // Awaiting assistant = after the last user message, no assistant progress yet and the stream is open
  const isAwaitingAssistant = useMemo(() => {
    // If we've received a complete event, we're no longer awaiting
    if (hasCompleteEvent) return false
    if (!Array.isArray(computedMessages) || computedMessages.length === 0) return false

    let lastUserIdx = -1
    for (let i = computedMessages.length - 1; i >= 0; i--) {
      if (computedMessages[i].role === 'user') {
        lastUserIdx = i
        break
      }
    }
    if (lastUserIdx === -1) return false

    let hasAssistantAfter = false
    let hasAssistantProgress = false
    for (let i = lastUserIdx + 1; i < computedMessages.length; i++) {
      const m: any = computedMessages[i]
      if (m?.role !== 'assistant') continue
      hasAssistantAfter = true
      const hasChunks = Array.isArray(m?.chunks) && m.chunks.length > 0
      const hasRChunks = Array.isArray(m?.reasoningChunks) && m.reasoningChunks.length > 0
      const hasReasoning = typeof m?.reasoning === 'string' && m.reasoning.trim().length > 0
      const hasContent = typeof m?.content === 'string' && m.content.trim().length > 0
      if (hasChunks || hasRChunks || hasReasoning || hasContent) {
        hasAssistantProgress = true
        break
      }
    }

    if (!hasAssistantAfter) return messagesQuery.fetchStatus === 'fetching'
    if (!hasAssistantProgress) return messagesQuery.fetchStatus === 'fetching'
    return false
  }, [computedMessages, messagesQuery.fetchStatus, hasCompleteEvent])

  // Unified responder state for UI (input gating and gap loader)
  const isResponding = isAssistantStreaming || isAwaitingAssistant

  const sendMessageMutation = useMutation({
    mutationFn: async (data: CreateMessageRequest & { conversationId: string }) => {
      const response: FetchResponse<ApiResponse<any>> = await api.post(`/api/v1/conversations/${data.conversationId}/messages`, {
        content: data.content,
      })
      return response.data
    },
    onSuccess: (_res, variables) => {
      // Don't refetch - the SSE stream is already active and will receive new messages automatically
      // Refetching would close the existing connection and open a new one, causing the server
      // to lose the connection while the agent is still broadcasting
    },
    onError: (error: any) => {
      const errorMessage = error?.response?.data?.error || error?.message || 'Failed to send message'
      toast.error('Failed to send message', { description: errorMessage })
    },
  })

  return {
    messages: computedMessages,
    isLoading: messagesQuery.isLoading,
    error: messagesQuery.error,
    // Backwards-compatible: expose responding state as isStreaming
    isStreaming: isResponding,
    // Also expose granular flags
    isResponding,
    isAssistantStreaming,
    isAwaitingAssistant,
    // Expose last UI action payload from SSE
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
