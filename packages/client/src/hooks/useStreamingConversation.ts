import api, { getCurrentToken } from '@/lib/api'
import type { StreamingState as BaseStreamingState, StreamingChunk, StreamingConnection, StreamingError, StreamingHeartbeat, StreamingResponse } from '@starships/protocol'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { CONVERSATION_QUERY_KEYS } from './useConversations'
import { MESSAGE_QUERY_KEYS, type ClientMessage } from './useMessages'

// Extend StreamingState to include lastUpdate for forcing React re-renders
interface StreamingState extends BaseStreamingState {
  lastUpdate?: number
}

/**
 * Hook for sending messages with streaming support via Server-Sent Events
 */
export function useStreamingConversation() {
  const queryClient = useQueryClient()
  const [streamingState, setStreamingState] = useState<StreamingState>({
    status: 'idle',
    streamId: null,
    content: '',
    error: null,
    isStreaming: false,
  })
  const eventSourceRef = useRef<EventSource | null>(null)

  // Cleanup function
  const cleanup = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }
    setStreamingState({
      status: 'idle',
      streamId: null,
      content: '',
      error: null,
      isStreaming: false,
    })
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return cleanup
  }, [cleanup])

  // Send message with streaming
  const sendMessageWithStreaming = useMutation({
    mutationFn: async (data: { conversationId: string; agentId: string; message: string }): Promise<StreamingResponse> => {
      return new Promise((resolve, reject) => {
        // Set initial streaming state
        setStreamingState((prev: StreamingState) => ({
          ...prev,
          status: 'connecting',
          content: '',
          error: null,
          isStreaming: true,
        }))

        // Send POST request with stream=true to get streamId
        api
          .post(`/api/v1/conversations/${data.conversationId}/messages`, {
            agentId: data.agentId,
            message: data.message,
            stream: true,
          })
          .then(async response => {
            // Extract streamId from server response
            const streamId = response.data.data?.streamId
            if (!streamId) {
              throw new Error('No streamId received from server')
            }

            setStreamingState((prev: StreamingState) => ({ ...prev, streamId }))

            // Get JWT token for SSE authentication
            const token = await getCurrentToken()

            // Connect to streaming endpoint with received streamId and token
            let sseUrl = `/api/v1/conversations/${data.conversationId}/messages/stream?streamId=${streamId}`
            if (token) {
              sseUrl += `&token=${encodeURIComponent(token)}`
            }

            const eventSource = new EventSource(sseUrl)
            eventSourceRef.current = eventSource

            let finalResponse: StreamingResponse | null = null

            eventSource.onopen = () => {
              console.log('[STREAMING] SSE connection opened')
              setStreamingState((prev: StreamingState) => ({ ...prev, status: 'streaming' }))
            }

            eventSource.addEventListener('connection', (event: MessageEvent) => {
              const connectionData: StreamingConnection = JSON.parse(event.data)
              console.log('[STREAMING] Connection confirmed:', connectionData)
            })

            eventSource.addEventListener('heartbeat', (event: MessageEvent) => {
              const heartbeatData: StreamingHeartbeat = JSON.parse(event.data)
              console.log('[STREAMING] Heartbeat:', heartbeatData)
            })

            eventSource.addEventListener('chunk', (event: MessageEvent) => {
              const chunk: StreamingChunk = JSON.parse(event.data)
              console.log('[STREAMING] Received chunk:', chunk)

              switch (chunk.type) {
                case 'content':
                  // Direct state update - React will handle the re-rendering
                  console.log('content')
                  setStreamingState((prev: StreamingState) => ({
                    ...prev,
                    content: prev.content + chunk.content,
                    lastUpdate: Date.now(),
                  }))
                  break
                case 'thinking':
                  // Show thinking state
                  setStreamingState((prev: StreamingState) => ({
                    ...prev,
                    status: 'streaming',
                    lastUpdate: Date.now(),
                  }))
                  break
                case 'node_start':
                  console.log(`[STREAMING] Node started: ${chunk.metadata?.nodeRef}`)
                  break
                case 'node_complete':
                  console.log(`[STREAMING] Node completed: ${chunk.metadata?.nodeRef}`)
                  break
              }
            })

            eventSource.addEventListener('complete', (event: MessageEvent) => {
              finalResponse = JSON.parse(event.data)
              console.log('[STREAMING] Stream complete:', finalResponse)
              setStreamingState((prev: StreamingState) => ({ ...prev, status: 'complete' }))
              cleanup()
              resolve(finalResponse!)
            })

            eventSource.addEventListener('error', (event: MessageEvent) => {
              const error: StreamingError = JSON.parse(event.data)
              console.error('[STREAMING] Stream error:', error)
              setStreamingState((prev: StreamingState) => ({
                ...prev,
                status: 'error',
                error,
                isStreaming: false,
              }))
              cleanup()
              reject(new Error(error.message))
            })

            eventSource.onerror = (event: Event) => {
              console.error('[STREAMING] EventSource error:', event)
              const error: StreamingError = {
                streamId: streamId || 'unknown',
                errorCode: 'CONNECTION_ERROR',
                message: 'Lost connection to streaming server',
                timestamp: new Date().toISOString(),
                recoverable: true,
              }
              setStreamingState((prev: StreamingState) => ({
                ...prev,
                status: 'error',
                error,
                isStreaming: false,
              }))
              cleanup()
              reject(new Error('Streaming connection failed'))
            }
          })
          .catch(error => {
            console.error('[STREAMING] Failed to initiate streaming:', error)
            const streamingError: StreamingError = {
              streamId: streamingState.streamId || 'unknown',
              errorCode: 'REQUEST_FAILED',
              message: error.response?.data?.error || error.message || 'Failed to start streaming',
              timestamp: new Date().toISOString(),
              recoverable: false,
            }
            setStreamingState((prev: StreamingState) => ({
              ...prev,
              status: 'error',
              error: streamingError,
              isStreaming: false,
            }))
            reject(error)
          })
      })
    },
    onMutate: async ({ conversationId, message }) => {
      // Cancel any outgoing refetches for conversation messages
      await queryClient.cancelQueries({ queryKey: MESSAGE_QUERY_KEYS.byConversation(conversationId) })

      // Snapshot the previous messages
      const previousMessages = queryClient.getQueryData(MESSAGE_QUERY_KEYS.byConversation(conversationId))

      // Optimistically add user message
      const userMessage: ClientMessage = {
        id: `temp-${Date.now()}`,
        content: message,
        role: 'user' as const,
        timestamp: new Date().toISOString(),
        conversationId,
        starshipId: '', // Will be set by server
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: '1.0.0',
        threadDepth: 0,
        processingStatus: 'pending',
        messageType: 'user_input',
        importance: 'medium',
        contentLength: message.length,
        hasAttachments: false,
        sending: true,
      }

      queryClient.setQueryData(MESSAGE_QUERY_KEYS.byConversation(conversationId), (old: any) => {
        if (!old) return { messages: [userMessage], total: 1, conversationId }
        return {
          ...old,
          messages: [...old.messages, userMessage],
          total: old.total + 1,
        }
      })

      return { previousMessages, userMessage, conversationId }
    },
    onSuccess: (response, variables, context) => {
      // NOTE: We're not adding the assistant message here because it's already
      // being displayed via the streaming state in ConversationMessageList
      // This prevents the legacy flow from interfering with real-time streaming

      // Just update the user message to mark it as sent (not sending)
      queryClient.setQueryData(MESSAGE_QUERY_KEYS.byConversation(variables.conversationId), (old: any) => {
        if (!old) return old

        // Update the temporary user message to mark it as sent
        const messages = old.messages.map((m: ClientMessage) => (m.id === context?.userMessage.id ? { ...m, sending: false, id: `user-${Date.now()}` } : m))

        return {
          ...old,
          messages,
        }
      })

      // Update conversation activity
      queryClient.invalidateQueries({ queryKey: CONVERSATION_QUERY_KEYS.detail(variables.conversationId) })

      toast.success('Message sent successfully!')
    },
    onError: (error: any, variables, context) => {
      // Rollback the optimistic update
      if (context?.previousMessages) {
        queryClient.setQueryData(MESSAGE_QUERY_KEYS.byConversation(variables.conversationId), context.previousMessages)
      }

      const errorMessage = error?.response?.data?.error || error?.message || 'Failed to send streaming message'
      toast.error('Failed to send message', {
        description: errorMessage,
      })
    },
    onSettled: (data, error, variables) => {
      // Don't refetch immediately - let the streaming message stay visible
      // Only refetch after a delay to get the final persisted message from server
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: MESSAGE_QUERY_KEYS.byConversation(variables.conversationId) })
      }, 2000)
    },
  })

  return {
    sendMessageWithStreaming,
    streamingState,
    cleanup,
    isStreaming: streamingState.isStreaming,
    streamingContent: streamingState.content,
    streamingStatus: streamingState.status,
    streamingError: streamingState.error,
  }
}
