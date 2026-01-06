import api, { getCurrentToken } from '@/lib/api'
import type { ApiResponse, ConversationModel, MessageModel, ConversationState } from '@starships/protocol'
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
  return useCallback(
    async (conversationId: string) => {
      if (!conversationId) return
      try {
        // Signal server to persist partials and cancel autopilot
        await api.post(`/api/v1/conversations/${conversationId}/stop`)
      } catch (error: any) {
        const msg = getSafeErrorMessage(error)
        toast.error('Failed to stop response', { description: msg })
        return
      }
    },
    []
  )
}

export function useConversationStreamed(conversationId: string | null, starshipId?: string | null, options?: { enabled?: boolean }) {
  const enabledFlag = options?.enabled !== false
  const [messages, setMessages] = useState<ClientMessage[]>([])
  const [lastUIAction, setLastUIAction] = useState<any>(null)
  const [turn, setTurn] = useState<{ turnId: string; status: 'active' | 'waiting_for_tools' | 'completed' | 'failed' | 'cancelled' } | null>(null)

  // Load initial snapshot (server REST)
  useEffect(() => {
    if (!conversationId || !enabledFlag) return
    let cancelled = false
    ;(async () => {
      try {
        const resp: FetchResponse<ApiResponse<any>> = await api.get(`/api/v1/conversations/${conversationId}/messages`)
        if (cancelled) return
        const list = Array.isArray((resp as any)?.data?.data?.messages) ? ((resp as any).data.data.messages as any[]) : []
        setMessages(list as ClientMessage[])
      } catch {
        /* ignore */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [conversationId, enabledFlag])

  // Live SSE (Redis Streams-backed)
  useEffect(() => {
    if (!conversationId || !enabledFlag) return
    let closed = false
  const controller = new AbortController()

    const cursorKey = `conv:${conversationId}:cursor`
    const cursor = typeof window !== 'undefined' ? window.localStorage.getItem(cursorKey) : null
    const url = `/api/v1/conversations/${conversationId}/messages?stream=true${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`

    ;(async () => {
      const token = await getCurrentToken()
  fetchEventSource(url, {
    method: 'GET',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        signal: controller.signal,
    openWhenHidden: true,
        onmessage(ev: any) {
          if (closed) return
          try {
            if (typeof ev?.id === 'string' && ev.id) {
              try {
                if (typeof window !== 'undefined') window.localStorage.setItem(cursorKey, ev.id)
              } catch {}
            }
            const type = String(ev?.event || '')
            const data = ev?.data ? JSON.parse(ev.data) : null
            if (!type || data == null) return

            if (type === 'snapshot') {
              const nextMsgs = Array.isArray(data?.messages) ? (data.messages as ClientMessage[]) : []
              setMessages(nextMsgs)
              const t = data?.turn
              if (t && typeof t.turnId === 'string' && typeof t.status === 'string') {
                setTurn({ turnId: t.turnId, status: t.status })
              } else {
                setTurn(null)
              }
              return
            }

            if (type === 'ui_action') {
              setLastUIAction(data)
              return
            }

            if (type === 'turn.started') {
              if (typeof data?.turnId === 'string') {
                setTurn({ turnId: data.turnId, status: 'active' })
              }
              return
            }

            if (type === 'turn.status') {
              if (typeof data?.turnId === 'string' && typeof data?.status === 'string') {
                setTurn({ turnId: data.turnId, status: data.status })
                // Terminal statuses should stop any streaming messages
                if (data.status === 'completed' || data.status === 'failed' || data.status === 'cancelled') {
                  setMessages(prev =>
                    prev.map(m => ((m as any).streaming ? ({ ...(m as any), streaming: false } as any) : m))
                  )
                }
              }
              return
            }

            if (type === 'message.append') {
              const msg = data?.message as ClientMessage
              if (!msg || typeof msg.id !== 'string') return
              setMessages(prev => {
                // If this is the persisted assistant for the active turn, replace the streaming placeholder message (stream-<turnId>)
                const msgTurnId = (msg as any).turnId
                if (msg.role === 'assistant' && typeof msgTurnId === 'string') {
                  const streamId = `stream-${msgTurnId}`
                  const idx = prev.findIndex(m => m.id === streamId)
                  if (idx !== -1) {
                    const next = prev.slice()
                    next[idx] = { ...msg, streaming: false } as any
                    return next
                  }
                }
                if (prev.some(m => m.id === msg.id)) return prev
                return [...prev, msg]
              })
              return
            }

            if (type === 'assistant.delta' || type === 'assistant.reasoning_delta') {
              const messageId = String(data?.messageId || '')
              const delta = String(data?.delta || '')
              if (!messageId || !delta) return
              setMessages(prev => {
                const idx = prev.findIndex(m => m.id === messageId)
                const now = new Date().toISOString()
      if (idx === -1) {
                  const m: any = {
                    id: messageId,
          role: 'assistant',
                    content: type === 'assistant.delta' ? delta : '',
                    reasoning: type === 'assistant.reasoning_delta' ? delta : undefined,
          messageType: 'agent_response',
                    createdAt: now,
                    updatedAt: now,
          streaming: true,
                  }
                  return [...prev, m]
                }
                const next = prev.slice()
                const cur: any = { ...(prev[idx] as any) }
                cur.updatedAt = now
                cur.streaming = true
                if (type === 'assistant.delta') {
                  cur.content = String(cur.content || '') + delta
      } else {
                  cur.reasoning = String(cur.reasoning || '') + delta
                }
                next[idx] = cur
                return next
              })
      return
    }
    } catch {
            // ignore parse errors
          }
        },
        onerror() {
          // Fail closed: keep existing state; client will retry on next mount
          controller.abort()
        },
      })
    })()

    return () => {
      closed = true
      controller.abort()
    }
  }, [conversationId, enabledFlag])

  const isResponding = turn?.status === 'active' || turn?.status === 'waiting_for_tools'
  const isAwaitingToolResults = turn?.status === 'waiting_for_tools'
  const isAssistantStreaming = useMemo(() => messages.some(m => (m as any)?.streaming === true), [messages])
  const isAwaitingAssistant = Boolean(isResponding && !isAssistantStreaming && !isAwaitingToolResults)

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
      // Optimistically append user message and flip turn to active immediately for UI responsiveness.
      try {
        const convId = (variables as any)?.conversationId as string | undefined
        if (!convId) return
        const now = new Date().toISOString()
        const tempUser: ClientMessage = {
          id: `temp-user-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          role: 'user',
          content: String((variables as any)?.content ?? ''),
          createdAt: now,
          updatedAt: now,
          messageType: 'user_input',
        }
        setMessages(prev => [...prev, tempUser])
        setTurn(prev => prev ?? { turnId: 'pending', status: 'active' })
      } catch {}
    },
    onError: (error: any) => {
      const errorMessage = getSafeErrorMessage(error)
      toast.error('Failed to send message', { description: errorMessage })
    },
  })

  return {
    messages,
    isLoading: false,
    error: null,
    isStreaming: isResponding,
    isResponding,
    isAssistantStreaming,
    isAwaitingAssistant,
    isAwaitingToolResults,
    hasCompleteEvent: turn?.status === 'completed' || turn?.status === 'failed' || turn?.status === 'cancelled',
    lastUIAction,
    isFetching: false,
    sendMessage: (data: CreateMessageRequest & { conversationId: string }) => sendMessageMutation.mutateAsync(data),
    isSending: sendMessageMutation.isPending,
    refetch: () => Promise.resolve(),
    invalidate: () => Promise.resolve(),
  }
}
