'use client'

import { useState, useEffect, useRef } from 'react'
import { Agent, Message, chatAPI } from '@/lib/api'
import { getChatHistory, saveChatHistory, generateSessionId } from '@/lib/storage'
import { MessageList } from './MessageList'
import { MessageInput } from './MessageInput'
import { ERROR_TEXT } from '@/constants/text'

interface ChatInterfaceProps {
  agent: Agent
  sessionId: string | null
  onSessionCreated: (sessionId: string) => void
}

export function ChatInterface({ agent, sessionId, onSessionCreated }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const currentSessionId = useRef<string | null>(sessionId)

  // Initialize session when agent changes  
  useEffect(() => {
    if (!sessionId && agent) {
      initializeSession()
    }
  }, [agent, sessionId])

  // Load messages when session changes
  useEffect(() => {
    if (sessionId) {
      loadMessages(sessionId)
    } else {
      setMessages([])
    }
  }, [sessionId])

  const initializeSession = () => {
    // TODO: Add debouncing for rapid agent switching
    const newSessionId = generateSessionId(agent.id, 'user-1') // Hardcoded user ID for now
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
      sending: true // Mark as sending
    }

    // Add user message immediately (optimistic update)
    const updatedMessages = [...messages, userMessage]
    setMessages(updatedMessages)

    try {
      // Send message to backend
      const assistantMessage = await chatAPI.sendMessage({
        agentId: agent.id,
        userId: 'user-1', // Hardcoded user ID for now
        sessionId: sessionId,
        message: content
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

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b border-border bg-card px-6 py-4">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center">
            <span className="text-primary-foreground text-sm font-medium">
              {agent.name.charAt(0).toUpperCase()}
            </span>
          </div>
          <div>
            <h2 className="font-semibold">{agent.name}</h2>
            <p className="text-sm text-muted-foreground">{agent.systemPrompt || 'AI Assistant'}</p>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-hidden">
        {/* TODO: Add accessibility improvements (ARIA labels, keyboard nav) */}
        <MessageList 
          messages={messages} 
          loading={loading} 
          error={error}
        />
      </div>

      {/* Input */}
      <div className="border-t border-border bg-card p-4">
        <MessageInput 
          onSendMessage={handleSendMessage}
          disabled={!currentSessionId.current || loading}
        />
      </div>
    </div>
  )
} 