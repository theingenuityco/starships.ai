import axios, { AxiosResponse } from 'axios'
import { getCurrentToken } from '@/lib/api'
import type { StreamingState as BaseStreamingState, StreamingChunk, StreamingError } from '@starships/protocol'
import { useCallback, useEffect, useRef, useState } from 'react'

// Extend StreamingState for client-side usage
interface StreamingState extends BaseStreamingState {
  lastUpdate?: number
  messages: any[] // Array of complete message objects
}

/**
 * Simplified streaming state hook for POST-based streaming
 * No GET requests, just manages streaming state that can be updated from POST responses
 */
export function useMessageStreaming(conversationId: string | null | undefined) {
  const [streamingState, setStreamingState] = useState<StreamingState>({
    status: 'idle',
    streamId: conversationId || null,
    content: '',
    error: null,
    isStreaming: false,
    messages: [],
  })

  // Handle streaming events from POST responses
  const handleStreamingEvent = useCallback((data: any) => {
    // Connection confirmation
    if (data.streamId !== undefined && data.status === 'connected') {
      setStreamingState(prev => ({ ...prev, status: 'idle' }))
      return
    }

    // Heartbeat
    if (data.timestamp !== undefined && Object.keys(data).length === 1) {
      return
    }

    // Streaming chunks (incremental content)
    if (data.type !== undefined && data.type === 'content') {
      const chunk: StreamingChunk = data

      setStreamingState(prev => {
        // Find the LAST streaming assistant message (most recent one) and update it
        const updatedMessages = [...prev.messages]
        let foundStreamingMessage = false

        // Update from the end to find the most recent streaming assistant message
        for (let i = updatedMessages.length - 1; i >= 0; i--) {
          const msg = updatedMessages[i]
          if (msg.role === 'assistant' && msg.streaming === true && !foundStreamingMessage) {
            updatedMessages[i] = {
              ...msg,
              content: (msg.content || '') + chunk.content,
              contentLength: ((msg.content || '') + chunk.content).length,
              updatedAt: new Date().toISOString(),
            }
            foundStreamingMessage = true
            break
          }
        }

        return {
          ...prev,
          status: 'streaming',
          isStreaming: true,
          messages: updatedMessages,
          content: prev.content + chunk.content, // Keep global content as fallback
          lastUpdate: Date.now(),
        }
      })
      return
    }

    // Other chunk types (node events, thinking, etc.)
    if (data.type !== undefined) {
      return
    }

    // Complete message objects
    if (data.role !== undefined) {
      const message = data

      setStreamingState(prev => {
        // Empty assistant message - start a new streaming message
        if (message.role === 'assistant' && (!message.content || message.content.trim() === '')) {
          return {
            ...prev,
            status: 'streaming',
            isStreaming: true,
            messages: [...prev.messages, { ...message, streaming: true }],
            lastUpdate: Date.now(),
          }
        }

        // Any other message types (user, system, assistant with content) - just add them
        return {
          ...prev,
          messages: [...prev.messages, message],
          lastUpdate: Date.now(),
        }
      })
      return
    }

    // Complete event
    if (data.status === 'complete' || data.source !== undefined) {
      setStreamingState(prev => ({
        ...prev,
        status: 'complete',
        isStreaming: false,
        // Mark all streaming messages as complete, don't remove them
        messages: prev.messages.map(msg => (msg.streaming ? { ...msg, streaming: false, processingStatus: 'completed' } : msg)),
        lastUpdate: Date.now(),
      }))
      return
    }

    // Error event
    if (data.errorCode !== undefined) {
      const error: StreamingError = data
      setStreamingState(prev => ({
        ...prev,
        status: 'error',
        error,
        isStreaming: false,
      }))
      return
    }
  }, []) // Empty dependency array since we use functional state updates

  // Reset state when conversationId changes
  useEffect(() => {
    setStreamingState(prev => ({
      ...prev,
      streamId: conversationId || null,
      status: 'idle',
      isStreaming: false,
      content: '',
      messages: [],
      error: null,
    }))
  }, [conversationId])

  return {
    streamingState,
    isStreaming: streamingState.isStreaming,
    streamingContent: streamingState.content,
    streamingMessages: streamingState.messages,
    streamingStatus: streamingState.status,
    streamingError: streamingState.error,
    handleStreamingEvent, // Export this so POST request can use it
  }
}
