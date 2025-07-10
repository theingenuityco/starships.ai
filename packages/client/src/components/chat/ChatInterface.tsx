'use client'

import { useState, useEffect, useRef } from 'react'
import { Agent, Message, chatAPI } from '@/lib/api'
import { getChatHistory, saveChatHistory, generateSessionId } from '@/lib/storage'
import { MessageList } from './MessageList'
import { MessageInput } from './MessageInput'
import { ERROR_TEXT } from '@/constants/text'
import { useAuth } from '@/hooks/useAuth'
import { Badge } from '@/components/ui/badge'

interface ChatInterfaceProps {
  agent: Agent
  sessionId: string | null
  onSessionCreated: (sessionId: string) => void
}

export function ChatInterface({ agent, sessionId, onSessionCreated }: ChatInterfaceProps) {
  const { userId, isAuthenticated, isLoading } = useAuth()
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
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

    const sessionId = currentSessionId.current

    // Create user message with sending state
    const userMessage: Message = {
      id: Math.random().toString(36).substring(2) + Date.now().toString(36),
      content,
      role: 'user',
      timestamp: new Date().toISOString(),
      sessionId: sessionId,
      sending: true, // Mark as sending
    }

    // Add user message immediately (optimistic update)
    const updatedMessages = [...messages, userMessage]
    setMessages(updatedMessages)

    try {
      // Send message to backend
      if (!userId) {
        throw new Error('User not authenticated')
      }

      const assistantMessage = await chatAPI.sendMessage({
        agentId: agent.id,
        sessionId: sessionId,
        message: content,
      })

      // Update user message to remove sending state and add assistant message
      const finalUserMessage = { ...userMessage, sending: false }
      const finalMessages = [...messages, finalUserMessage, assistantMessage]
      setMessages(finalMessages)
      saveChatHistory(sessionId, finalMessages)

      setError(null)
    } catch (err) {
      console.error('Failed to send message:', err)
      // TODO: Implement specific error types and better error handling
      setError(ERROR_TEXT.FAILED_TO_SEND_MESSAGE)

      // Remove failed user message on error
      setMessages(messages)
      saveChatHistory(sessionId, messages)
    }
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
          <div className="ml-auto">
            <Badge variant="outline" className="ml-auto">
              {agent.model}
            </Badge>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-hidden bg-background/50">
        {/* TODO: Add accessibility improvements (ARIA labels, keyboard nav) */}
        <MessageList messages={messages} loading={loading} error={error} />
      </div>

      {/* Input */}
      <div className="border-t border-border bg-card p-6">
        <MessageInput
          onSendMessage={handleSendMessage}
          disabled={!currentSessionId.current || loading || !userId}
        />
      </div>
    </div>
  )
}
