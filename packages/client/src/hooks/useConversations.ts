import api, { getCurrentToken } from '@/lib/api'
import type { ApiResponse, ConversationModel, MessageModel } from '@starships/protocol'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useMemo, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { fetchEventSource } from '@microsoft/fetch-event-source'
import { USAGE_QUERY_KEYS } from '@/hooks/useUsage'
import { WALLET_QUERY_KEYS } from '@/hooks/useWallet'
import { getSafeErrorMessage } from '@/lib/error-utils'

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
      console.log('[STOP] Starting stop for conversation', conversationId)

      try {
        // Abort SSE locally
        await queryClient.cancelQueries({ queryKey: CONVERSATION_QUERY_KEYS.messages(conversationId) })
        console.log('[STOP] Cancelled queries')
      } catch (err) {
        console.warn('[STOP] Error cancelling queries', err)
      }

      // Capture existing chunks BEFORE removing so we can preserve them
      const existingChunks = (queryClient.getQueryData(CONVERSATION_QUERY_KEYS.messages(conversationId)) as StreamedChunk[] | undefined) || []
      console.log('[STOP] Captured existing chunks:', existingChunks.length, 'chunks')

      try {
        // Signal server to persist partials and cancel autopilot
        await api.post(`/api/v1/conversations/${conversationId}/stop`)
        console.log('[STOP] Server stop endpoint called')
      } catch (error: any) {
        const msg = getSafeErrorMessage(error)
        console.error('[STOP] Server stop failed', error)
        toast.error('Failed to stop response', { description: msg })
        return
      }

      try {
        // Optimistically flip streaming off and mark complete in local cache so UI hides Stop immediately
        // IMPORTANT: Don't remove queries or invalidate - this causes refetch that loads persisted messages
        // which can include duplicates or complete messages that were persisted after stop
        queryClient.setQueryData(CONVERSATION_QUERY_KEYS.messages(conversationId), (old: any[] | undefined) => {
          const chunks = Array.isArray(old) ? old.slice() : []
          chunks.push({ type: 'mark_last_assistant_streaming', streaming: false })
          chunks.push({ type: 'complete' })
          chunks.push({ type: 'turn_completed', payload: { conversationId, at: new Date().toISOString() } })
          return chunks
        })

        // Best-effort: drop resume token so we don't resume a stale turn
        try {
          if (typeof window !== 'undefined') window.localStorage.removeItem(`conv:${conversationId}:resumeToken`)
        } catch {}

        // CRITICAL: Don't remove queries or invalidate - the server will send turn_completed via SSE
        // Removing/invalidating causes a refetch that loads persisted messages, which can be duplicates
        // or complete messages that were persisted after stop was called
      } catch {}
    },
    [queryClient]
  )
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
  | { type: 'replace_whole_message'; message: ClientMessage }
  | { type: 'ui_action'; payload: any }
  | { type: 'turn_state'; payload: any }
  | { type: 'turn_started'; payload?: any }
  | { type: 'turn_completed'; payload?: any }
  | { type: 'complete' }
  | { type: 'error'; error: any }

// Bridge fetch-event-source SSE into an AsyncIterable that yields StreamedChunk events
function makeSSEAsyncIterable(conversationId: string, token: string | null, signal?: AbortSignal, baselineLength?: number): AsyncIterable<StreamedChunk> {
  let url = `/api/v1/conversations/${conversationId}/messages?stream=true`
  // Attach resume token only when client has a non-zero baseline to avoid empty reloads skipping history
  try {
    const rt = typeof window !== 'undefined' ? window.localStorage.getItem(`conv:${conversationId}:resumeToken`) : null
    if (rt && typeof baselineLength === 'number' && baselineLength > 0) {
      url += `&resumeToken=${encodeURIComponent(rt)}`
    }
  } catch {}
  if (typeof baselineLength === 'number' && baselineLength >= 0) {
    url += `&baselineLength=${baselineLength}`
  }
  let closed = false

  const controller = new AbortController()

  // SIMPLE FIX: Auto-cleanup after 5 minutes to prevent resource leaks
  const timeoutId = setTimeout(
    () => {
      controller.abort()
    },
    5 * 60 * 1000
  )

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

  const cleanup = () => {
    if (closed) return
    closed = true
    clearTimeout(timeoutId)
    controller.abort()
    while (resolvers.length > 0) {
      const resolve = resolvers.shift()!
      resolve({ value: undefined as any, done: true })
    }
    queue.length = 0 // Clear queue to prevent memory leaks
  }

  // SIMPLE FIX: Combine signals properly
  const combinedSignal = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal

  if (signal?.aborted) {
    cleanup()
  } else if (signal) {
    signal.addEventListener('abort', cleanup, { once: true })
  }

  // Start SSE subscription
  fetchEventSource(url, {
    method: 'GET',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    openWhenHidden: true,
    signal: combinedSignal,
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
            const replaceWholeRe = /^\/messages\/(?:-1|\d+)$/i

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

            // Replace whole last message (server persisted final)
            if (op === 'replace' && replaceWholeRe.test(path)) {
              const value = raw.value as ClientMessage
              push({ type: 'replace_whole_message', message: value })
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
            break
          }
          case 'ui_action': {
            push({ type: 'ui_action', payload: parsed })
            break
          }
          case 'turn_state': {
            push({ type: 'turn_state', payload: parsed })
            break
          }
          case 'turn_started': {
            push({ type: 'turn_started', payload: parsed })
            break
          }
          case 'turn_completed': {
            push({ type: 'turn_completed', payload: parsed })
            break
          }
          case 'resume_token': {
            try {
              if (typeof window !== 'undefined') {
                window.localStorage.setItem(`conv:${conversationId}:resumeToken`, String(parsed))
              }
            } catch {}
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
      cleanup()
    },
    onerror(err) {
      push({ type: 'error', error: err })
      cleanup()
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
          cleanup()
          return Promise.resolve({ value: undefined as any, done: true })
        },
        throw: e => {
          cleanup()
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
      const messages = clone(acc)
      // If we optimistically added a temp user message (on send), replace it with the
      // server-persisted user message when it arrives to avoid duplicates.
      try {
        if (msg?.role === 'user' && messages.length > 0) {
          const last: any = messages[messages.length - 1]
          const lastIsTempUser = typeof last?.id === 'string' && last.id.startsWith('temp-user-')
          const sameContent = typeof last?.content === 'string' && typeof (msg as any)?.content === 'string' && last.content === (msg as any).content
          const lastTs = Date.parse(String(last?.createdAt || last?.updatedAt || ''))
          const msgTs = Date.parse(String((msg as any)?.createdAt || (msg as any)?.updatedAt || ''))
          const tsOk = !Number.isNaN(lastTs) && !Number.isNaN(msgTs) ? Math.abs(msgTs - lastTs) <= 30_000 : true
          if (lastIsTempUser && sameContent && tsOk) {
            messages[messages.length - 1] = { ...msg }
            return messages
          }
        }
      } catch {}
      if (msg?.id && messages.some(m => m.id === msg.id)) {
        return messages
      }
      // If a streaming placeholder exists at the end, drop it before appending a persisted assistant message.
      if (msg?.role === 'assistant' && messages.length > 0 && messages[messages.length - 1].role === 'assistant' && (messages[messages.length - 1] as any).streaming) {
        messages.pop()
      }
      return [...messages, { ...msg }]
    }
    case 'replace_whole_message': {
      const messages = clone(acc)
      const incoming: any = { ...(chunk.message as any) }

      const normalizeAssistantFinal = (msg: any) => {
        const next = { ...msg }
        next.streaming = false
        if (typeof next.content === 'string' && next.content.trim().length > 0) {
          next.chunks = undefined
        }
        return next
      }

      // Prefer replacing by id when present (stable even if the last message changes).
      if (typeof incoming?.id === 'string') {
        const idx = messages.findIndex((m: any) => m?.id === incoming.id)
        if (idx !== -1) {
          messages[idx] = (incoming.role === 'assistant' ? normalizeAssistantFinal(incoming) : incoming) as ClientMessage
          return messages
        }
      }

      // Fallback: replace the last message in the list.
      if (messages.length === 0) {
        return [(incoming.role === 'assistant' ? normalizeAssistantFinal(incoming) : incoming) as ClientMessage]
      }
      messages[messages.length - 1] = (incoming.role === 'assistant' ? normalizeAssistantFinal(incoming) : incoming) as ClientMessage
      return messages
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
        const nextPosition = typeof chunk.position === 'number' ? chunk.position : chunks.length > 0 ? chunks[chunks.length - 1].position + chunk.content.length : 0
        const nextTimestamp = typeof chunk.timestamp === 'number' ? chunk.timestamp : Date.now()
        chunks.push({ content: chunk.content, position: nextPosition, timestamp: nextTimestamp })
        target.chunks = chunks
        target.streaming = true
      } else {
        const rChunks = Array.isArray(target.reasoningChunks) ? [...target.reasoningChunks] : []
        const nextPosition = typeof chunk.position === 'number' ? chunk.position : rChunks.length > 0 ? rChunks[rChunks.length - 1].position + chunk.content.length : 0
        const nextTimestamp = typeof chunk.timestamp === 'number' ? chunk.timestamp : Date.now()
        rChunks.push({ content: chunk.content, position: nextPosition, timestamp: nextTimestamp })
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
export function useConversationStreamed(conversationId: string | null, starshipId?: string | null, options?: { enabled?: boolean }) {
  const queryClient = useQueryClient()

  // Compute baselineLength from cached chunks to let the server replay any missed messages on reconnect
  const cachedChunks = conversationId ? (queryClient.getQueryData(CONVERSATION_QUERY_KEYS.messages(conversationId)) as StreamedChunk[] | undefined) : undefined
  const baselineLength = Array.isArray(cachedChunks) ? cachedChunks.reduce(reduceMessages, [] as ClientMessage[]).length : 0

  const enabledFlag = options?.enabled !== false

  const messagesQuery = useQuery({
    queryKey: conversationId ? CONVERSATION_QUERY_KEYS.messages(conversationId) : ['__noop__'],
    queryFn: streamedQuery({
      queryFn: async (_ctx: any) => {
        const token = await getCurrentToken()
        return makeSSEAsyncIterable(conversationId!, token, _ctx?.signal, baselineLength)
      },
      refetchMode: 'append',
    }),
    enabled: !!conversationId && enabledFlag,
    refetchOnWindowFocus: false,
    staleTime: 0,
    gcTime: 2 * 60 * 1000,
  })

  // Fold streamed chunks into final message array in-memory.
  //
  // IMPORTANT: Some streaming/query implementations may mutate the underlying `chunks` array in-place
  // (same reference, new length/content). If we memoize purely on `[chunks]`, derived state can go stale,
  // causing loader state flicker (especially visible during route transitions).
  //
  // To make derived state robust, build a small "revision key" from length + last-chunk signature and
  // memoize on that instead.
  const chunks = (messagesQuery.data as StreamedChunk[]) || []
  const chunksLen = Array.isArray(chunks) ? chunks.length : 0
  const lastChunkAny: any = chunksLen > 0 ? (chunks as any)[chunksLen - 1] : null
  const lastChunkSig =
    lastChunkAny?.type === 'append' ? `append:${String(lastChunkAny?.message?.role || '')}:${String(lastChunkAny?.message?.id || '')}` : lastChunkAny?.type ? String(lastChunkAny.type) : 'none'
  const chunksRevisionKey = `${chunksLen}|${lastChunkSig}`

  // CRITICAL FIX: Depend on chunks array directly, not just revision key
  // The revision key might not change when chunks are updated in place or when
  // intermediate chunks change but the last chunk stays the same
  const computedMessages = useMemo(() => {
    if (!Array.isArray(chunks) || chunks.length === 0) return []
    return chunks.reduce(reduceMessages, [] as ClientMessage[])
  }, [chunks, chunksRevisionKey])

  // Detect if current session has any live streaming signals (placeholder or deltas)
  const hasLiveStreamHint = useMemo(() => {
    if (!Array.isArray(chunks) || chunks.length === 0) return false
    for (let i = chunks.length - 1; i >= 0; i--) {
      const c: any = chunks[i]
      if (!c) continue
      if (
        c.type === 'append_chunk' ||
        c.type === 'replace_content' ||
        c.type === 'replace_reasoning' ||
        c.type === 'replace_tool_calls' ||
        c.type === 'update_last_assistant' ||
        c.type === 'mark_last_assistant_streaming'
      ) {
        return true
      }
      if (c.type === 'append' && c.message && c.message.role === 'assistant' && (c.message as any).streaming === true) {
        return true
      }
    }
    return false
  }, [chunksRevisionKey])

  // Track the start of the latest user turn and cap the pre-stream indicator duration.
  //
  // IMPORTANT:
  // We seed a local `turn_started` chunk to keep the UI in a "responding" state during the
  // create-conversation -> route transition. Some turns can legitimately take >7s before
  // the first assistant tokens arrive (cold start, tool warm-up, upstream latency).
  //
  // If we expire too aggressively, the loader/stop state flickers off mid-turn and never comes
  // back until content arrives, which looks like the agent is "not typing" even though it is.
  const lastUserSerial = useMemo(() => {
    if (!Array.isArray(computedMessages) || computedMessages.length === 0) return null
    for (let i = computedMessages.length - 1; i >= 0; i--) {
      const m = computedMessages[i]
      if (m.role === 'user') {
        return String(m.id || m.createdAt || i)
      }
    }
    return null
  }, [computedMessages])

  // Max time we allow the UI to show "awaiting assistant" before first tokens arrive.
  // This is a safety valve to avoid an infinite loader if a turn gets stuck.
  const PRE_STREAM_MAX_MS = 60_000

  const [preStreamExpired, setPreStreamExpired] = useState(false)
  useEffect(() => {
    if (!lastUserSerial) {
      setPreStreamExpired(false)
      return
    }
    setPreStreamExpired(false)
    const t = setTimeout(() => setPreStreamExpired(true), PRE_STREAM_MAX_MS)
    return () => clearTimeout(t)
    // Reset the expiry timer when *any* new stream chunk arrives for the same turn (e.g. turn_state).
  }, [lastUserSerial, chunksRevisionKey])

  // Extract last UI action payload (from 'ui_action' SSE events) for consumers
  const lastUIAction = useMemo(() => {
    if (!Array.isArray(chunks) || chunks.length === 0) return null
    for (let i = chunks.length - 1; i >= 0; i--) {
      const c: any = chunks[i]
      if (c?.type === 'ui_action') return c.payload ?? null
    }
    return null
  }, [chunksRevisionKey])

  // Invalidate usage totals when a turn completes.
  // Robust across both legacy 'complete' and newer 'turn_completed' SSE events.
  useEffect(() => {
    if (!conversationId || !Array.isArray(chunks) || chunks.length === 0) return
    const last = chunks[chunks.length - 1]
    if (last.type === 'turn_completed') {
      // Clear resume token once a new user message arrives (not here). Keep it for seamless reconnection between chunks.
      // Refresh usage totals for this conversation
      queryClient.invalidateQueries({ queryKey: USAGE_QUERY_KEYS.conversationTotals(conversationId) })
      // Also refresh starship-level totals and wallet balance if starshipId is provided
      if (starshipId) {
        queryClient.invalidateQueries({ queryKey: USAGE_QUERY_KEYS.starshipTotals(starshipId) })
        queryClient.invalidateQueries({ queryKey: WALLET_QUERY_KEYS.detail(starshipId) })
      }
    }
  }, [chunksRevisionKey, conversationId, starshipId, queryClient])

  // Check if we've received a 'turn_completed' event in the chunk stream
  const hasCompleteEvent = useMemo(() => {
    if (!Array.isArray(chunks) || chunks.length === 0) {
      console.log('[STREAM] hasCompleteEvent: false (no chunks)')
      return false
    }
    for (let i = chunks.length - 1; i >= 0; i--) {
      if (chunks[i].type === 'turn_completed') {
        console.log('[STREAM] hasCompleteEvent: true (found turn_completed at index', i, 'of', chunks.length, 'chunks)')
        return true
      }
      // Stop checking once we hit a new 'append' of a user message (new turn started)
      if (chunks[i].type === 'append' && (chunks[i] as any).message?.role === 'user') break
    }
    console.log('[STREAM] hasCompleteEvent: false (no turn_completed found in', chunks.length, 'chunks)')
    return false
  }, [chunksRevisionKey])

  // Server-authoritative turn state: derive from latest turn_* or turn_state events
  // IMPORTANT: Only consider turn events that come AFTER the last user message to avoid
  // using stale turn state from a previous turn (e.g., after stopping and sending a new message)
  const serverTurnActive = useMemo(() => {
    if (!Array.isArray(chunks) || chunks.length === 0) {
      console.log('[STREAM] serverTurnActive: false (no chunks)')
      return false
    }
    // Find the index of the last user message to only consider events after it
    let lastUserMessageIdx = -1
    for (let i = chunks.length - 1; i >= 0; i--) {
      const c: any = chunks[i]
      if (c?.type === 'append' && c?.message?.role === 'user') {
        lastUserMessageIdx = i
        break
      }
    }

    // Scan backwards from the end, but only consider events after the last user message
    for (let i = chunks.length - 1; i >= 0; i--) {
      // Stop if we've gone past the last user message (only consider events in the current turn)
      if (lastUserMessageIdx >= 0 && i < lastUserMessageIdx) {
        break
      }

      const c: any = chunks[i]
      if (!c) continue
      if (c.type === 'turn_started') {
        console.log('[STREAM] serverTurnActive: true (found turn_started at index', i, 'after last user at', lastUserMessageIdx, ')')
        return true
      }
      if (c.type === 'turn_completed') {
        console.log('[STREAM] serverTurnActive: false (found turn_completed at index', i, 'after last user at', lastUserMessageIdx, ')')
        return false
      }
      if (c.type === 'turn_state') {
        const active = Boolean(c.payload?.turnActive)
        console.log('[STREAM] serverTurnActive:', active, '(found turn_state at index', i, 'after last user at', lastUserMessageIdx, ')')
        return active
      }
    }
    console.log('[STREAM] serverTurnActive: false (no turn events found after last user at', lastUserMessageIdx, 'in', chunks.length, 'chunks)')
    return false
  }, [chunksRevisionKey])

  // Heuristic: detect if there's already a non-streaming assistant message after the last user message.
  // This protects against edge cases where turn lifecycle events are missing or out-of-order on reconnect.
  const hasFinalAssistantAfterLastUser = useMemo(() => {
    if (!Array.isArray(computedMessages) || computedMessages.length === 0) return false

    let lastUserIdx = -1
    for (let i = computedMessages.length - 1; i >= 0; i--) {
      if (computedMessages[i].role === 'user') {
        lastUserIdx = i
        break
      }
    }
    if (lastUserIdx === -1) return false

    for (let i = computedMessages.length - 1; i > lastUserIdx; i--) {
      const m: any = computedMessages[i]
      if (!m || m.role !== 'assistant') continue
      // If any assistant after the last user is still streaming, we are not done yet.
      if (m.streaming) return false
      const content = typeof m.content === 'string' ? m.content : ''
      if (content.trim().length > 0) {
        return true
      }
    }

    return false
  }, [computedMessages])

  // Derived streaming flags - ensure we stop streaming when complete event is received
  const isAssistantStreaming = useMemo(() => {
    if (hasCompleteEvent) return false
    return computedMessages.some(m => (m as any)?.streaming === true)
  }, [computedMessages, hasCompleteEvent])

  // Local pending-turn signal: we seed a local `turn_started` during the create->route-change gap.
  // Some servers emit `turn_state.turnActive=false` until the agent actually starts; if we follow that
  // strictly, the UI "responding" state flickers off. This keeps responding ON for a short window
  // after a locally-initiated send, until streaming begins or the timeout expires.
  const localTurnPendingActive = useMemo(() => {
    if (!Array.isArray(chunks) || chunks.length === 0) return false
    if (preStreamExpired) return false
    // If we've already received a completion event for the current turn window, do not keep pending.
    if (hasCompleteEvent) return false
    // If assistant already finalized for the last user, do not keep pending.
    if (hasFinalAssistantAfterLastUser) return false
    // If assistant is streaming, the normal path will handle responding.
    if (isAssistantStreaming) return false

    // Find the index of the last user message to only consider events after it
    let lastUserMessageIdx = -1
    for (let i = chunks.length - 1; i >= 0; i--) {
      const c: any = chunks[i]
      if (c?.type === 'append' && c?.message?.role === 'user') {
        lastUserMessageIdx = i
        break
      }
    }

    // Scan backwards until we reach the most recent *server* turn completion or the last user message.
    // This works even if the server appends the user message after we seeded the local turn_started.
    // (The previous logic broke early on the user append and missed the local marker.)
    const maxScan = Math.min(chunks.length, 250)
    for (let n = 1; n <= maxScan; n++) {
      const idx = chunks.length - n
      // Stop if we've gone past the last user message (only consider events in the current turn)
      if (lastUserMessageIdx >= 0 && idx < lastUserMessageIdx) {
        break
      }

      const c: any = chunks[idx]
      if (!c) continue
      if (c.type === 'turn_completed') return false
      if (c.type === 'turn_started' && c.payload?.local === true) return true
    }
    return false
  }, [chunksRevisionKey, preStreamExpired, hasCompleteEvent, hasFinalAssistantAfterLastUser, isAssistantStreaming])

  // Awaiting tool results: detect in-flight tool calls after the last user message that do not yet
  // have corresponding tool_result/tool role messages. This is part of the same turn and should keep
  // the input in a loading state even if the assistant isn't currently streaming text.
  const isAwaitingToolResults = useMemo(() => {
    try {
      if (!Array.isArray(computedMessages) || computedMessages.length === 0) return false
      if (hasCompleteEvent) return false

      let lastUserIdx = -1
      for (let i = computedMessages.length - 1; i >= 0; i--) {
        if ((computedMessages[i] as any)?.role === 'user') {
          lastUserIdx = i
          break
        }
      }
      if (lastUserIdx === -1) return false

      // Build a set of tool result ids present after the last user.
      const toolResultIds = new Set<string>()
      for (let i = lastUserIdx + 1; i < computedMessages.length; i++) {
        const m: any = computedMessages[i]
        if (!m) continue
        const isToolResult = m?.messageType === 'tool_result' || m?.role === 'tool'
        if (!isToolResult) continue
        const rid = m?.toolCallId ?? m?.call_id ?? m?.id
        if (rid != null) toolResultIds.add(String(rid))
      }

      // If any assistant tool call after the last user lacks a result, we are awaiting tools.
      for (let i = lastUserIdx + 1; i < computedMessages.length; i++) {
        const m: any = computedMessages[i]
        if (!m || m.role !== 'assistant') continue
        const calls = Array.isArray(m.toolCalls) ? (m.toolCalls as any[]) : []
        if (calls.length === 0) continue
        for (const tc of calls) {
          const id = tc?.id ?? tc?.call_id ?? tc?.toolCallId ?? tc?.function?.id
          if (id == null) continue
          if (!toolResultIds.has(String(id))) {
            return true
          }
        }
      }
      return false
    } catch {
      return false
    }
  }, [computedMessages, hasCompleteEvent])

  // Check if there's any assistant message (complete or incomplete) after the last user message
  // IMPORTANT: Check both chunks (for real-time updates) and computedMessages (for final state)
  // This ensures we detect assistant messages even during streaming or when chunks are being processed
  const hasAnyAssistantAfterLastUser = useMemo(() => {
    // First, check chunks directly for immediate detection (catches messages during streaming)
    // This is critical because computedMessages might lag behind chunk updates
    if (Array.isArray(chunks) && chunks.length > 0) {
      let lastUserChunkIdx = -1
      // Find the last user message in chunks
      for (let i = chunks.length - 1; i >= 0; i--) {
        const c: any = chunks[i]
        if (c?.type === 'append' && c?.message?.role === 'user') {
          lastUserChunkIdx = i
          break
        }
      }
      // Check if there's any assistant-related chunk after the last user
      if (lastUserChunkIdx >= 0) {
        for (let i = lastUserChunkIdx + 1; i < chunks.length; i++) {
          const c: any = chunks[i]
          // Check for assistant message append (new message created)
          if (c?.type === 'append' && c?.message?.role === 'assistant') {
            return true
          }
          // Check for assistant content chunks (streaming in progress)
          if (c?.type === 'append_chunk' || c?.type === 'replace_content' || c?.type === 'replace_reasoning') {
            return true
          }
          // Check for whole message replacement (final persisted message)
          if (c?.type === 'replace_whole_message' && c?.message?.role === 'assistant') {
            return true
          }
          // Check for assistant message updates (id, updatedAt, etc.)
          if (c?.type === 'update_last_assistant') {
            return true
          }
        }
      }
    }

    // Fallback: check computedMessages for final state (catches cases where chunks were processed)
    if (Array.isArray(computedMessages) && computedMessages.length > 0) {
      let lastUserIdx = -1
      for (let i = computedMessages.length - 1; i >= 0; i--) {
        if (computedMessages[i].role === 'user') {
          lastUserIdx = i
          break
        }
      }
      if (lastUserIdx >= 0) {
        // Check if there's any assistant message after the last user (even if incomplete)
        for (let i = lastUserIdx + 1; i < computedMessages.length; i++) {
          if (computedMessages[i].role === 'assistant') {
            return true
          }
        }
      }
    }
    return false
  }, [chunksRevisionKey, computedMessages])

  // Track when turn_started was received to implement timeout for stuck states
  const turnStartedTime = useMemo(() => {
    if (!Array.isArray(chunks) || chunks.length === 0) return null
    for (let i = chunks.length - 1; i >= 0; i--) {
      const c: any = chunks[i]
      if (c?.type === 'turn_started') {
        // Check if this turn_started is after the last user message
        let lastUserIdx = -1
        for (let j = i - 1; j >= 0; j--) {
          const prevC: any = chunks[j]
          if (prevC?.type === 'append' && prevC?.message?.role === 'user') {
            lastUserIdx = j
            break
          }
        }
        if (lastUserIdx < i) {
          // This turn_started is after the last user message
          const payload = c?.payload || {}
          const timestamp = payload?.at ? Date.parse(payload.at) : payload?.local ? Date.now() : null
          return timestamp || null
        }
      }
    }
    return null
  }, [chunksRevisionKey])

  // Awaiting assistant: prefer server turn state; show awaiting when turn is active but no streaming caret
  // IMPORTANT: Don't show "awaiting" if the assistant has already started responding (even if incomplete)
  const isAwaitingAssistant = useMemo(() => {
    if (hasCompleteEvent) return false
    // If there's already an assistant message (even incomplete), we're not awaiting - the assistant has started
    if (hasAnyAssistantAfterLastUser) return false
    // If server says the turn is active, we're awaiting whenever the assistant isn't streaming text
    // AND we are not currently waiting on tool results (tools panel/widget handles its own spinner).
    if (serverTurnActive && !isAssistantStreaming && !isAwaitingToolResults) return true
    // Cap only the local pre-stream window (when turn_state events may be missing).
    if (preStreamExpired) return false
    // Otherwise, fall back to local pending-turn state to bridge create/route-change gaps.
    return localTurnPendingActive
  }, [serverTurnActive, isAssistantStreaming, isAwaitingToolResults, hasCompleteEvent, preStreamExpired, localTurnPendingActive, hasAnyAssistantAfterLastUser])

  // Unified responder state for UI (input gating and gap loader)
  const isResponding = isAssistantStreaming || isAwaitingAssistant || isAwaitingToolResults

  // Debug logging for stop debugging
  useEffect(() => {
    if (conversationId) {
      // Find last user message index in chunks
      let lastUserChunkIdx = -1
      for (let i = chunks.length - 1; i >= 0; i--) {
        const c: any = chunks[i]
        if (c?.type === 'append' && c?.message?.role === 'user') {
          lastUserChunkIdx = i
          break
        }
      }

      // Get chunks after last user message
      const chunksAfterUser = lastUserChunkIdx >= 0 ? chunks.slice(lastUserChunkIdx + 1) : []

      console.log('[STREAM] State update:', {
        conversationId,
        chunksLength: chunks.length,
        computedMessagesLength: computedMessages.length,
        chunksRevisionKey,
        lastUserChunkIdx,
        chunksAfterUserCount: chunksAfterUser.length,
        chunksAfterUserTypes: chunksAfterUser.slice(0, 10).map((c: any) => ({
          type: c?.type,
          role: c?.message?.role,
          hasContent: !!(c?.message?.content || c?.content),
        })),
        hasCompleteEvent,
        isAssistantStreaming,
        isAwaitingAssistant,
        isAwaitingToolResults,
        isResponding,
        serverTurnActive,
        hasAnyAssistantAfterLastUser,
        lastComputedMessage:
          computedMessages.length > 0
            ? {
                role: computedMessages[computedMessages.length - 1]?.role,
                id: computedMessages[computedMessages.length - 1]?.id,
                hasContent: !!computedMessages[computedMessages.length - 1]?.content,
                streaming: (computedMessages[computedMessages.length - 1] as any)?.streaming,
              }
            : null,
        allComputedMessages: computedMessages.map((m: any) => ({
          role: m.role,
          id: m.id,
          hasContent: !!m.content,
          streaming: m.streaming,
        })),
      })
    }
  }, [
    conversationId,
    hasCompleteEvent,
    isAssistantStreaming,
    isAwaitingAssistant,
    isAwaitingToolResults,
    isResponding,
    serverTurnActive,
    chunksRevisionKey,
    chunks.length,
    computedMessages.length,
    hasAnyAssistantAfterLastUser,
    computedMessages,
    chunks,
  ])

  // Fallback: if after connection there are no messages yet, fetch baseline once via REST
  useEffect(() => {
    if (!conversationId) return
    if (messagesQuery.fetchStatus === 'fetching') return
    if (Array.isArray(computedMessages) && computedMessages.length > 0) return
    let cancelled = false
    const loadBaseline = async () => {
      try {
        const response: FetchResponse<ApiResponse<any>> = await api.get(`/api/v1/conversations/${conversationId}/messages`)
        if (cancelled) return
        const list = Array.isArray((response as any)?.data?.data?.messages) ? (((response as any).data.data.messages as any[]) ?? []) : []
        if (list.length === 0) return
        queryClient.setQueryData(CONVERSATION_QUERY_KEYS.messages(conversationId), (old: any[] | undefined) => {
          const next = Array.isArray(old) ? old.slice() : []
          for (const msg of list) next.push({ type: 'append', message: msg })
          return next
        })
      } catch {}
    }
    const t = setTimeout(loadBaseline, 300)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [conversationId, computedMessages, messagesQuery.fetchStatus, queryClient])

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
      // Optimistically:
      // - append the user message so the chat doesn't "go blank" during the /conversations -> /conversations/:id transition
      // - mark the turn as started so the "assistant is typing..." gap loader stays visible
      try {
        const convId = (variables as any)?.conversationId as string | undefined
        if (!convId) return

        // If we've already injected an optimistic temp user + local turn_started for this send
        // (e.g. during the "create conversation" -> upload attachments gap), do NOT inject again.
        try {
          const existing = queryClient.getQueryData(CONVERSATION_QUERY_KEYS.messages(convId)) as any[] | undefined
          const existingArr = Array.isArray(existing) ? existing : []
          const last = existingArr.length > 0 ? existingArr[existingArr.length - 1] : null
          const prev = existingArr.length > 1 ? existingArr[existingArr.length - 2] : null
          const hasLocalTurnStarted = last?.type === 'turn_started' && last?.payload?.local === true
          const prevIsUserAppend = prev?.type === 'append' && prev?.message?.role === 'user'
          const sameContent = prevIsUserAppend && String(prev?.message?.content ?? '') === String((variables as any)?.content ?? '')
          const prevIsTemp = prevIsUserAppend && typeof prev?.message?.id === 'string' && String(prev.message.id).startsWith('temp-user-')
          if (hasLocalTurnStarted && prevIsTemp && sameContent) {
            return
          }
        } catch {}

        const now = new Date().toISOString()
        const tempUser: ClientMessage = {
          id: `temp-user-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          role: 'user',
          content: String((variables as any)?.content ?? ''),
          createdAt: now,
          updatedAt: now,
          messageType: 'user_input',
          // Best-effort: carry agentId through for UI (not required by protocol consumer)
          ...(typeof (variables as any)?.agentId === 'string' ? ({ agentId: (variables as any).agentId } as any) : {}),
          ...(Array.isArray((variables as any)?.attachmentIds) ? ({ attachmentIds: (variables as any).attachmentIds } as any) : {}),
        }

        queryClient.setQueryData(CONVERSATION_QUERY_KEYS.messages(convId), (old: any[] | undefined) => {
          const next = Array.isArray(old) ? old.slice() : []
          // Clear any stale streaming state from previous turns by ensuring the last assistant message
          // (if any) is marked as non-streaming before adding the new user message
          if (next.length > 0) {
            const lastChunk: any = next[next.length - 1]
            // If the last chunk is a streaming assistant message, mark it as non-streaming
            if (lastChunk?.type === 'append' && lastChunk?.message?.role === 'assistant' && lastChunk?.message?.streaming === true) {
              next[next.length - 1] = {
                ...lastChunk,
                message: { ...lastChunk.message, streaming: false },
              }
            }
            // Also handle append_chunk or other streaming-related chunks that might be at the end
            // by ensuring any assistant message in the computed state would be non-streaming
            // (This is handled by the reducer when processing chunks, but we ensure here for safety)
          }
          // Ensure the optimistic user message exists before the local turn_started so lastUserSerial is stable.
          next.push({ type: 'append', message: tempUser })
          next.push({ type: 'turn_started', payload: { local: true, at: Date.now() } })
          return next
        })
      } catch {}
    },
    onSuccess: (_res, variables) => {
      // After sending a message, ensure SSE connection is active
      // This is critical after a stop, where the connection was cancelled
      const convId = (variables as any)?.conversationId as string | undefined
      if (convId) {
        // Check if the last chunk was turn_completed (from stop) - if so, we need to re-establish connection
        const chunks = queryClient.getQueryData(CONVERSATION_QUERY_KEYS.messages(convId)) as StreamedChunk[] | undefined
        const lastChunk = Array.isArray(chunks) && chunks.length > 0 ? chunks[chunks.length - 1] : null
        const wasStopped = lastChunk?.type === 'turn_completed'

        // Check if the query is currently fetching
        const queryState = queryClient.getQueryState(CONVERSATION_QUERY_KEYS.messages(convId))
        const isFetching = queryState?.fetchStatus === 'fetching'

        // Re-establish connection if:
        // 1. We stopped previously (last chunk was turn_completed), OR
        // 2. Connection is not active (not fetching)
        if (wasStopped || !isFetching) {
          // Clear resume token to avoid resuming from a stopped turn
          try {
            if (typeof window !== 'undefined') window.localStorage.removeItem(`conv:${convId}:resumeToken`)
          } catch {}
          // Remove queries first to clear cache, then invalidate to re-establish connection
          // This prevents mixing old chunks with new messages (which causes duplicates)
          queryClient.removeQueries({ queryKey: CONVERSATION_QUERY_KEYS.messages(convId) })
          queryClient.invalidateQueries({ queryKey: CONVERSATION_QUERY_KEYS.messages(convId) })
        }
      }
    },
    onError: (error: any, variables) => {
      const status = error?.response?.status
      const code = error?.response?.data?.error?.code || error?.response?.data?.code

      if (status === 409 || code === 'CONFLICT') {
        // Turn already in progress - show friendly message
        toast.error('Please wait', {
          description: 'A response is already being generated. Please wait for it to complete before sending another message.',
        })
        return
      }

      if (status === 402 || code === 'INSUFFICIENT_FUNDS') {
        const details = error?.response?.data?.error?.details || error?.response?.data?.details
        const currentCredits = typeof details?.currentCredits === 'string' ? details.currentCredits : undefined
        const requiredCredits = typeof details?.requiredCredits === 'string' ? details.requiredCredits : undefined

        // Inject an inline system message into the streamed cache so the user sees it in chat
        const convId = (variables as any)?.conversationId as string | undefined
        const sid = (variables as any)?.starshipId as string | undefined
        if (convId) {
          const now = new Date().toISOString()
          const sysMessage: any = {
            id: `sys_${Date.now()}_${Math.random().toString(36).slice(2)}`,
            role: 'system',
            content:
              `Insufficient credits. Add credits from Billing to continue.` +
              (requiredCredits ? ` (Required: ${Number(requiredCredits).toFixed(0)} credits)` : '') +
              (currentCredits ? ` (Current: ${Number(currentCredits).toFixed(0)} credits)` : ''),
            messageType: 'error',
            createdAt: now,
            updatedAt: now,
          }
          queryClient.setQueryData(CONVERSATION_QUERY_KEYS.messages(convId), (old: any[] | undefined) => {
            const chunks = Array.isArray(old) ? old.slice() : []
            chunks.push({ type: 'append', message: sysMessage })
            return chunks
          })
        }
        // Also refresh wallet and starship usage so UI reflects current balance state
        if (sid) {
          queryClient.invalidateQueries({ queryKey: WALLET_QUERY_KEYS.detail(sid) })
          queryClient.invalidateQueries({ queryKey: USAGE_QUERY_KEYS.starshipTotals(sid) })
        }
        return
      }

      const errorMessage = getSafeErrorMessage(error)
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
    isAwaitingToolResults,
    // Expose whether a turn-completion event has been received since the last user message
    hasCompleteEvent,
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
