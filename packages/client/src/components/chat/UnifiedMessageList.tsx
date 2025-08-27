'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { MessageList } from './MessageList'
import { MessageBubble } from './MessageBubble'
import { SibilMessageBubble } from '@/components/sibil/SibilMessageBubble'
import type { Message } from '@/lib/agent-socket-api'
import type { SibilMessage } from '@/lib/sibil-api'
import type { ChatMode } from './ChatModeSelector'
import { getChatHistory, saveChatHistory } from '@/lib/storage'

interface UnifiedMessageListProps {
  mode: ChatMode
  sessionId: string | null
  starshipId?: string
  onMessageAdded?: (message: UnifiedMessage) => void
}

// Union type for unified messages
type UnifiedMessage = Message | SibilMessage

export function UnifiedMessageList({
  mode,
  sessionId,
  starshipId,
  onMessageAdded
}: UnifiedMessageListProps) {
  const [messages, setMessages] = useState<UnifiedMessage[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load messages when session changes
  useEffect(() => {
    if (sessionId) {
      loadMessages(sessionId)
    } else {
      setMessages([])
    }
  }, [sessionId, mode])

  const loadMessages = (sessionId: string) => {
    try {
      setLoading(true)
      setError(null)
      
      // Load messages from storage
      const storedMessages = getChatHistory(sessionId) as UnifiedMessage[]
      setMessages(storedMessages || [])
    } catch (err) {
      console.error('Failed to load messages:', err)
      setError('Failed to load chat history')
    } finally {
      setLoading(false)
    }
  }

  // Add new message to the list
  const addMessage = (newMessage: UnifiedMessage) => {
    setMessages(prevMessages => {
      const updatedMessages = [...prevMessages, newMessage]
      
      // Update storage if sessionId exists
      if (sessionId) {
        saveChatHistory(sessionId, updatedMessages as any)
      }
      
      onMessageAdded?.(newMessage)
      return updatedMessages
    })
  }

  // Expose method to parent component
  useEffect(() => {
    // This can be used by parent components to add messages
    if (typeof window !== 'undefined') {
      (window as any).addChatMessage = addMessage
    }
    
    return () => {
      if (typeof window !== 'undefined') {
        delete (window as any).addChatMessage
      }
    }
  }, [sessionId])

  // Get appropriate message component based on mode
  const getMessageComponent = () => {
    return mode === 'agent' ? MessageBubble : SibilMessageBubble
  }

  if (!sessionId) {
    return <EmptyState mode={mode} />
  }

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={`${mode}-${sessionId}`}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        className="h-full"
      >
        <MessageList
          messages={messages}
          loading={loading}
          error={error}
          MessageComponent={getMessageComponent() as any}
        />
      </motion.div>
    </AnimatePresence>
  )
}

interface EmptyStateProps {
  mode: ChatMode
}

function EmptyState({ mode }: EmptyStateProps) {
  const content = mode === 'agent' 
    ? {
        title: "Connect with your Agent",
        subtitle: "Select an agent and start a conversation to boost your productivity",
        suggestions: [
          "Help me plan my project timeline",
          "Analyze this data for insights", 
          "Write code for my application",
          "Research industry trends"
        ]
      }
    : {
        title: "Ask anything",
        subtitle: "Get detailed answers and creative help from AI",
        suggestions: [
          "Help me pack for my trip to Jaipur next week",
          "Compare leather sofas vs fabric sofas",
          "How to identify genuine pashmina shawls?",
          "What are the best productivity apps for 2024?"
        ]
      }

  return (
    <div className="flex flex-col items-center justify-center h-full p-8 text-center">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="max-w-md mx-auto space-y-6"
      >
        {/* Title */}
        <div className="space-y-2">
          <h3 className="text-2xl font-semibold text-foreground">
            {content.title}
          </h3>
          <p className="text-muted-foreground">
            {content.subtitle}
          </p>
        </div>

        {/* Example Suggestions */}
        <div className="space-y-3">
          <p className="text-sm font-medium text-muted-foreground">
            Try asking:
          </p>
          <div className="grid gap-2">
            {content.suggestions.map((suggestion, index) => (
              <motion.div
                key={suggestion}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 * index }}
                className="p-3 bg-muted/50 rounded-lg text-sm text-left border border-border/40 hover:bg-muted/70 transition-colors cursor-pointer"
              >
                {suggestion}
              </motion.div>
            ))}
          </div>
        </div>
      </motion.div>
    </div>
  )
}