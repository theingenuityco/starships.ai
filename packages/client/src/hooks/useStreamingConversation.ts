/**
 * useStreamingConversation - Web Worker based streaming hook
 *
 * This hook provides real-time streaming capabilities for conversations
 * using a Web Worker to completely offload processing from the main thread.
 */

import { useCallback, useEffect, useRef, useState, useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { getStreamingWorkerManager, StreamingWorkerManager } from '@/lib/streaming-worker-manager'
import { getCurrentToken } from '@/lib/api'
import { applyOperation, Operation } from 'fast-json-patch'
import { CONVERSATION_QUERY_KEYS } from './useConversations'
import type { MessageModel } from '@starships/protocol'

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
 * Hook for managing streaming conversations with Web Worker
 */
export function useStreamingConversation(conversationId: string | null) {
  const queryClient = useQueryClient()
  const workerManagerRef = useRef<StreamingWorkerManager | null>(null)
  const currentStreamIdRef = useRef<string | null>(null)

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

  // Initialize worker manager on mount
  useEffect(() => {
    workerManagerRef.current = getStreamingWorkerManager()

    return () => {
      // Clean up any active streams on unmount
      if (currentStreamIdRef.current && workerManagerRef.current) {
        workerManagerRef.current.stopStream(currentStreamIdRef.current)
      }
    }
  }, [])

  /**
   * Handle streaming events from Web Worker
   */
  const handleStreamingEvent = useCallback(
    (event: any, targetConversationId: string) => {
      const data = event.data

      // Handle JSON Patch operations
      if (data?.type === 'patch' && data.patch && Array.isArray(data.patch)) {
        console.log('[Streaming] Applying patch:', data.patch)

        // Apply patch to query cache
        queryClient.setQueryData(CONVERSATION_QUERY_KEYS.messages(targetConversationId), (old: any) => {
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
        queryClient.setQueryData(CONVERSATION_QUERY_KEYS.messages(targetConversationId), (old: any) => {
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
        currentStreamIdRef.current = null
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
        currentStreamIdRef.current = null
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
          queryClient.setQueryData(CONVERSATION_QUERY_KEYS.messages(targetConversationId), (old: any) => {
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
          queryClient.setQueryData(CONVERSATION_QUERY_KEYS.messages(targetConversationId), (old: any) => {
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
    [queryClient]
  )

  /**
   * Send a message with streaming response using Web Worker
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

      if (!workerManagerRef.current) {
        throw new Error('Worker manager not initialized')
      }

      // Stop any existing stream
      if (currentStreamIdRef.current) {
        workerManagerRef.current.stopStream(currentStreamIdRef.current)
        currentStreamIdRef.current = null
      }

      // Clear previous state
      contentAccumulatorRef.current = ''
      setStreamingState({
        status: 'connecting',
        isStreaming: true,
        content: '',
        error: null,
        lastUpdate: Date.now(),
        conversationId: targetConversationId,
      })

      try {
        // Start streaming via Web Worker
        const streamId = await workerManagerRef.current.startStream({
          url: `/api/v1/conversations/${targetConversationId}/messages?stream=true`,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: {
            content,
            agentId: options?.agentId,
            starshipId: options?.starshipId,
          },
          onEvent: event => {
            // Process events in the main thread
            // The heavy lifting of SSE parsing is done in the worker
            handleStreamingEvent(event, targetConversationId)
          },
          onStatus: status => {
            console.log('[Streaming] Status:', status)
            if (status === 'connected') {
              setStreamingState(prev => ({
                ...prev,
                status: 'streaming',
              }))
            }
          },
          onError: error => {
            console.error('[Streaming] Error:', error)
            setStreamingState(prev => ({
              ...prev,
              status: 'error',
              isStreaming: false,
              error: error.message,
            }))
            currentStreamIdRef.current = null
          },
          onComplete: () => {
            console.log('[Streaming] Complete')
            setStreamingState(prev => ({
              ...prev,
              status: 'complete',
              isStreaming: false,
            }))
            currentStreamIdRef.current = null
          },
        })

        currentStreamIdRef.current = streamId
        console.log('[Streaming] Started with stream ID:', streamId)
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
    [conversationId, handleStreamingEvent]
  )

  /**
   * Stop streaming
   */
  const stopStreaming = useCallback(() => {
    if (currentStreamIdRef.current && workerManagerRef.current) {
      workerManagerRef.current.stopStream(currentStreamIdRef.current)
      currentStreamIdRef.current = null
    }

    setStreamingState({
      status: 'idle',
      isStreaming: false,
      content: '',
      error: null,
      lastUpdate: Date.now(),
    })

    contentAccumulatorRef.current = ''
  }, [])

  // Cleanup on conversation change
  useEffect(() => {
    return () => {
      if (currentStreamIdRef.current && workerManagerRef.current) {
        workerManagerRef.current.stopStream(currentStreamIdRef.current)
        currentStreamIdRef.current = null
      }
    }
  }, [conversationId])

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
