import { getCurrentToken } from '@/lib/api'
import type { StreamingState as BaseStreamingState, StreamingChunk, StreamingConnection, StreamingError, StreamingHeartbeat } from '@starships/protocol'
import { useCallback, useEffect, useRef, useState } from 'react'

// Extend StreamingState for client-side usage
interface StreamingState extends BaseStreamingState {
  lastUpdate?: number
}

/**
 * Pure streaming hook that handles SSE connection for a given streamId
 * Separated from message creation to avoid async closure blocking React renders
 */
export function useMessageStreaming(streamId: string | null | undefined, conversationId?: string) {
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

  // Start streaming when streamId is provided
  useEffect(() => {
    if (!streamId || !conversationId) {
      return
    }

    let mounted = true

    const startStreaming = async () => {
      try {
        // Set initial streaming state
        setStreamingState(prev => ({
          ...prev,
          streamId,
          status: 'connecting',
          content: '',
          error: null,
          isStreaming: true,
        }))

        // Get JWT token for SSE authentication
        const token = await getCurrentToken()

        // Connect to streaming endpoint with streamId and token
        let sseUrl = `/api/v1/conversations/${conversationId}/messages/stream?streamId=${streamId}`
        if (token) {
          sseUrl += `&token=${encodeURIComponent(token)}`
        }

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

        eventSource.addEventListener('chunk', (event: MessageEvent) => {
          if (!mounted) return
          const chunk: StreamingChunk = JSON.parse(event.data)
          console.log('[STREAMING] Received chunk:', chunk)

          switch (chunk.type) {
            case 'content':
              // Direct state update - React will handle re-rendering in real-time
              setStreamingState(prev => ({
                ...prev,
                content: prev.content + chunk.content,
                lastUpdate: Date.now(),
              }))
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
          console.log('[STREAMING] Stream complete:', JSON.parse(event.data))
          setStreamingState(prev => ({ ...prev, status: 'complete' }))
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
            streamId: streamId,
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
          streamId: streamId,
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
  }, [streamId, conversationId, cleanup])

  // Cleanup on unmount
  useEffect(() => {
    return cleanup
  }, [cleanup])

  return {
    streamingState,
    isStreaming: streamingState.isStreaming,
    streamingContent: streamingState.content,
    streamingStatus: streamingState.status,
    streamingError: streamingState.error,
    cleanup,
  }
}
