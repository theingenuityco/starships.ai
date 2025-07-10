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
import { ERROR_TEXT } from '@/constants/text'
import { useAuth } from '@/hooks/useAuth'
import { useSocketConnection } from '@/hooks/useSocketConnection'
import { headerVariants, inputVariants, pageVariants } from '@/lib/animations'
import { Bot } from 'lucide-react'

export function SibilChatInterface() {
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

  // Initialize session when user is available
  useEffect(() => {
    if (userId && isAuthenticated) {
      const newSessionId = generateSibilSessionId(userId)
      sessionId.current = newSessionId
      loadMessages(newSessionId)
    }
  }, [userId, isAuthenticated])

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
          sessionId: currentSessionId
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
    <motion.div
      className="flex flex-col h-full bg-gradient-to-br from-background via-background to-muted/20"
      variants={pageVariants}
      initial="initial"
      animate="in"
      exit="out"
    >
      {/* Modern Header with Glassmorphism */}
      <motion.div
        className="border-b border-white/10 sibil-glass backdrop-blur-md px-6 py-4 relative overflow-hidden"
        variants={headerVariants}
        initial="hidden"
        animate="visible"
      >
        {/* Background gradient overlay */}
        <div
          className="absolute inset-0 opacity-20"
          style={{
            background: 'var(--sibil-gradient-neural)'
          }}
        />
        
        <div className="relative flex items-center justify-between">
          <div className="flex items-center space-x-4">
            {/* Enhanced Avatar */}
            <motion.div
              className="w-10 h-10 rounded-full flex items-center justify-center shadow-lg relative overflow-hidden"
              style={{
                background: 'var(--sibil-gradient-primary)'
              }}
              whileHover={{ scale: 1.05, rotate: 5 }}
              whileTap={{ scale: 0.95 }}
            >
              <Bot className="h-5 w-5 text-white" />
              <motion.div
                className="absolute inset-0 rounded-full"
                animate={{
                  boxShadow: [
                    '0 0 0 0 rgba(99, 102, 241, 0.4)',
                    '0 0 0 8px rgba(99, 102, 241, 0)',
                    '0 0 0 0 rgba(99, 102, 241, 0)'
                  ]
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  ease: "easeOut"
                }}
              />
            </motion.div>
            
            <div>
              <motion.h2
                className="font-bold text-xl sibil-gradient-text"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 }}
              >
                Sibil AI
              </motion.h2>
              <motion.p
                className="text-sm text-muted-foreground"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 }}
              >
                Direct AI conversation with streaming
              </motion.p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <AnimatePresence>
              {(streaming || typingIndicator) && (
                <StreamingIndicator
                  onStop={handleStopStreaming}
                  connectionStatus={connectionStatus}
                  isTyping={typingIndicator}
                />
              )}
            </AnimatePresence>
            
            <div className={`w-2 h-2 rounded-full ${
              connectionStatus === 'connected' ? 'bg-green-500' :
              connectionStatus === 'reconnecting' ? 'bg-yellow-500' :
              'bg-red-500'
            }`} />
            
            <ModernProviderSelector
              provider={provider}
              model={model}
              onProviderChange={handleProviderChange}
              onModelChange={setModel}
              disabled={streaming || !isConnected}
            />
          </div>
        </div>
      </motion.div>

      {/* Messages with enhanced background */}
      <div className="flex-1 overflow-hidden relative">
        {/* Subtle background pattern */}
        <div
          className="absolute inset-0 opacity-5"
          style={{
            backgroundImage: `radial-gradient(circle at 25% 25%, var(--sibil-accent) 0%, transparent 50%),
                             radial-gradient(circle at 75% 75%, var(--sibil-accent-light) 0%, transparent 50%)`
          }}
        />
        
        <MessageList
          messages={messages}
          loading={loading}
          error={error}
          MessageComponent={SibilMessageBubble}
        />
      </div>

      {/* Enhanced Input with Glassmorphism */}
      <motion.div
        className="border-t border-white/10 sibil-glass backdrop-blur-md p-4 relative"
        variants={inputVariants}
        initial="hidden"
        animate="visible"
      >
        {/* Background gradient overlay */}
        <div
          className="absolute inset-0 opacity-10"
          style={{
            background: 'var(--sibil-gradient-accent)'
          }}
        />
        
        <div className="relative">
          <MessageInput
            onSendMessage={handleSendMessage}
            disabled={!sessionId.current || loading || !userId || streaming}
          />
        </div>
      </motion.div>
    </motion.div>
  )
}