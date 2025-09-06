'use client'

import { useConversationMessages, type Message } from '@/hooks/useConversations'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect } from 'react'

interface ConversationMessageListProps {
  conversationId: string | null
  starshipId?: string
  onMessageAdded?: (message: Message) => void
}

export function ConversationMessageList({ conversationId, starshipId, onMessageAdded }: ConversationMessageListProps) {
  // Use TanStack Query to fetch messages
  const { data: messageData, isLoading: loading, error: queryError } = useConversationMessages(conversationId || '', !!conversationId)

  const messages = messageData?.messages || []
  const error = queryError ? 'Failed to load conversation history' : null

  // Add new message to the list (for real-time updates)
  const addMessage = (newMessage: Message) => {
    // Note: With TanStack Query, real-time updates should be handled
    // by invalidating queries or using optimistic updates in mutations
    onMessageAdded?.(newMessage)
  }

  // Expose method to parent component for compatibility
  useEffect(() => {
    if (typeof window !== 'undefined') {
      ;(window as any).addMessage = addMessage
    }

    return () => {
      if (typeof window !== 'undefined') {
        delete (window as any).addMessage
      }
    }
  }, [conversationId])

  if (!conversationId) {
    return <EmptyState />
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-muted-foreground">Loading conversation...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-red-500">{error}</div>
      </div>
    )
  }

  return (
    <AnimatePresence mode="wait">
      <motion.div key={conversationId} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="h-full overflow-auto p-4 space-y-4">
        {messages.map((message: Message) => (
          <div key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${message.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
              <p className="text-sm">{message.content}</p>
              <p className="text-xs opacity-70 mt-1">{new Date(message.timestamp).toLocaleTimeString()}</p>
            </div>
          </div>
        ))}
      </motion.div>
    </AnimatePresence>
  )
}

function EmptyState() {
  const content = {
    title: 'Connect with your Agent',
    subtitle: 'Select an agent and start a conversation to boost your productivity',
    suggestions: ['Help me plan my project timeline', 'Analyze this data for insights', 'Write code for my application', 'Research industry trends'],
  }

  return (
    <div className="flex flex-col items-center justify-center h-full p-8 text-center">
      <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="max-w-md mx-auto space-y-6">
        {/* Title */}
        <div className="space-y-2">
          <h3 className="text-2xl font-semibold text-foreground">{content.title}</h3>
          <p className="text-muted-foreground">{content.subtitle}</p>
        </div>

        {/* Example Suggestions */}
        <div className="space-y-3">
          <p className="text-sm font-medium text-muted-foreground">Try asking:</p>
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
