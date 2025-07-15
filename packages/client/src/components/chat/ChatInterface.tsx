'use client'

import { useState, useEffect, useRef } from 'react'
import { Agent, chatAPI } from '@/lib/api'
import type { Message } from '@/lib/agent-socket-api'
import { getChatHistory, saveChatHistory, generateSessionId } from '@/lib/storage'
import { MessageList } from './MessageList'
import { MessageInput } from './MessageInput'
import { ERROR_TEXT } from '@/constants/text'
import { useAuth } from '@/hooks/useAuth'
import { Badge } from '@/components/ui/badge'
import { agentSocketAPI } from '@/lib/agent-socket-api'
import { useSocketConnection } from '@/hooks/useSocketConnection'
import { useTypewriter } from '@/hooks/useTypewriter'
import { Wifi, WifiOff, AlertCircle } from 'lucide-react'

interface ChatInterfaceProps {
  agent: Agent
  sessionId: string | null
  onSessionCreated: (sessionId: string) => void
}

export function ChatInterface({ agent, sessionId, onSessionCreated }: ChatInterfaceProps) {
  const { userId, isAuthenticated, isLoading } = useAuth()
  
  // Socket.IO connection
  const { isConnected, connectionStatus, error: connectionError } = useSocketConnection()
  
  // Typewriter effect
  const typewriter = useTypewriter({
    onComplete: () => setLoading(false)
  })
  
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null)
  const [currentStreamAbort, setCurrentStreamAbort] = useState<(() => void) | null>(null)
  const currentSessionId = useRef<string | null>(sessionId)

  // Initialize session when agent changes and user is available
  useEffect(() => {
    if (!sessionId && agent && userId && isAuthenticated) {
      initializeSession()
    }
  }, [agent, sessionId, userId, isAuthenticated])

  // Load messages when session changes
  useEffect(() => {
    if (sessionId) {
      loadMessages(sessionId)
    } else {
      setMessages([])
    }
  }, [sessionId])

  const initializeSession = () => {
    if (!userId) {
      setError('User not authenticated')
      return
    }

    // TODO: Add debouncing for rapid agent switching
    const newSessionId = generateSessionId(agent.id, userId) // Use real user ID from auth
    currentSessionId.current = newSessionId
    onSessionCreated(newSessionId)
    setError(null)
  }

  const loadMessages = (sessionId: string) => {
    try {
      setLoading(true)
      const storedMessages = getChatHistory(sessionId)
      setMessages(storedMessages)
      setError(null)
    } catch (err) {
      console.error('Failed to load messages:', err)
      setError(ERROR_TEXT.FAILED_TO_LOAD_MESSAGES)
    } finally {
      setLoading(false)
    }
  }

  const handleSendMessage = async (content: string) => {
    if (!currentSessionId.current) {
      setError(ERROR_TEXT.NO_ACTIVE_SESSION)
      return
    }

    // Check Socket.IO connection
    if (!isConnected) {
      setError('Socket.IO connection required. Please check your connection and try again.')
      return
    }

    const sessionId = currentSessionId.current

    // Create user message with sending state
    const userMessage: Message = {
      id: Math.random().toString(36).substring(2) + Date.now().toString(36),
      content,
      role: 'user',
      timestamp: new Date().toISOString(),
      sessionId: sessionId,
      sending: true,
    }

    // Add user message immediately (optimistic update)
    const updatedMessages = [...messages, userMessage]
    setMessages(updatedMessages)
    setLoading(true)
    setError(null)
    typewriter.reset()

    // Create streaming assistant message ID but don't add the message yet
    const assistantMessageId = `assistant-${Date.now()}`
    setStreamingMessageId(assistantMessageId)

    // Keep the user message in sending state until first chunk arrives
    setMessages(updatedMessages)

    // Start Socket.IO streaming
    const { abort } = agentSocketAPI.sendMessageStream(agent.id, {
      sessionId,
      message: content
    }, {
      onChunk: (chunk, accumulated) => {
        // Create assistant message on first chunk, then update with accumulated content
        // Also mark user message as no longer sending on first chunk
        setMessages(prev => {
          const hasAssistantMessage = prev.some(msg => msg.id === assistantMessageId)
          
          if (!hasAssistantMessage) {
            // First chunk - create the assistant message and mark user message as sent
            const streamingMessage: Message = {
              id: assistantMessageId,
              content: accumulated,
              role: 'assistant',
              timestamp: new Date().toISOString(),
              sessionId: sessionId,
              streaming: true,
              agentId: agent.id
            }
            return prev.map(msg =>
              msg.id === userMessage.id && msg.sending
                ? { ...msg, sending: false }
                : msg
            ).concat(streamingMessage)
          } else {
            // Subsequent chunks - update existing message
            return prev.map(msg =>
              msg.id === assistantMessageId
                ? { ...msg, content: accumulated }
                : msg
            )
          }
        })
      },
      onComplete: (finalMessage) => {
        // Update the streaming message to final state
        setMessages(prev => {
          const updatedMessages = prev.map(msg =>
            msg.id === assistantMessageId
              ? {
                  ...finalMessage,
                  id: assistantMessageId,
                  streaming: false
                }
              : msg
          )
          
          // Save to history
          saveChatHistory(sessionId, updatedMessages)
          return updatedMessages
        })
        
        setStreamingMessageId(null)
        setLoading(false)
        setError(null)
      },
      onError: (error) => {
        console.error('Failed to send message:', error)
        setError(`Chat failed: ${error}. Please check your connection and try again.`)
        
        // Remove failed streaming message
        setMessages(prev => prev.filter(msg => msg.id !== assistantMessageId))
        setStreamingMessageId(null)
        setLoading(false)
        
        // Save messages without the failed attempt
        setMessages(prev => {
          const cleanMessages = prev.filter(msg => msg.id !== assistantMessageId)
          saveChatHistory(sessionId, cleanMessages)
          return cleanMessages
        })
      },
      onTypingStart: () => {
        // Removed typing indicator - content streams directly
      },
      onTypingStop: () => {
        // Removed typing indicator - content streams directly
      }
    })

    // Store abort function for stream cancellation
    setCurrentStreamAbort(() => abort)
  }

  // Show loading state while auth is loading
  if (isLoading) {
    return (
      <div className="flex flex-col h-full items-center justify-center">
        <div className="text-muted-foreground">Loading user session...</div>
      </div>
    )
  }

  // Show auth required state
  if (!isAuthenticated) {
    return (
      <div className="flex flex-col h-full items-center justify-center">
        <div className="text-muted-foreground">Authentication required</div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b border-border bg-card px-8 py-5 shadow-sm">
        <div className="flex items-center space-x-4">
          <div className="w-10 h-10 bg-primary rounded-full flex items-center justify-center ring-4 ring-primary/20">
            <span className="text-primary-foreground text-sm font-medium">
              {agent.name.charAt(0).toUpperCase()}
            </span>
          </div>
          <div>
            <h2 className="font-semibold text-lg">{agent.name}</h2>
            <p className="text-sm text-muted-foreground flex items-center">
              <span className="inline-block w-2 h-2 rounded-full bg-green-500 mr-2"></span>
              {agent.systemPrompt || 'AI Assistant'}
            </p>
          </div>
          <div className="ml-auto flex items-center gap-3">
            {/* Enhanced Connection Status Badge */}
            <div className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs border ${
              isConnected
                ? 'bg-green-50 border-green-200 text-green-700'
                : connectionStatus === 'reconnecting'
                ? 'bg-yellow-50 border-yellow-200 text-yellow-700'
                : 'bg-red-50 border-red-200 text-red-700'
            }`}>
              {isConnected ? (
                <>
                  <Wifi className="w-3 h-3" />
                  <span>Connected</span>
                </>
              ) : connectionStatus === 'reconnecting' ? (
                <>
                  <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  <span>Reconnecting...</span>
                </>
              ) : (
                <>
                  <WifiOff className="w-3 h-3" />
                  <span>Disconnected</span>
                </>
              )}
            </div>

            {/* Connection Error Indicator */}
            {connectionError && (
              <div className="flex items-center gap-1 px-2 py-1 rounded-md text-xs bg-red-50 border border-red-200 text-red-700">
                <AlertCircle className="w-3 h-3" />
                <span>Error</span>
              </div>
            )}
            
            <Badge variant="outline">
              {agent.model}
            </Badge>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-hidden bg-background/50">
        {/* TODO: Add accessibility improvements (ARIA labels, keyboard nav) */}
        <MessageList
          messages={messages}
          loading={loading}
          error={error}
        />
      </div>


      {/* Input */}
      <div className="border-t border-border bg-card p-6">
        <MessageInput
          onSendMessage={handleSendMessage}
          disabled={!currentSessionId.current || loading || !userId || !isConnected}
        />
        
        {/* Connection Error Message */}
        {error && (
          <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
            {error}
          </div>
        )}
      </div>
    </div>
  )
}
