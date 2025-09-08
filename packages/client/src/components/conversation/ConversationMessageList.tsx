'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useConversationMessages } from '@/hooks/useConversations'
import { useDeleteMessage } from '@/hooks/useMessages'
import { cn } from '@/lib/utils'
import type { MessageModel } from '@starships/protocol'
import { AlertCircle, Bot, Clock, Loader2, MessageSquare, Paperclip, Timer, User, XCircle } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { MessageContent } from './MessageContent'
import { useMessageReactions } from './MessageReactions'
import { MessageSelection } from './MessageSelection'

interface ConversationMessageListProps {
  conversationId: string | null
  starshipId?: string
  onMessageAdded?: (message: MessageModel) => void
}

export function ConversationMessageList({ conversationId, starshipId, onMessageAdded }: ConversationMessageListProps) {
  // Use TanStack Query to fetch messages
  const { data: messageData, isLoading: loading, error: queryError } = useConversationMessages(conversationId || '', !!conversationId)
  const deleteMessage = useDeleteMessage()

  const messages = messageData?.messages || []
  const error = queryError ? 'Failed to load conversation history' : null

  // Message selection state
  const [selectedMessages, setSelectedMessages] = useState<string[]>([])
  const [isSelectionMode, setIsSelectionMode] = useState(false)

  // Message reactions
  const { addReaction, removeReaction, getMessageReactions } = useMessageReactions()

  // Add new message to the list (for real-time updates)
  const addMessage = (newMessage: MessageModel) => {
    // Note: With TanStack Query, real-time updates should be handled
    // by invalidating queries or using optimistic updates in mutations
    onMessageAdded?.(newMessage)
  }

  // Selection handlers
  const handleSelectionChange = (messageIds: string[]) => {
    setSelectedMessages(messageIds)
    setIsSelectionMode(messageIds.length > 0)
  }

  const handleMessageToggle = (messageId: string, selected: boolean) => {
    if (selected) {
      setSelectedMessages(prev => [...prev, messageId])
      setIsSelectionMode(true)
    } else {
      setSelectedMessages(prev => prev.filter(id => id !== messageId))
    }
  }

  const handleBulkCopy = async (messagesToCopy: MessageModel[]) => {
    try {
      const content = messagesToCopy.map(msg => `${msg.role === 'user' ? 'You' : 'Assistant'}: ${msg.content}`).join('\n\n')

      await navigator.clipboard.writeText(content)
      toast.success(`Copied ${messagesToCopy.length} message${messagesToCopy.length > 1 ? 's' : ''}`)
      setSelectedMessages([])
      setIsSelectionMode(false)
    } catch (error) {
      toast.error('Failed to copy messages')
    }
  }

  const handleBulkDelete = async (messageIds: string[]) => {
    try {
      await Promise.all(messageIds.map(id => deleteMessage.mutateAsync(id)))
      toast.success(`Deleted ${messageIds.length} message${messageIds.length > 1 ? 's' : ''}`)
      setSelectedMessages([])
      setIsSelectionMode(false)
    } catch (error) {
      toast.error('Failed to delete messages')
    }
  }

  const toggleSelectionMode = () => {
    setIsSelectionMode(!isSelectionMode)
    setSelectedMessages([])
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

  // Reset selection when conversation changes
  useEffect(() => {
    setSelectedMessages([])
    setIsSelectionMode(false)
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
    <div className="h-full flex flex-col">
      {/* Message Selection Bar */}
      <MessageSelection selectedMessages={selectedMessages} messages={messages} onSelectionChange={handleSelectionChange} onBulkCopy={handleBulkCopy} onBulkDelete={handleBulkDelete} />

      {/* Messages List */}
      <AnimatePresence mode="wait">
        <motion.div key={conversationId} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="flex-1 overflow-auto p-4 space-y-4">
          {messages.map((message: MessageModel) => (
            <MessageBubble
              key={message.id}
              message={message}
              isSelected={selectedMessages.includes(message.id)}
              isSelecting={isSelectionMode}
              onToggleSelection={handleMessageToggle}
              onStartSelection={toggleSelectionMode}
              reactions={getMessageReactions(message.id)}
              onAddReaction={addReaction}
              onRemoveReaction={removeReaction}
            />
          ))}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

// Enhanced Message Bubble Component
function MessageBubble({
  message,
  isSelected = false,
  isSelecting = false,
  onToggleSelection,
  onStartSelection,
  reactions = [],
  onAddReaction,
  onRemoveReaction,
}: {
  message: MessageModel & { sending?: boolean; streaming?: boolean }
  isSelected?: boolean
  isSelecting?: boolean
  onToggleSelection?: (messageId: string, selected: boolean) => void
  onStartSelection?: () => void
  reactions?: Array<{ emoji: string; count: number; userReacted: boolean }>
  onAddReaction?: (messageId: string, emoji: string) => void
  onRemoveReaction?: (messageId: string, emoji: string) => void
}) {
  const isUser = message.role === 'user'
  const isSystem = message.role === 'system'

  const handleLongPress = () => {
    onStartSelection?.()
  }

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
      {!isUser && <div className="flex-shrink-0 w-6 h-6 sm:w-8 sm:h-8 rounded-full bg-muted flex items-center justify-center">{getRoleIcon()}</div>}

      <div className="flex-1 max-w-[280px] sm:max-w-xs lg:max-w-md">
        <div
          className={cn(
            'rounded-lg px-4 py-3 relative',
            isUser ? 'bg-primary text-primary-foreground ml-auto' : isSystem ? 'bg-amber-50 text-amber-900 border border-amber-200' : 'bg-muted text-foreground'
          )}
        >
          {/* Message header with importance and status */}
          <div className="flex items-center gap-1.5 sm:gap-2 mb-1.5 sm:mb-2">
            {getImportanceBadge()}
            {getProcessingStatus()}
            {message.hasAttachments && <Paperclip className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-muted-foreground" />}
          </div>

          {/* Message content */}
          <MessageContent content={message.content} messageId={message.id} enableMarkdown={true} enableCopy={true} enableLinkPreview={true} />

          {/* Message footer */}
          <div className="flex items-center justify-between mt-1.5 sm:mt-2 pt-1.5 sm:pt-2 border-t border-current/10">
            <div className="text-xs opacity-70 message-timestamp">{new Date(message.timestamp).toLocaleTimeString()}</div>

            {/* Metadata */}
            {getMetadata() && (
              <div className="text-xs opacity-60 flex items-center gap-1 hidden sm:flex">
                <Timer className="w-3 h-3" />
                <span className="truncate max-w-[120px]">{getMetadata()}</span>
              </div>
            )}
          </div>

          {/* Threading indicator */}
          {message.parentMessageId && <div className="absolute -left-3 top-1/2 w-6 h-0.5 bg-border"></div>}
        </div>

        {/* Thread replies indicator */}
        {message.threadDepth === 0 && message.parentMessageId && (
          <Button variant="ghost" size="sm" className="mt-1 h-5 sm:h-6 px-2 text-xs text-muted-foreground focus-visible-ring">
            <MessageSquare className="w-2.5 h-2.5 sm:w-3 sm:h-3 mr-1" />
            <span className="hidden sm:inline">View thread</span>
            <span className="sm:hidden">Thread</span>
          </Button>
        )}
      </div>

      {isUser && <div className="flex-shrink-0 w-6 h-6 sm:w-8 sm:h-8 rounded-full bg-primary/10 flex items-center justify-center">{getRoleIcon()}</div>}
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
