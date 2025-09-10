import { getCurrentToken } from '@/lib/api'
import type { StreamingState as BaseStreamingState, StreamingChunk, StreamingConnection, StreamingError, StreamingHeartbeat } from '@starships/protocol'
import { useCallback, useEffect, useRef, useState } from 'react'

// Extend StreamingState for client-side usage
interface StreamingState extends BaseStreamingState {
  lastUpdate?: number
  messages: any[] // Array of streaming message objects
}

/**
 * Pure streaming hook that handles SSE connection using conversationId directly
 * Simplified approach - no separate streamId needed!
 */
export function useMessageStreaming(conversationId: string | null | undefined) {
  const [streamingState, setStreamingState] = useState<StreamingState>({
    status: 'idle',
    streamId: conversationId || null, // Use conversationId as streamId
    content: '',
    error: null,
    isStreaming: false,
    messages: [],
  })
  const eventSourceRef = useRef<EventSource | null>(null)

  // Cleanup function
  const cleanup = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }
    setStreamingState(prev => ({
      ...prev,
      status: 'idle',
      content: '',
      error: null,
      isStreaming: false,
      messages: [],
    }))
  }, [])

  // Start streaming when conversationId is provided
  useEffect(() => {
    if (!conversationId) {
      return
    }

    let mounted = true

    const startStreaming = async () => {
      try {
        // Set initial streaming state - always start fresh
        setStreamingState({
          streamId: conversationId, // Use conversationId as streamId
          status: 'connecting',
          content: '', // Clear any previous content
          error: null,
          isStreaming: true,
          messages: [], // Start with empty messages array
        })

        // Get JWT token for SSE authentication
        const token = await getCurrentToken()

        // Connect to streaming endpoint directly (no separate streamId needed)
        let sseUrl = `/api/v1/conversations/${conversationId}/messages`
        const params = new URLSearchParams()
        params.append('stream', 'true')
        if (token) {
          params.append('token', token)
        }
        sseUrl += `?${params.toString()}`

        const eventSource = new EventSource(sseUrl)
        eventSourceRef.current = eventSource

        eventSource.onopen = () => {
          if (!mounted) return
          console.log('[STREAMING] SSE connection opened')
          setStreamingState(prev => ({ ...prev, status: 'streaming' }))
        }

        eventSource.addEventListener('connection', (event: MessageEvent) => {
          if (!mounted) return
          const connectionData: StreamingConnection = JSON.parse(event.data)
          console.log('[STREAMING] Connection confirmed:', connectionData)
        })

        eventSource.addEventListener('heartbeat', (event: MessageEvent) => {
          if (!mounted) return
          const heartbeatData: StreamingHeartbeat = JSON.parse(event.data)
          console.log('[STREAMING] Heartbeat:', heartbeatData)
        })

        // Handle new message objects (workflow events as separate messages)
        eventSource.addEventListener('message', (event: MessageEvent) => {
          if (!mounted) return
          const message = JSON.parse(event.data)
          console.log('[STREAMING] Received message object:', message)

          setStreamingState(prev => {
            // If this is a new empty assistant message (start of new stream),
            // clear any previous streaming messages and start fresh
            if (message.role === 'assistant' && message.content === '' && message.streaming === true) {
              console.log('[STREAMING] New assistant stream started - clearing previous messages')
              return {
                ...prev,
                messages: [message], // Replace all messages with just the new empty one
                content: '', // Clear accumulated content
                lastUpdate: Date.now(),
              }
            }

            // Otherwise, add to existing messages
            return {
              ...prev,
              messages: [...prev.messages, message],
              lastUpdate: Date.now(),
            }
          })
        })

        // Enhanced chunk handling for content streaming
        eventSource.addEventListener('chunk', (event: MessageEvent) => {
          if (!mounted) return
          const chunk: StreamingChunk = JSON.parse(event.data)
          console.log('[STREAMING] Received chunk:', chunk)

          switch (chunk.type) {
            case 'content':
              // Update the streaming assistant message with new content
              setStreamingState(prev => {
                // Find the assistant message that's currently streaming
                const streamingAssistantIndex = prev.messages.findIndex(msg => msg.role === 'assistant' && msg.streaming === true)

                if (streamingAssistantIndex !== -1) {
                  // Update the streaming message with new content
                  const updatedMessages = [...prev.messages]
                  const currentMessage = updatedMessages[streamingAssistantIndex]
                  updatedMessages[streamingAssistantIndex] = {
                    ...currentMessage,
                    content: currentMessage.content + chunk.content,
                    contentLength: (currentMessage.content + chunk.content).length,
                    updatedAt: new Date().toISOString(),
                  }
                  return {
                    ...prev,
                    messages: updatedMessages,
                    lastUpdate: Date.now(),
                  }
                }

                // Fallback: accumulate in streaming state content
                return {
                  ...prev,
                  content: prev.content + chunk.content,
                  lastUpdate: Date.now(),
                }
              })
              break
            case 'thinking':
              setStreamingState(prev => ({
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
          if (!mounted) return
          const completeData = JSON.parse(event.data)
          console.log('[STREAMING] Stream complete:', completeData)

          // Mark all streaming messages as complete
          setStreamingState(prev => ({
            ...prev,
            status: 'complete',
            isStreaming: false,
            messages: prev.messages.map(msg => (msg.streaming ? { ...msg, streaming: false, processingStatus: 'completed' } : msg)),
            lastUpdate: Date.now(),
          }))

          cleanup()
        })

        eventSource.addEventListener('error', (event: MessageEvent) => {
          if (!mounted) return
          const error: StreamingError = JSON.parse(event.data)
          console.error('[STREAMING] Stream error:', error)
          setStreamingState(prev => ({
            ...prev,
            status: 'error',
            error,
            isStreaming: false,
          }))
          cleanup()
        })

        eventSource.onerror = (event: Event) => {
          if (!mounted) return
          console.error('[STREAMING] EventSource error:', event)
          const error: StreamingError = {
            streamId: conversationId,
            errorCode: 'CONNECTION_ERROR',
            message: 'Lost connection to streaming server',
            timestamp: new Date().toISOString(),
            recoverable: true,
          }
          setStreamingState(prev => ({
            ...prev,
            status: 'error',
            error,
            isStreaming: false,
          }))
          cleanup()
        }
      } catch (error) {
        if (!mounted) return
        console.error('[STREAMING] Failed to start streaming:', error)
        const streamingError: StreamingError = {
          streamId: conversationId,
          errorCode: 'CONNECTION_FAILED',
          message: 'Failed to establish streaming connection',
          timestamp: new Date().toISOString(),
          recoverable: false,
        }
        setStreamingState(prev => ({
          ...prev,
          status: 'error',
          error: streamingError,
          isStreaming: false,
        }))
      }
    }

    startStreaming()

    // Cleanup function
    return () => {
      mounted = false
      cleanup()
    }
  }, [conversationId, cleanup])

  // Cleanup on unmount
  useEffect(() => {
    return cleanup
  }, [cleanup])

  return {
    streamingState,
    isStreaming: streamingState.isStreaming,
    streamingContent: streamingState.content,
    streamingMessages: streamingState.messages,
    streamingStatus: streamingState.status,
    streamingError: streamingState.error,
    cleanup,
  }
}
