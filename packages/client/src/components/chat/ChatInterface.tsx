'use client'

import { useState, useEffect, useRef } from 'react'
import { Agent, Message, chatAPI } from '@/lib/api'
import { MessageList } from './MessageList'
import { MessageInput } from './MessageInput'
import { generateId } from '@/lib/utils'

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

  // Initialize chat session when agent changes
  useEffect(() => {
    if (!sessionId && agent) {
      initializeSession()
    }
  }, [agent, sessionId])

  // Fetch messages when session changes
  useEffect(() => {
    if (sessionId) {
      fetchMessages(sessionId)
    } else {
      setMessages([])
    }
  }, [sessionId])

  const initializeSession = async () => {
    try {
      setLoading(true)
      const session = await chatAPI.createSession({
        agentId: agent.id,
        userId: 'user-1' // In a real app, this would come from auth context
      })
      currentSessionId.current = session.id
      onSessionCreated(session.id)
      setError(null)
    } catch (err) {
      console.error('Failed to create chat session:', err)
      setError('Failed to start chat session. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const fetchMessages = async (channelId: string) => {
    try {
      setLoading(true)
      const fetchedMessages = await chatAPI.getMessages(channelId)
      setMessages(fetchedMessages)
      setError(null)
    } catch (err) {
      console.error('Failed to fetch messages:', err)
      setError('Failed to load messages. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleSendMessage = async (content: string) => {
    if (!currentSessionId.current) {
      setError('No active chat session')
      return
    }

    // Add user message immediately (optimistic update)
    const userMessage: Message = {
      id: generateId(),
      content,
      role: 'user',
      timestamp: new Date().toISOString(),
      channelId: currentSessionId.current
    }

    setMessages(prev => [...prev, userMessage])

    try {
      // Send message to API
      const response = await chatAPI.sendMessage({
        content,
        channelId: currentSessionId.current
      })

      // Replace optimistic message with server response
      setMessages(prev => 
        prev.map(msg => msg.id === userMessage.id ? response : msg)
      )
      
      setError(null)
    } catch (err) {
      console.error('Failed to send message:', err)
      setError('Failed to send message. Please try again.')
      
      // Remove failed message
      setMessages(prev => prev.filter(msg => msg.id !== userMessage.id))
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
            <p className="text-sm text-muted-foreground">{agent.description}</p>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-hidden">
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