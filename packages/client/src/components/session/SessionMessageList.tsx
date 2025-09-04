'use client'

import { MessageBubble } from '@/components/session/MessageBubble'
import { MessageList } from '@/components/session/MessageList'
import { useSessionMessages, type Message as SessionMessage } from '@/hooks/useSessions'
import type { Message } from '@/lib/agent-socket-api'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect } from 'react'

interface SessionMessageListProps {
  sessionId: string | null
  starshipId?: string
  onMessageAdded?: (message: SessionMessage) => void
}

// Union type for session messages
type SessionMessageType = Message

export function SessionMessageList({ sessionId, starshipId, onMessageAdded }: SessionMessageListProps) {
  // Use TanStack Query to fetch messages
  const { data: messageData, isLoading: loading, error: queryError } = useSessionMessages(sessionId || '', !!sessionId)

  const messages = messageData?.messages || []

  const error = queryError ? 'Failed to load session history' : null

  // Convert session messages to unified message format
  const sessionMessages: SessionMessageType[] = messages.map(
    (msg: SessionMessage) =>
      ({
        id: msg.id,
        content: msg.content,
        role: msg.role,
        timestamp: msg.timestamp,
        sessionId: msg.sessionId,
        // Add mode-specific fields based on message structure
        agentId: sessionId?.split(':')[0]?.replace('agent-', ''),
      }) as SessionMessageType
  )

  // Add new message to the list (for real-time updates)
  const addMessage = (newMessage: SessionMessageType) => {
    // Note: With TanStack Query, real-time updates should be handled
    // by invalidating queries or using optimistic updates in mutations
    // This function is kept for compatibility but may not be needed
    onMessageAdded?.(newMessage as SessionMessage)
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
  }, [sessionId])

  // Get appropriate message component based on mode
  const getMessageComponent = () => {
    return MessageBubble
  }

  if (!sessionId) {
    return <EmptyState />
  }

  return (
    <AnimatePresence mode="wait">
      <motion.div key={sessionId} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="h-full">
        <MessageList messages={sessionMessages} loading={loading} error={error} MessageComponent={getMessageComponent() as any} />
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
