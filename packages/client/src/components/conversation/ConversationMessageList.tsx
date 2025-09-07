'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useConversationMessages } from '@/hooks/useConversations'
import { cn } from '@/lib/utils'
import type { Message } from '@/types/chat'
import { AlertCircle, Bot, Clock, Loader2, MessageSquare, Paperclip, Timer, User, XCircle } from 'lucide-react'
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
          <MessageBubble key={message.id} message={message} />
        ))}
      </motion.div>
    </AnimatePresence>
  )
}

// Enhanced Message Bubble Component
function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user'
  const isSystem = message.role === 'system'

  const getImportanceBadge = () => {
    if (!message.importance || message.importance === 'low') return null

    const colors = {
      medium: 'bg-yellow-100 text-yellow-800 border-yellow-200',
      high: 'bg-orange-100 text-orange-800 border-orange-200',
      critical: 'bg-red-100 text-red-800 border-red-200',
    }

    return (
      <Badge variant="outline" className={cn('text-xs', colors[message.importance])}>
        {message.importance}
      </Badge>
    )
  }

  const getProcessingStatus = () => {
    if (!message.processingStatus || message.processingStatus === 'completed') return null

    const statusIcons = {
      pending: <Clock className="w-3 h-3" />,
      processing: <Loader2 className="w-3 h-3 animate-spin" />,
      failed: <XCircle className="w-3 h-3 text-destructive" />,
    }

    const statusColors = {
      pending: 'text-muted-foreground',
      processing: 'text-blue-600',
      failed: 'text-destructive',
    }

    return (
      <div className={cn('flex items-center gap-1', statusColors[message.processingStatus])}>
        {statusIcons[message.processingStatus]}
        <span className="text-xs capitalize">{message.processingStatus}</span>
      </div>
    )
  }

  const getRoleIcon = () => {
    if (isSystem) return <AlertCircle className="w-4 h-4" />
    if (isUser) return <User className="w-4 h-4" />
    return <Bot className="w-4 h-4" />
  }

  const getMetadata = () => {
    const items = []

    if (message.tokenCount) {
      items.push(`${message.tokenCount} tokens`)
    }

    if (message.processingTimeMs && message.processingTimeMs > 0) {
      items.push(`${message.processingTimeMs}ms`)
    }

    if (message.hasAttachments) {
      items.push('Has attachments')
    }

    return items.length > 0 ? items.join(' • ') : null
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn('flex gap-3', isUser ? 'justify-end' : 'justify-start', message.threadDepth ? `ml-${Math.min(message.threadDepth * 4, 16)}` : '')}
    >
      {!isUser && <div className="flex-shrink-0 w-8 h-8 rounded-full bg-muted flex items-center justify-center">{getRoleIcon()}</div>}

      <div className="flex-1 max-w-xs lg:max-w-md">
        <div
          className={cn(
            'rounded-lg px-4 py-3 relative',
            isUser ? 'bg-primary text-primary-foreground ml-auto' : isSystem ? 'bg-amber-50 text-amber-900 border border-amber-200' : 'bg-muted text-foreground'
          )}
        >
          {/* Message header with importance and status */}
          <div className="flex items-center gap-2 mb-2">
            {getImportanceBadge()}
            {getProcessingStatus()}
            {message.hasAttachments && <Paperclip className="w-3 h-3 text-muted-foreground" />}
          </div>

          {/* Message content */}
          <div className="text-sm leading-relaxed">{message.content}</div>

          {/* Message footer */}
          <div className="flex items-center justify-between mt-2 pt-2 border-t border-current/10">
            <div className="text-xs opacity-70">{new Date(message.timestamp).toLocaleTimeString()}</div>

            {/* Metadata */}
            {getMetadata() && (
              <div className="text-xs opacity-60 flex items-center gap-1">
                <Timer className="w-3 h-3" />
                {getMetadata()}
              </div>
            )}
          </div>

          {/* Threading indicator */}
          {message.parentMessageId && <div className="absolute -left-3 top-1/2 w-6 h-0.5 bg-border"></div>}
        </div>

        {/* Thread replies indicator */}
        {message.threadDepth === 0 && message.parentMessageId && (
          <Button variant="ghost" size="sm" className="mt-1 h-6 px-2 text-xs text-muted-foreground">
            <MessageSquare className="w-3 h-3 mr-1" />
            View thread
          </Button>
        )}
      </div>

      {isUser && <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">{getRoleIcon()}</div>}
    </motion.div>
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
