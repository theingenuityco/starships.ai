'use client'

import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { SibilMessage, sibilAPI } from '@/lib/sibil-api'
import { getChatHistory, saveChatHistory, generateSibilSessionId } from '@/lib/storage'
import { MessageInput } from '../chat/MessageInput'
import { MessageList } from '../chat/MessageList'
import { SibilMessageBubble } from './SibilMessageBubble'
import { ModernProviderSelector } from './ModernProviderSelector'
import { StreamingIndicator } from './StreamingIndicator'
import { VisionChatContextIndicator } from '../vision/VisionChatContextIndicator'
import { ERROR_TEXT } from '@/constants/text'
import { useAuth } from '@/hooks/useAuth'
import { useSocketConnection } from '@/hooks/useSocketConnection'
import { headerVariants, inputVariants, pageVariants } from '@/lib/animations'
import { Bot } from 'lucide-react'
import type { VisionRefinementProposal } from '@starships/protocol'

interface SibilChatInterfaceProps {
  starshipId?: string;
}

export function SibilChatInterface({ starshipId }: SibilChatInterfaceProps) {
  const { userId, isAuthenticated, isLoading } = useAuth()
  const { isConnected, connectionStatus, error: connectionError } = useSocketConnection()
  const [messages, setMessages] = useState<SibilMessage[]>([])
  const [loading, setLoading] = useState(false)
  const [streaming, setStreaming] = useState(false)
  const [typingIndicator, setTypingIndicator] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [provider, setProvider] = useState<'openai' | 'anthropic'>('openai')
  const [model, setModel] = useState<string>('gpt-4')
  const sessionId = useRef<string>('sibil-session')
  const streamController = useRef<{ abort: () => void } | null>(null)

  // Vision refinement handlers
  const handleVisionProposalAction = (action: 'accept' | 'reject', proposal?: VisionRefinementProposal) => {
    // Add a system message to chat indicating the action
    const actionMessage: SibilMessage = {
      id: Date.now().toString(),
      role: 'assistant',
      content: action === 'accept'
        ? '✅ Vision refinement proposal accepted and applied to your starship.'
        : '❌ Vision refinement proposal rejected. Current vision remains unchanged.',
      timestamp: new Date().toISOString(),
      sessionId: sessionId.current,
      provider,
      model
    }
    
    const updatedMessages = [...messages, actionMessage]
    setMessages(updatedMessages)
    saveChatHistory(sessionId.current, updatedMessages)
  }

  // Initialize session when user and starship are available
  useEffect(() => {
    if (userId && isAuthenticated) {
      const newSessionId = generateSibilSessionId(userId, starshipId)
      sessionId.current = newSessionId
      loadMessages(newSessionId)
    }
  }, [userId, isAuthenticated, starshipId])

  const loadMessages = (sessionId: string) => {
    try {
      setLoading(true)
      const storedMessages = getChatHistory(sessionId) as SibilMessage[]
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
    if (!sessionId.current) {
      setError(ERROR_TEXT.NO_ACTIVE_SESSION)
      return
    }

    if (!isConnected) {
      setError('Socket.IO connection required for streaming')
      return
    }

    const currentSessionId = sessionId.current
    
    const userMessage: SibilMessage = {
      id: Math.random().toString(36).substring(2) + Date.now().toString(36),
      content,
      role: 'user',
      timestamp: new Date().toISOString(),
      sessionId: currentSessionId,
      sending: true
    }

    const updatedMessages = [...messages, userMessage]
    setMessages(updatedMessages)

    try {
      if (!userId) {
        throw new Error('User not authenticated')
      }

      const streamingMessage: SibilMessage = {
        id: Math.random().toString(36).substring(2) + Date.now().toString(36),
        content: '',
        role: 'assistant',
        timestamp: new Date().toISOString(),
        sessionId: currentSessionId,
        provider,
        model,
        streaming: true,
        structured_content: []
      }

      const finalUserMessage = { ...userMessage, sending: false }
      setMessages([...messages, finalUserMessage, streamingMessage])
      setStreaming(true)

      streamController.current = sibilAPI.sendMessageStream(
        {
          provider,
          model,
          message: content,
          sessionId: currentSessionId,
          starshipId
        },
        {
          onChunk: (chunk, accumulatedContent) => {
            setMessages(prev => prev.map(msg =>
              msg.id === streamingMessage.id
                ? {
                    ...msg,
                    content: accumulatedContent,
                    structured_content: chunk.structured_content || []
                  }
                : msg
            ))
          },
          onComplete: (finalMessage) => {
            setMessages(prev => prev.map(msg =>
              msg.id === streamingMessage.id
                ? { ...finalMessage, id: msg.id }
                : msg
            ))
            setStreaming(false)
            setTypingIndicator(false)
            
            const finalMessages = [...messages, finalUserMessage, finalMessage]
            saveChatHistory(currentSessionId, finalMessages)
          },
          onError: (error) => {
            setError(error)
            setStreaming(false)
            setTypingIndicator(false)
            setMessages(prev => prev.filter(msg => msg.id !== streamingMessage.id))
          },
          onTypingStart: () => {
            setTypingIndicator(true)
          },
          onTypingStop: () => {
            setTypingIndicator(false)
          }
        }
      )
      
      setError(null)
    } catch (err) {
      console.error('Failed to send message:', err)
      setError(ERROR_TEXT.FAILED_TO_SEND_MESSAGE)
      setStreaming(false)
      setTypingIndicator(false)
      
      setMessages(messages)
      saveChatHistory(currentSessionId, messages)
    }
  }

  const handleStopStreaming = () => {
    if (streamController.current) {
      streamController.current.abort()
      setStreaming(false)
    }
  }

  const handleProviderChange = (newProvider: 'openai' | 'anthropic') => {
    setProvider(newProvider)
    // Reset model to default for new provider
    setModel(newProvider === 'openai' ? 'gpt-4' : 'claude-3-sonnet-20240229')
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
    <div className="flex flex-col h-full bg-gradient-to-br from-background to-muted/5">
      {/* Standard Header */}
      <div className="border-b border-border/40 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Standard Avatar */}
            <div className="relative">
              <div className="absolute inset-0 bg-emerald-500/5 blur-sm" />
              <div className="relative bg-gradient-to-br from-emerald-500/15 to-emerald-500/10 p-2.5 rounded-xl shadow-sm border border-emerald-500/15">
                <Bot className="h-5 w-5 text-emerald-500" />
              </div>
            </div>
            
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-semibold text-lg text-foreground">
                  Sibil AI
                </h2>
                <div className={`w-2 h-2 rounded-full ${
                  connectionStatus === 'connected' ? 'bg-green-500' :
                  connectionStatus === 'reconnecting' ? 'bg-yellow-500' :
                  'bg-red-500'
                }`} />
              </div>
              <p className="text-xs text-muted-foreground">AI Assistant</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <AnimatePresence>
              {(streaming || typingIndicator) && (
                <StreamingIndicator
                  onStop={handleStopStreaming}
                  connectionStatus={connectionStatus}
                  isTyping={typingIndicator}
                />
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-hidden bg-background">
        {/* Vision Context Indicator */}
        <div className="p-4">
          <VisionChatContextIndicator 
            starshipId={starshipId}
            onVisionProposalAction={handleVisionProposalAction}
          />
        </div>
        
        <MessageList
          messages={messages}
          loading={loading}
          error={error}
          MessageComponent={SibilMessageBubble}
        />
      </div>

      {/* Standard Input */}
      <div className="border-t border-border/40 p-4 bg-card/50">
        <MessageInput
          onSendMessage={handleSendMessage}
          disabled={!sessionId.current || loading || !userId || streaming}
        />
      </div>
    </div>
  )
}