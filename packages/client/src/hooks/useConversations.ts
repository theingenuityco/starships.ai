import api, { getCurrentToken } from '@/lib/api'
import type { ApiResponse, ConversationModel, MessageModel, StreamingDeltaChunk } from '@starships/protocol'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useState } from 'react'
import { toast } from 'sonner'
import { safeApplyDeltas } from '@/lib/jsonPatch'

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
      if (data.type === 'patch' && data.patch && Array.isArray(data.patch)) {
        console.log('[STREAMING] Received patch:', data.patch, 'version:', data.version)

        setStreamingState(prev => ({
          ...prev,
          status: 'streaming',
          isStreaming: true,
          lastUpdate: Date.now(),
          version: data.version || prev.version,
        }))

        // Apply JSON patch to messages array
        queryClient.setQueryData(CONVERSATION_QUERY_KEYS.messages(conversationId!), (old: any) => {
          if (!old) {
            // Initialize with empty messages array if no data exists
            const initialData = { messages: [], total: 0, conversationId: conversationId! }
            const deltaResult = safeApplyDeltas(initialData.messages, [data as StreamingDeltaChunk])

            if (deltaResult.success && deltaResult.result) {
              return {
                ...initialData,
                messages: deltaResult.result,
                total: Array.isArray(deltaResult.result) ? deltaResult.result.length : 0,
              }
            }
            return initialData
          }

          // Apply patch to existing messages
          const deltaResult = safeApplyDeltas(old.messages || [], [data as StreamingDeltaChunk])

          if (deltaResult.success && deltaResult.result) {
            return {
              ...old,
              messages: deltaResult.result,
              total: Array.isArray(deltaResult.result) ? deltaResult.result.length : old.total,
              lastActivityAt: new Date().toISOString(),
            }
          } else {
            console.error('[STREAMING] Failed to apply delta:', deltaResult.error)
            return old // Return unchanged data on patch failure
          }
        })
        return
      }

      // Legacy content chunks (incremental text) - kept for backward compatibility
      if (data.type === 'content') {
        setStreamingState(prev => ({
          ...prev,
          status: 'streaming',
          isStreaming: true,
          content: prev.content + data.content,
          lastUpdate: Date.now(),
        }))

        // Update the streaming message in TanStack Query cache
        queryClient.setQueryData(CONVERSATION_QUERY_KEYS.messages(conversationId!), (old: any) => {
          if (!old) return old

          const updatedMessages = [...old.messages]
          // Find and update the last streaming assistant message
          for (let i = updatedMessages.length - 1; i >= 0; i--) {
            const msg = updatedMessages[i]
            if (msg.role === 'assistant' && msg.streaming === true) {
              updatedMessages[i] = {
                ...msg,
                content: (msg.content || '') + data.content,
                contentLength: ((msg.content || '') + data.content).length,
                updatedAt: new Date().toISOString(),
              }
              break
            }
          }

          return { ...old, messages: updatedMessages }
        })
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
            content: '',
            lastUpdate: Date.now(),
          }))

          // Add streaming message to cache
          queryClient.setQueryData(CONVERSATION_QUERY_KEYS.messages(conversationId!), (old: any) => {
            if (!old) return { messages: [{ ...message, streaming: true }], total: 1, conversationId }
            return {
              ...old,
              messages: [...old.messages, { ...message, streaming: true }],
              total: old.total + 1,
            }
          })
          return
        }

        // Regular message - add to cache
        queryClient.setQueryData(CONVERSATION_QUERY_KEYS.messages(conversationId!), (old: any) => {
          if (!old) return { messages: [message], total: 1, conversationId }
          return {
            ...old,
            messages: [...old.messages, message],
            total: old.total + 1,
          }
        })
        return
      }

      // Complete event
      if (data.status === 'complete') {
        setStreamingState(prev => ({
          ...prev,
          status: 'complete',
          isStreaming: false,
          content: '',
        }))

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
        return
      }
    },
    [conversationId, queryClient]
  )

  // Send message mutation with streaming support
  const sendMessageMutation = useMutation({
    mutationFn: async (
      data: CreateMessageRequest & {
        stream?: boolean
      }
    ): Promise<ClientMessage> => {
      if (data.stream) {
        // Handle streaming POST response
        const token = await getCurrentToken()
        if (!token) {
          throw new Error('No authentication token available')
        }

        return new Promise((resolve, reject) => {
          const processStreaming = async () => {
            try {
              const response = await fetch(`/api/v1/conversations/${data.conversationId}/messages?stream=true`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${token}`,
                  Accept: 'text/event-stream',
                  'Cache-Control': 'no-cache',
                },
                body: JSON.stringify({
                  agentId: data.agentId,
                  message: data.content,
                }),
              })

              if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`)
              }

              const reader = response.body?.getReader()
              if (!reader) {
                throw new Error('No readable stream available')
              }

              const decoder = new TextDecoder()
              let buffer = ''

              const processStream = async () => {
                try {
                  while (true) {
                    const { done, value } = await reader.read()
                    if (done) break

                    buffer += decoder.decode(value, { stream: true })
                    const lines = buffer.split('\n')
                    buffer = lines.pop() || ''

                    for (const line of lines) {
                      if (!line.trim()) continue

                      if (line.startsWith('data: ')) {
                        const eventData = line.substring(6).trim()
                        if (!eventData) continue

                        try {
                          const parsed = JSON.parse(eventData)
                          console.log('[STREAMING] Received SSE event:', parsed.op ? 'delta' : parsed.type || 'unknown', parsed)
                          handleStreamingEvent(parsed)
                        } catch (parseError) {
                          console.warn('[STREAMING] Failed to parse SSE data:', eventData, parseError)
                        }
                      }
                    }
                  }
                } finally {
                  reader.releaseLock()
                }
              }

              // Process the stream
              await processStream()

              // Resolve with the user message
              resolve({
                id: `user-${Date.now()}`,
                role: data.role,
                content: data.content,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                messageType: data.messageType || 'user_input',
              } as ClientMessage)
            } catch (error) {
              reject(error)
            }
          }

          processStreaming()
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
          messages: [...old.messages, tempMessage],
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
        // For streaming, just mark the temp message as sent
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
    mutationFn: async (data: { title: string; starshipId?: string }): Promise<ConversationModel> => {
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
