import api, { getCurrentToken } from '@/lib/api'
import type { ApiResponse, ConversationModel, MessageModel } from '@starships/protocol'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useState, useRef } from 'react'
import { toast } from 'sonner'
import { applyOperation, Operation } from 'fast-json-patch'
import { fetchEventSource } from '@microsoft/fetch-event-source'
import { useStarshipUIStore } from '@/store/starship-ui-store'

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
  contentChunks?: Array<{
    content: string
    position: number
    timestamp: number
  }>
}

// Content chunk processing utility
const processContentChunks = (data: any) => {
  if (!data.messages || !Array.isArray(data.messages)) {
    return data
  }

  const processedMessages = data.messages.map((message: ClientMessage) => {
    // If message has contentChunks, build the streamed content
    if (message.contentChunks && Array.isArray(message.contentChunks)) {
      // Sort chunks by position to ensure correct order
      const sortedChunks = [...message.contentChunks].sort((a, b) => a.position - b.position)

      // Build content from chunks
      let streamedContent = ''
      for (const chunk of sortedChunks) {
        streamedContent += chunk.content
      }

      // Return message with both the original content and streamed content
      return {
        ...message,
        content: message.streaming ? streamedContent : message.content,
        streamedContent: streamedContent,
      }
    }

    return message
  })

  return {
    ...data,
    messages: processedMessages,
  }
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

// Streaming state interface
interface StreamingState {
  status: 'idle' | 'connecting' | 'streaming' | 'complete' | 'error'
  isStreaming: boolean
  content: string
  error: any
  lastUpdate?: number
  version?: number
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
export function useConversation(conversationId: string | null) {
  const queryClient = useQueryClient()
  const abortControllerRef = useRef<AbortController | null>(null)
  const processingQueueRef = useRef<any[]>([])
  const isProcessingRef = useRef(false)
  const contentAccumulatorRef = useRef<string>('')

  const [streamingState, setStreamingState] = useState<StreamingState>({
    status: 'idle',
    isStreaming: false,
    content: '',
    error: null,
  })

  // Get conversation messages
  const messagesQuery = useQuery({
    queryKey: CONVERSATION_QUERY_KEYS.messages(conversationId!),
    queryFn: async (): Promise<{
      conversationId: string
      messages: ClientMessage[]
      total: number
      participants: string[]
      startedAt: string
      lastActivityAt: string
    }> => {
      const response: FetchResponse<
        ApiResponse<{
          conversationId: string
          messages: MessageModel[]
          total: number
          participants: string[]
          startedAt: string
          lastActivityAt: string
        }>
      > = await api.get(`/api/v1/conversations/${conversationId}/messages`, {
        params: { limit: 100, page: 1, orderBy: 'createdAt', orderDirection: 'desc' },
      })

      return {
        ...response.data.data,
        messages: response.data.data.messages.map((msg: MessageModel) => ({ ...msg }) as ClientMessage),
      }
    },
    enabled: !!conversationId,
    staleTime: 5 * 1000, // 5 seconds - messages change frequently
    gcTime: 2 * 60 * 1000, // 2 minutes
    refetchOnWindowFocus: true,
  })

  // Process streaming events and update TanStack Query cache
  const handleStreamingEvent = useCallback(
    (data: any) => {
      // JSON Patch events (RFC6902 delta updates)
      // Support both:
      // 1) Batched patches: { type: 'patch', patch: Operation[] }
      // 2) Single op deltas: { op: 'add' | 'replace' | 'remove', path: string, value?: any }
      const isSingleOp = data && typeof data.op === 'string' && typeof data.path === 'string'
      const isPatchArray = data && data.type === 'patch' && Array.isArray(data.patch)

      if (isPatchArray || isSingleOp) {
        const ops: Operation[] = isSingleOp ? [data as Operation] : (data.patch as Operation[])
        const version = (data as any).version
        console.log('[STREAMING] Incoming ops:', ops, 'version:', version)

        // Split chunk-add ops from others to avoid blocking event loop with frequent cache writes
        const chunkOps = ops.filter(op => op.op === 'add' && typeof op.path === 'string' && /\/contentChunks\/-$/.test(op.path))
        const nonChunkOps = ops.filter(op => !chunkOps.includes(op))

        // Fast path: update ephemeral streaming state in zustand for chunk adds
        if (chunkOps.length > 0) {
          const text = chunkOps
            .map(op => (op as any).value?.content)
            .filter(Boolean)
            .join('')
          if (text) {
            const store = useStarshipUIStore.getState()
            store.startStreaming(conversationId!, version)
            store.appendStreamingChunk(conversationId!, text, version)
          }
        }

        // Update local streaming flag for UI consumers (kept for compatibility)
        setStreamingState(prev => ({
          ...prev,
          status: 'streaming',
          isStreaming: true,
          lastUpdate: Date.now(),
          version: version || prev.version,
        }))

        // Apply only non-chunk ops to React Query cache (e.g., add message shell, replace content, mark streaming=false)
        if (nonChunkOps.length > 0) {
          queryClient.setQueryData(CONVERSATION_QUERY_KEYS.messages(conversationId!), (old: any) => {
            const applyOps = (target: any) => {
              // Normalize one op against current state to resolve '/messages/-1/...' or target by id
              const normalizeOpForState = (op: Operation, state: any): Operation => {
                if (!op || typeof (op as any).path !== 'string') return op
                const raw = op as any
                let path: string = raw.path

                // If server provided a targetMessageId, prefer mapping by id for deterministic resolution
                const targetId: string | undefined = raw.targetMessageId
                if (targetId && Array.isArray(state?.messages)) {
                  const idx = state.messages.findIndex((m: any) => m?.id === targetId)
                  if (idx >= 0) {
                    // Replace the first /messages/<segment> with the concrete index
                    path = path.replace(/^\/messages\/(?:-1|\d+)(?=\/|$)/, `/messages/${idx}`)
                    return { ...raw, path }
                  }
                }

                // Fallback: map last-item shorthand to concrete index for all op types
                if (path.startsWith('/messages/-1')) {
                  const lastIndex = Array.isArray(state?.messages) && state.messages.length > 0 ? state.messages.length - 1 : -1
                  if (lastIndex >= 0) {
                    path = path.replace('/messages/-1', `/messages/${lastIndex}`)
                  }
                }
                return { ...raw, path }
              }

              let result = target
              for (const operation of nonChunkOps) {
                const normalized = normalizeOpForState(operation as Operation, result)
                try {
                  const opResult = applyOperation(result, normalized as Operation, true)
                  result = opResult.newDocument
                } catch (opErr) {
                  console.warn('[STREAMING] Operation failed, continuing with others:', normalized, opErr)
                }
              }
              return result
            }
            if (!old) {
              // Initialize with empty messages array if no data exists
              const initialData = { messages: [], total: 0, conversationId: conversationId! }
              try {
                const patched = applyOps(initialData)
                const updatedData = {
                  ...patched,
                  total: Array.isArray(patched.messages) ? patched.messages.length : 0,
                }
                return processContentChunks(updatedData)
              } catch (error) {
                console.error('[STREAMING] Failed to apply operations to initial data:', error)
                return initialData
              }
            }

            // Apply operations to existing data
            try {
              const patched = applyOps(old)
              const updatedData = {
                ...patched,
                total: Array.isArray(patched.messages) ? patched.messages.length : old.total,
                lastActivityAt: new Date().toISOString(),
              }
              return processContentChunks(updatedData)
            } catch (error) {
              console.error('[STREAMING] Failed to apply operations:', error, { operations: nonChunkOps, target: old })
              return old // Return unchanged data on operation failure
            }
          })

          // If any op marks streaming complete, end zustand streaming
          const marksDone =
            nonChunkOps.some(op => op.op === 'replace' && typeof op.path === 'string' && /\/streaming$/.test(op.path) && (op as any).value === false) ||
            nonChunkOps.some(op => op.op === 'replace' && typeof op.path === 'string' && /\/content$/.test(op.path))
          if (marksDone) {
            const store = useStarshipUIStore.getState()
            store.endStreaming(conversationId!)
            // Optionally clear ephemeral state shortly after completion
            setTimeout(() => useStarshipUIStore.getState().clearStreaming(conversationId!), 500)
          }
        }

        return
      }

      // Handle content streaming events for UI display
      if (data.content && typeof data.content === 'string') {
        contentAccumulatorRef.current += data.content
        setStreamingState(prev => ({
          ...prev,
          status: 'streaming',
          isStreaming: true,
          content: contentAccumulatorRef.current,
          lastUpdate: Date.now(),
        }))
        return
      }

      // Handle delta content streaming (for incremental text updates)
      if (data.delta && data.delta.content) {
        contentAccumulatorRef.current += data.delta.content
        setStreamingState(prev => ({
          ...prev,
          status: 'streaming',
          isStreaming: true,
          content: contentAccumulatorRef.current,
          lastUpdate: Date.now(),
        }))
        return
      }

      // Complete message objects
      if (data.role !== undefined) {
        const message = data as ClientMessage

        // Empty assistant message - start streaming
        if (message.role === 'assistant' && (!message.content || message.content.trim() === '')) {
          setStreamingState(prev => ({
            ...prev,
            status: 'streaming',
            isStreaming: true,
            content: '', // Clear any previous streaming content
            lastUpdate: Date.now(),
          }))
          contentAccumulatorRef.current = ''
          try {
            useStarshipUIStore.getState().startStreaming(conversationId!)
          } catch {}

          // Add streaming message to cache (prepend since messages are in desc order)
          queryClient.setQueryData(CONVERSATION_QUERY_KEYS.messages(conversationId!), (old: any) => {
            if (!old) return { messages: [{ ...message, streaming: true }], total: 1, conversationId }
            return {
              ...old,
              messages: [{ ...message, streaming: true }, ...old.messages],
              total: old.total + 1,
            }
          })
          return
        }

        // Regular message - add to cache (prepend since messages are in desc order)
        queryClient.setQueryData(CONVERSATION_QUERY_KEYS.messages(conversationId!), (old: any) => {
          if (!old) return { messages: [message], total: 1, conversationId }
          return {
            ...old,
            messages: [message, ...old.messages],
            total: old.total + 1,
          }
        })
        return
      }

      // Complete event
      if (data.status === 'complete' || data.type === 'done') {
        setStreamingState(prev => ({
          ...prev,
          status: 'complete',
          isStreaming: false,
          content: '', // Clear streaming content on completion
        }))
        contentAccumulatorRef.current = ''

        // Mark streaming messages as complete
        queryClient.setQueryData(CONVERSATION_QUERY_KEYS.messages(conversationId!), (old: any) => {
          if (!old) return old
          return {
            ...old,
            messages: old.messages.map((msg: ClientMessage) => (msg.streaming ? { ...msg, streaming: false, processingStatus: 'completed' } : msg)),
          }
        })
        return
      }

      // Error event
      if (data.errorCode !== undefined) {
        setStreamingState(prev => ({
          ...prev,
          status: 'error',
          error: data,
          isStreaming: false,
        }))
        contentAccumulatorRef.current = ''
        return
      }
    },
    [conversationId, queryClient]
  )

  /**
   * Process queued events with yielding to prevent blocking
   */
  const processEventQueue = useCallback(async () => {
    if (isProcessingRef.current || processingQueueRef.current.length === 0) {
      return
    }

    isProcessingRef.current = true

    while (processingQueueRef.current.length > 0) {
      const data = processingQueueRef.current.shift()

      try {
        // Process the event
        handleStreamingEvent(data)

        // Yield to the event loop after each event
        await new Promise(resolve => {
          if (typeof requestIdleCallback !== 'undefined') {
            requestIdleCallback(() => resolve(undefined))
          } else {
            setTimeout(resolve, 0)
          }
        })
      } catch (error) {
        console.error('[STREAMING] Error processing event:', error)
      }
    }

    isProcessingRef.current = false
  }, [handleStreamingEvent])

  /**
   * Queue an event for processing
   */
  const queueEvent = useCallback(
    (event: any) => {
      processingQueueRef.current.push(event)
      processEventQueue()
    },
    [processEventQueue]
  )

  // Send message mutation with streaming support
  const sendMessageMutation = useMutation({
    mutationFn: async (
      data: CreateMessageRequest & {
        stream?: boolean
      }
    ): Promise<ClientMessage> => {
      if (data.stream) {
        // Use industry-standard fetch-event-source for POST SSE streaming
        const token = await getCurrentToken()
        if (!token) {
          throw new Error('No authentication token available')
        }

        // Stop any existing stream
        if (abortControllerRef.current) {
          abortControllerRef.current.abort()
        }

        // Create new abort controller
        abortControllerRef.current = new AbortController()

        return new Promise((resolve, reject) => {
          let resolved = false

          // Clear previous state
          contentAccumulatorRef.current = ''
          processingQueueRef.current = []
          setStreamingState({
            status: 'connecting',
            isStreaming: true,
            content: '',
            error: null,
            lastUpdate: Date.now(),
          })

          // Compute baseline length to help the server emit concrete numeric indexes
          const baselineCache = queryClient.getQueryData(CONVERSATION_QUERY_KEYS.messages(data.conversationId!)) as any
          const messagesSnapshot = Array.isArray(baselineCache?.messages) ? baselineCache.messages : []
          const optimisticCount = messagesSnapshot.filter((m: any) => m?.sending === true).length
          const baselineLength = Math.max(messagesSnapshot.length - optimisticCount, 0)

          fetchEventSource(`/api/v1/conversations/${data.conversationId}/messages?stream=true`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              content: data.content,
              baselineLength,
            }),
            signal: abortControllerRef.current?.signal,
            async onopen(response) {
              if (response.ok) {
                console.log('[STREAMING] Connection opened successfully')
                setStreamingState(prev => ({
                  ...prev,
                  status: 'streaming',
                }))
                return // Continue processing
              } else if (response.status >= 400 && response.status < 500 && response.status !== 429) {
                // Client error - don't retry
                throw new Error(`HTTP ${response.status}: ${response.statusText}`)
              } else {
                // Server error or rate limit - let it retry
                throw new Error(`HTTP ${response.status}: ${response.statusText}`)
              }
            },
            onmessage(event) {
              // Queue events for non-blocking processing
              try {
                if (!event.data) return

                const parsed = JSON.parse(event.data)
                console.log('[STREAMING] Received SSE event:', parsed.op ? 'delta' : parsed.type || 'unknown', parsed)

                // Queue the event for processing
                queueEvent(parsed)
              } catch (parseError) {
                console.warn('[STREAMING] Failed to parse SSE data:', event.data, parseError)
              }
            },
            onclose() {
              console.log('[STREAMING] Connection closed')
              if (!resolved) {
                resolved = true
                resolve({
                  id: `user-${Date.now()}`,
                  role: data.role,
                  content: data.content,
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                  messageType: data.messageType || 'user_input',
                } as ClientMessage)
              }
            },
            onerror(error) {
              console.error('[STREAMING] Connection error:', error)
              if (!resolved) {
                resolved = true
                reject(error)
              }
              throw error // Let fetch-event-source handle retries
            },
          }).catch(error => {
            if (!resolved) {
              resolved = true
              reject(error)
            }
          })
        })
      } else {
        // Regular message creation
        const response: FetchResponse<ApiResponse<MessageModel>> = await api.post('/api/v1/messages', data)
        return response.data.data as ClientMessage
      }
    },
    onMutate: async variables => {
      if (!variables.conversationId) return

      // Cancel any outgoing refetches
      await queryClient.cancelQueries({
        queryKey: CONVERSATION_QUERY_KEYS.messages(variables.conversationId),
      })

      // Snapshot the previous messages
      const previousMessages = queryClient.getQueryData(CONVERSATION_QUERY_KEYS.messages(variables.conversationId))

      // Optimistically add the user message
      const tempMessage: ClientMessage = {
        id: `temp-${Date.now()}`,
        role: variables.role,
        content: variables.content,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        messageType: variables.messageType || 'user_input',
        sending: true,
      }

      queryClient.setQueryData(CONVERSATION_QUERY_KEYS.messages(variables.conversationId), (old: any) => {
        if (!old) return { messages: [tempMessage], total: 1, conversationId: variables.conversationId }
        return {
          ...old,
          messages: [tempMessage, ...old.messages],
          total: old.total + 1,
        }
      })

      return { previousMessages, tempMessage, conversationId: variables.conversationId }
    },
    onSuccess: (result, variables, context) => {
      if (!variables.conversationId || !context) return

      // Replace temp message with real message (for non-streaming)
      if (!variables.stream) {
        queryClient.setQueryData(CONVERSATION_QUERY_KEYS.messages(variables.conversationId), (old: any) => {
          if (!old) return { messages: [result], total: 1, conversationId: variables.conversationId }

          const messages = old.messages.map((msg: ClientMessage) => (msg.id === context.tempMessage.id ? { ...result, sending: false } : msg))

          return {
            ...old,
            messages,
            lastActivityAt: result.createdAt,
          }
        })
      } else {
        // For streaming, mark the temp message as sent and start streaming
        queryClient.setQueryData(CONVERSATION_QUERY_KEYS.messages(variables.conversationId), (old: any) => {
          if (!old) return old

          const messages = old.messages.map((msg: ClientMessage) => (msg.id === context.tempMessage.id ? { ...msg, sending: false } : msg))

          return { ...old, messages }
        })
      }
    },
    onError: (error: any, variables, context) => {
      if (!variables.conversationId || !context) return

      // Rollback optimistic update
      queryClient.setQueryData(CONVERSATION_QUERY_KEYS.messages(variables.conversationId), context.previousMessages)

      const errorMessage = error?.response?.data?.error || error?.message || 'Failed to send message'
      toast.error('Failed to send message', {
        description: errorMessage,
      })
    },
  })

  return {
    // Query data
    messages: messagesQuery.data?.messages || [],
    total: messagesQuery.data?.total || 0,
    participants: messagesQuery.data?.participants || [],
    isLoading: messagesQuery.isLoading,
    error: messagesQuery.error,

    // Streaming state
    streamingState,
    isStreaming: streamingState.isStreaming,
    streamingContent: streamingState.content,

    // Actions
    sendMessage: (data: CreateMessageRequest & { stream?: boolean }) => sendMessageMutation.mutateAsync(data),
    isSending: sendMessageMutation.isPending,

    // Utilities
    refetch: messagesQuery.refetch,
    invalidate: () =>
      queryClient.invalidateQueries({
        queryKey: CONVERSATION_QUERY_KEYS.messages(conversationId!),
      }),
  }
}

// Additional conversation management hooks (kept from useConversations.ts)
export function useCreateConversation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: { title?: string; starshipId?: string; agentId?: string }): Promise<ConversationModel> => {
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
