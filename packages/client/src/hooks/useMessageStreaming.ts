import axios, { AxiosResponse } from 'axios'
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
 * Uses axios for proper Authorization header support instead of EventSource
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
  const axiosControllerRef = useRef<AbortController | null>(null)

  // Cleanup function
  const cleanup = useCallback(() => {
    if (axiosControllerRef.current) {
      axiosControllerRef.current.abort()
      axiosControllerRef.current = null
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

        // Get JWT token for authentication
        const token = await getCurrentToken()
        if (!token) {
          throw new Error('No authentication token available')
        }

        // Create abort controller for this request
        const controller = new AbortController()
        axiosControllerRef.current = controller

        // Set up axios streaming request with proper headers
        const sseUrl = `/api/v1/conversations/${conversationId}/messages?stream=true`

        console.log('[STREAMING] Starting axios streaming request')
        setStreamingState(prev => ({ ...prev, status: 'streaming' }))

        const response: AxiosResponse = await axios.get(sseUrl, {
          headers: {
            Accept: 'text/event-stream',
            Authorization: `Bearer ${token}`,
            'Cache-Control': 'no-cache',
          },
          responseType: 'stream',
          signal: controller.signal,
        })

        console.log('[STREAMING] Axios streaming connection established')

        // Parse SSE stream manually
        const stream = response.data
        let buffer = ''

        stream.on('data', (chunk: Buffer) => {
          if (!mounted) return

          buffer += chunk.toString()
          const lines = buffer.split('\n')

          // Keep the last incomplete line in buffer
          buffer = lines.pop() || ''

          // Process complete lines
          for (const line of lines) {
            if (!line.trim()) continue

            if (line.startsWith('event: ')) {
              const eventType = line.substring(7).trim()
              continue
            }

            if (line.startsWith('data: ')) {
              const data = line.substring(6).trim()
              if (!data) continue

              try {
                const parsed = JSON.parse(data)

                // Handle different event types based on the data content
                if (parsed.streamId !== undefined && parsed.status !== undefined) {
                  // Connection event
                  console.log('[STREAMING] Connection confirmed:', parsed)
                } else if (parsed.streamId !== undefined && parsed.timestamp !== undefined) {
                  // Heartbeat event
                  console.log('[STREAMING] Heartbeat:', parsed)
                } else if (parsed.type !== undefined) {
                  // Chunk event
                  const chunk: StreamingChunk = parsed
                  console.log('[STREAMING] Received chunk:', chunk)

                  switch (chunk.type) {
                    case 'content':
                      setStreamingState(prev => {
                        const streamingAssistantIndex = prev.messages.findIndex(msg => msg.role === 'assistant' && msg.streaming === true)

                        if (streamingAssistantIndex !== -1) {
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
                } else if (parsed.role !== undefined) {
                  // Message event
                  const message = parsed
                  console.log('[STREAMING] Received message object:', message)

                  setStreamingState(prev => {
                    if (message.role === 'assistant' && message.content === '' && message.streaming === true) {
                      console.log('[STREAMING] New assistant stream started - clearing previous messages')
                      return {
                        ...prev,
                        messages: [message],
                        content: '',
                        lastUpdate: Date.now(),
                      }
                    }

                    return {
                      ...prev,
                      messages: [...prev.messages, message],
                      lastUpdate: Date.now(),
                    }
                  })
                } else if (parsed.status === 'complete') {
                  // Complete event
                  console.log('[STREAMING] Stream complete:', parsed)
                  setStreamingState(prev => ({
                    ...prev,
                    status: 'complete',
                    isStreaming: false,
                    messages: prev.messages.map(msg => (msg.streaming ? { ...msg, streaming: false, processingStatus: 'completed' } : msg)),
                    lastUpdate: Date.now(),
                  }))
                  cleanup()
                } else if (parsed.errorCode !== undefined) {
                  // Error event
                  const error: StreamingError = parsed
                  console.error('[STREAMING] Stream error:', error)
                  setStreamingState(prev => ({
                    ...prev,
                    status: 'error',
                    error,
                    isStreaming: false,
                  }))
                  cleanup()
                }
              } catch (parseError) {
                console.warn('[STREAMING] Failed to parse SSE data:', data, parseError)
              }
            }
          }
        })

        stream.on('end', () => {
          if (!mounted) return
          console.log('[STREAMING] Stream ended')
          cleanup()
        })

        stream.on('error', (error: Error) => {
          if (!mounted) return
          console.error('[STREAMING] Stream error:', error)
          const streamingError: StreamingError = {
            streamId: conversationId,
            errorCode: 'CONNECTION_ERROR',
            message: error.message || 'Lost connection to streaming server',
            timestamp: new Date().toISOString(),
            recoverable: true,
          }
          setStreamingState(prev => ({
            ...prev,
            status: 'error',
            error: streamingError,
            isStreaming: false,
          }))
          cleanup()
        })
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
