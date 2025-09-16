/**
 * useStreamingConversation - Simplified non-blocking streaming hook
 *
 * This hook provides real-time streaming capabilities for conversations
 * using fetchEventSource with proper event loop yielding.
 */

import { useCallback, useRef, useState, useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { getCurrentToken } from '@/lib/api'
import { applyOperation, Operation } from 'fast-json-patch'
import { CONVERSATION_QUERY_KEYS } from './useConversations'
import type { MessageModel } from '@starships/protocol'
import { fetchEventSource } from '@microsoft/fetch-event-source'

export interface StreamingState {
  status: 'idle' | 'connecting' | 'streaming' | 'complete' | 'error'
  isStreaming: boolean
  content: string
  error: any
  lastUpdate: number
  messageId?: string
  conversationId?: string
}

interface StreamingMessage extends MessageModel {
  streaming?: boolean
  streamingContent?: string
  contentChunks?: Array<{
    content: string
    position: number
    timestamp: number
  }>
}

/**
 * Hook for managing streaming conversations with non-blocking updates
 */
export function useStreamingConversation(conversationId: string | null) {
  const queryClient = useQueryClient()
  const abortControllerRef = useRef<AbortController | null>(null)
  const completedRef = useRef(false)
  const shouldRetryRef = useRef(true)

  // Streaming state with optimized updates
  const [streamingState, setStreamingState] = useState<StreamingState>({
    status: 'idle',
    isStreaming: false,
    content: '',
    error: null,
    lastUpdate: Date.now(),
  })

  // Track accumulated content separately for performance
  const contentAccumulatorRef = useRef<string>('')
  const processingQueueRef = useRef<any[]>([])
  const isProcessingRef = useRef(false)

  /**
   * Process queued events with yielding to prevent blocking
   */
  const processEventQueue = useCallback(async () => {
    if (isProcessingRef.current || processingQueueRef.current.length === 0) {
      return
    }

    isProcessingRef.current = true

    while (processingQueueRef.current.length > 0) {
      const event = processingQueueRef.current.shift()

      try {
        // Process the event
        await processStreamingEvent(event)

        // Yield to the event loop after each event
        await new Promise(resolve => {
          if (typeof requestIdleCallback !== 'undefined') {
            requestIdleCallback(() => resolve(undefined))
          } else {
            setTimeout(resolve, 0)
          }
        })
      } catch (error) {
        console.error('[Streaming] Error processing event:', error)
      }
    }

    isProcessingRef.current = false
  }, [])

  /**
   * Process a single streaming event
   */
  const processStreamingEvent = useCallback(
    async (data: any) => {
      const targetConversationId = data.conversationId || conversationId

      // Handle JSON Patch operations
      if (data?.type === 'patch' && data.patch && Array.isArray(data.patch)) {
        console.log('[Streaming] Applying patch:', data.patch)

        // Apply patch to query cache
        queryClient.setQueryData(CONVERSATION_QUERY_KEYS.messages(targetConversationId!), (old: any) => {
          if (!old) {
            const initialData = {
              messages: [],
              total: 0,
              conversationId: targetConversationId,
            }

            try {
              const result = applyOperation(initialData, data as Operation, true)
              return processContentChunks(result.newDocument)
            } catch (error) {
              console.error('[Streaming] Patch application failed:', error)
              return initialData
            }
          }

          try {
            const result = applyOperation(old, data as Operation, true)
            return processContentChunks({
              ...result.newDocument,
              lastActivityAt: new Date().toISOString(),
            })
          } catch (error) {
            console.error('[Streaming] Patch application failed:', error)
            return old
          }
        })

        // Update streaming state
        setStreamingState(prev => ({
          ...prev,
          status: 'streaming',
          isStreaming: true,
          lastUpdate: Date.now(),
        }))

        return
      }

      // Handle content streaming
      if (data?.content && typeof data.content === 'string') {
        contentAccumulatorRef.current += data.content

        // Update state with accumulated content
        setStreamingState(prev => ({
          ...prev,
          status: 'streaming',
          isStreaming: true,
          content: contentAccumulatorRef.current,
          lastUpdate: Date.now(),
        }))

        return
      }

      // Handle delta content
      if (data?.delta?.content) {
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

      // Handle complete event
      if (data?.status === 'complete' || data?.type === 'done') {
        console.log('[Streaming] Stream complete')

        // Mark streaming messages as complete
        queryClient.setQueryData(CONVERSATION_QUERY_KEYS.messages(targetConversationId!), (old: any) => {
          if (!old) return old
          return {
            ...old,
            messages: old.messages.map((msg: StreamingMessage) => (msg.streaming ? { ...msg, streaming: false, processingStatus: 'completed' } : msg)),
          }
        })

        // Clear streaming state
        setStreamingState({
          status: 'complete',
          isStreaming: false,
          content: '',
          error: null,
          lastUpdate: Date.now(),
        })

        contentAccumulatorRef.current = ''

        // Mark complete and hard-stop the SSE client to avoid POST retries
        completedRef.current = true
        shouldRetryRef.current = false
        if (abortControllerRef.current) {
          try {
            abortControllerRef.current.abort()
          } catch {}
          abortControllerRef.current = null
        }
        return
      }

      // Handle error event
      if (data?.errorCode) {
        console.error('[Streaming] Error:', data)

        setStreamingState(prev => ({
          ...prev,
          status: 'error',
          isStreaming: false,
          error: data,
          lastUpdate: Date.now(),
        }))

        contentAccumulatorRef.current = ''
        return
      }

      // Handle message objects
      if (data?.role !== undefined) {
        const message = data as StreamingMessage

        // Start streaming for empty assistant message
        if (message.role === 'assistant' && (!message.content || message.content.trim() === '')) {
          console.log('[Streaming] Starting assistant message stream')

          setStreamingState(prev => ({
            ...prev,
            status: 'streaming',
            isStreaming: true,
            content: '',
            messageId: message.id,
            lastUpdate: Date.now(),
          }))

          contentAccumulatorRef.current = ''

          // Add streaming message to cache
          queryClient.setQueryData(CONVERSATION_QUERY_KEYS.messages(targetConversationId!), (old: any) => {
            if (!old)
              return {
                messages: [{ ...message, streaming: true }],
                total: 1,
                conversationId: targetConversationId,
              }
            return {
              ...old,
              messages: [...old.messages, { ...message, streaming: true }],
              total: old.total + 1,
            }
          })
        } else {
          // Add regular message to cache
          queryClient.setQueryData(CONVERSATION_QUERY_KEYS.messages(targetConversationId!), (old: any) => {
            if (!old)
              return {
                messages: [message],
                total: 1,
                conversationId: targetConversationId,
              }
            return {
              ...old,
              messages: [...old.messages, message],
              total: old.total + 1,
            }
          })
        }
      }
    },
    [conversationId, queryClient]
  )

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

  /**
   * Send a message with streaming response
   */
  const sendMessageWithStreaming = useCallback(
    async (
      content: string,
      options?: {
        agentId?: string
        starshipId?: string
        conversationId?: string // Allow passing conversationId directly
      }
    ): Promise<void> => {
      // Use provided conversationId or fall back to hook's conversationId
      const targetConversationId = options?.conversationId || conversationId

      if (!targetConversationId) {
        throw new Error('No conversation ID available')
      }

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

      // Reset retry/completion flags to allow retries only while actively streaming
      completedRef.current = false
      shouldRetryRef.current = true

      // Clear previous state
      contentAccumulatorRef.current = ''
      processingQueueRef.current = []
      setStreamingState({
        status: 'connecting',
        isStreaming: true,
        content: '',
        error: null,
        lastUpdate: Date.now(),
        conversationId: targetConversationId,
      })

      try {
        // Use fetchEventSource for proper SSE handling
        await fetchEventSource(`/api/v1/conversations/${targetConversationId}/messages?stream=true`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            content,
            agentId: options?.agentId,
            starshipId: options?.starshipId,
          }),
          signal: abortControllerRef.current.signal,
          openWhenHidden: true,

          async onopen(response) {
            if (response.ok) {
              console.log('[Streaming] Connection opened')
              setStreamingState(prev => ({
                ...prev,
                status: 'streaming',
              }))
              return
            }
            throw new Error(`HTTP ${response.status}: ${response.statusText}`)
          },

          onmessage(event) {
            if (!event.data) return

            try {
              const parsed = JSON.parse(event.data)
              parsed.conversationId = targetConversationId

              // Queue the event for non-blocking processing
              queueEvent(parsed)
            } catch (error) {
              console.warn('[Streaming] Failed to parse SSE data:', event.data, error)
            }
          },

          onclose() {
            console.log('[Streaming] Connection closed')
            // Mark as completed and prevent retries
            completedRef.current = true
            shouldRetryRef.current = false
            // Abort and clear controller to stop any reconnection attempts
            if (abortControllerRef.current) {
              try {
                abortControllerRef.current.abort()
              } catch {}
              abortControllerRef.current = null
            }
            setStreamingState(prev => ({
              ...prev,
              status: 'complete',
              isStreaming: false,
            }))
          },

          onerror(error) {
            console.error('[Streaming] Error:', error)
            // If aborted or completed, suppress retries
            if (abortControllerRef.current?.signal.aborted || completedRef.current || !shouldRetryRef.current) {
              console.log('[Streaming] Suppressing retry after completion/abort')
              return
            }
            setStreamingState(prev => ({
              ...prev,
              status: 'error',
              isStreaming: false,
              error: error,
            }))
            // Throw to allow retry while actively streaming
            throw error
          },
        })
      } catch (error) {
        console.error('[Streaming] Failed to start:', error)
        setStreamingState(prev => ({
          ...prev,
          status: 'error',
          isStreaming: false,
          error: error,
        }))
        throw error
      }
    },
    [conversationId, queueEvent]
  )

  /**
   * Stop streaming
   */
  const stopStreaming = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    // Prevent any further retries after a manual stop
    shouldRetryRef.current = false

    processingQueueRef.current = []

    setStreamingState({
      status: 'idle',
      isStreaming: false,
      content: '',
      error: null,
      lastUpdate: Date.now(),
    })

    contentAccumulatorRef.current = ''
  }, [])

  // Memoized return value
  return useMemo(
    () => ({
      streamingState,
      isStreaming: streamingState.isStreaming,
      streamingContent: streamingState.content,
      sendMessageWithStreaming,
      stopStreaming,
    }),
    [streamingState, sendMessageWithStreaming, stopStreaming]
  )
}

/**
 * Process content chunks for streaming messages
 */
function processContentChunks(data: any): any {
  if (!data.messages || !Array.isArray(data.messages)) {
    return data
  }

  const processedMessages = data.messages.map((message: StreamingMessage) => {
    if (message.contentChunks && Array.isArray(message.contentChunks)) {
      const sortedChunks = [...message.contentChunks].sort((a, b) => a.position - b.position)

      let streamedContent = ''
      for (const chunk of sortedChunks) {
        streamedContent += chunk.content
      }

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
