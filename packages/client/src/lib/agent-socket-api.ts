import SocketClient from '@/lib/socket-client'
import { generateId } from '@/lib/utils'
import type { ChatTypingData, ConversationError, ConversationRequest, ConversationStreamChunk } from '@starships/protocol'

export interface Message {
  id: string
  content: string
  role: 'user' | 'assistant'
  timestamp: string
  conversationId: string
  agentId?: string
  sending?: boolean
  streaming?: boolean
  streamId?: string
  usage?: {
    promptTokens: number
    completionTokens: number
  }
}

export interface AgentRequest {
  agentId: string
  message: string
  conversationId?: string
}

export const agentSocketAPI = {
  sendMessageStream: (
    agentId: string,
    request: { conversationId?: string; message: string },
    callbacks: {
      onChunk: (chunk: ConversationStreamChunk, accumulatedContent: string) => void
      onComplete: (message: Message) => void
      onError: (error: string) => void
      onTypingStart?: () => void
      onTypingStop?: () => void
    }
  ): { abort: () => void } => {
    const socketClient = SocketClient.getInstance()
    const socket = socketClient.getSocket()

    if (!socket || !socketClient.isConnected()) {
      callbacks.onError('Socket.IO connection required - please check your connection')
      return { abort: () => {} }
    }

    const streamId = generateId()
    let accumulatedContent = ''
    let isAborted = false

    const socketRequest: ConversationRequest = {
      source: 'agent',
      agentId: agentId,
      conversationId: request.conversationId,
      message: request.message,
      streamId: streamId,
      userId: 'client-user', // Overridden by server auth
      typewriterEnabled: true,
      typingSpeed: 75,
    }

    const handleStreamChunk = (chunk: ConversationStreamChunk) => {
      if (chunk.streamId === streamId && chunk.agentId === agentId && chunk.source === 'agent' && !isAborted) {
        if (chunk.typewriter?.type === 'character') {
          accumulatedContent += chunk.typewriter.content
          callbacks.onChunk(chunk, accumulatedContent)
        } else if (chunk.content) {
          // Handle non-typewriter content
          accumulatedContent += chunk.content
          callbacks.onChunk(chunk, accumulatedContent)
        }
      }
    }

    const handleStreamComplete = (chunk: ConversationStreamChunk) => {
      if (chunk.streamId === streamId && chunk.agentId === agentId && chunk.source === 'agent' && chunk.type === 'complete' && !isAborted) {
        // Extract conversationId from server's metadata or fallback to provided conversationId
        const serverConversationId = chunk.metadata?.conversationId as string
        const finalConversationId = serverConversationId || request.conversationId || 'unknown'

        const finalMessage: Message = {
          id: generateId(),
          content: chunk.content,
          role: 'assistant',
          timestamp: new Date(chunk.timestamp).toISOString(),
          conversationId: finalConversationId, // Use server-provided conversationId
          agentId: chunk.agentId,
          streaming: false,
          usage: undefined, // Usage not available in stream chunks
        }
        callbacks.onComplete(finalMessage)
        cleanup()
      }
    }

    const handleStreamError = (error: ConversationError) => {
      if (error.streamId === streamId && error.agentId === agentId && !isAborted) {
        callbacks.onError(error.message)
        cleanup()
      }
    }

    const handleTypingStart = (data: ChatTypingData) => {
      if (data.isTyping) {
        callbacks.onTypingStart?.()
      }
    }

    const handleTypingStop = (data: ChatTypingData) => {
      if (!data.isTyping) {
        callbacks.onTypingStop?.()
      }
    }

    const cleanup = () => {
      socket.off('conversation:stream-chunk', handleStreamChunk)
      socket.off('conversation:stream-complete', handleStreamComplete)
      socket.off('conversation:stream-error', handleStreamError)
      socket.off('conversation:typing-start', handleTypingStart)
      socket.off('conversation:typing-stop', handleTypingStop)
    }

    // Set up event listeners
    socket.on('conversation:stream-chunk', handleStreamChunk)
    socket.on('conversation:stream-complete', handleStreamComplete)
    socket.on('conversation:stream-error', handleStreamError)
    socket.on('conversation:typing-start', handleTypingStart)
    socket.on('conversation:typing-stop', handleTypingStop)

    // Join agent room for this conversation
    socketClient.joinAgentRoom(agentId, 'current-user') // Will be overridden by server auth

    // Start the stream
    socket.emit('conversation:start-stream', socketRequest)

    return {
      abort: () => {
        isAborted = true
        socket.emit('conversation:stop-stream', streamId)
        socketClient.leaveAgentRoom(agentId, 'current-user')
        cleanup()
      },
    }
  },

  // Utility method to join agent room
  joinAgentRoom: (agentId: string, userId: string) => {
    const socketClient = SocketClient.getInstance()
    socketClient.joinAgentRoom(agentId, userId)
  },

  // Utility method to leave agent room
  leaveAgentRoom: (agentId: string, userId: string) => {
    const socketClient = SocketClient.getInstance()
    socketClient.leaveAgentRoom(agentId, userId)
  },
}
