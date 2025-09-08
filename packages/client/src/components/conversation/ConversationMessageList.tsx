'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useConversationMessages } from '@/hooks/useConversations'
import { useDeleteMessage } from '@/hooks/useMessages'
import { cn } from '@/lib/utils'
import type { MessageModel } from '@starships/protocol'
import { AlertCircle, Bot, Clock, Loader2, MessageSquare, MoreVertical, Paperclip, Search, Timer, User, XCircle } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { AccessibilityEnhancements, MessageAccessibility, useAccessibilityFeatures } from './AccessibilityEnhancements'
import { MessageContent } from './MessageContent'
import { MessageReactions, useMessageReactions } from './MessageReactions'
import { MessageHighlight, MessageSearch, useMessageSearch } from './MessageSearch'
import { MessageCheckbox, MessageSelection } from './MessageSelection'
import { VirtualizedMessageList } from './VirtualizedMessageList'

interface ConversationMessageListProps {
  conversationId: string | null
  starshipId?: string
  enableVirtualization?: boolean
  enableSearch?: boolean
  enableAccessibility?: boolean
}

export function ConversationMessageList({ conversationId, starshipId, enableVirtualization = false, enableSearch = true, enableAccessibility = true }: ConversationMessageListProps) {
  // Data fetching
  const { data: messageData, isLoading: loading, error: queryError } = useConversationMessages(conversationId || '', !!conversationId)
  const deleteMessage = useDeleteMessage()

  const messages = messageData?.messages || []
  const error = queryError ? 'Failed to load conversation history' : null

  // Message selection state
  const [selectedMessages, setSelectedMessages] = useState<string[]>([])
  const [isSelectionMode, setIsSelectionMode] = useState(false)

  // Message reactions
  const { addReaction, removeReaction, getMessageReactions } = useMessageReactions()

  // Search functionality
  const { isSearching, highlightedMessageId, startSearch, stopSearch, highlightMessage } = useMessageSearch(messages)

  // Accessibility features
  const { isHighContrast, isReducedMotion } = useAccessibilityFeatures()

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

  const handleSearchResultClick = (messageId: string, index: number) => {
    highlightMessage(messageId)
    // Scroll to message if needed
  }

  const toggleSelectionMode = () => {
    setIsSelectionMode(!isSelectionMode)
    setSelectedMessages([])
  }

  // Reset selection when conversation changes
  useEffect(() => {
    setSelectedMessages([])
    setIsSelectionMode(false)
  }, [conversationId])

  const renderMessage = (message: MessageModel, index: number) => (
    <MessageBubble
      key={message.id}
      message={message}
      index={index}
      totalMessages={messages.length}
      isSelected={selectedMessages.includes(message.id)}
      isSelecting={isSelectionMode}
      isHighlighted={highlightedMessageId === message.id}
      isHighContrast={isHighContrast}
      isReducedMotion={isReducedMotion}
      onToggleSelection={handleMessageToggle}
      onStartSelection={toggleSelectionMode}
      reactions={getMessageReactions(message.id)}
      onAddReaction={addReaction}
      onRemoveReaction={removeReaction}
      searchTerm={isSearching ? '' : ''} // Pass search term if needed
    />
  )

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
      {/* Search Interface */}
      {enableSearch && isSearching && <MessageSearch messages={messages} onSearchResultClick={handleSearchResultClick} onClose={stopSearch} />}

      {/* Message Selection Bar */}
      <MessageSelection selectedMessages={selectedMessages} messages={messages} onSelectionChange={handleSelectionChange} onBulkCopy={handleBulkCopy} onBulkDelete={handleBulkDelete} />

      {/* Accessibility Enhancements */}
      {enableAccessibility && <AccessibilityEnhancements messages={messages} onStartSearch={startSearch} />}

      {/* Messages List */}
      <div className="flex-1 relative">
        {enableVirtualization && messages.length > 50 ? (
          <VirtualizedMessageList messages={messages} renderMessage={renderMessage} className="h-full message-scroll-area" />
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              key={conversationId}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="h-full overflow-y-auto p-2 sm:p-4 space-y-3 sm:space-y-4 message-scroll-area"
            >
              {messages.map((message, index) => renderMessage(message, index))}
            </motion.div>
          </AnimatePresence>
        )}

        {/* Search Button */}
        {enableSearch && !isSearching && (
          <Button variant="outline" size="icon" onClick={startSearch} className="absolute top-4 right-4 z-10 focus-visible-ring">
            <Search className="w-4 h-4" />
          </Button>
        )}
      </div>
    </div>
  )
}

// Enhanced Message Bubble Component with all features
interface MessageBubbleProps {
  message: MessageModel & { sending?: boolean; streaming?: boolean }
  index: number
  totalMessages: number
  isSelected?: boolean
  isSelecting?: boolean
  isHighlighted?: boolean
  isHighContrast?: boolean
  isReducedMotion?: boolean
  onToggleSelection?: (messageId: string, selected: boolean) => void
  onStartSelection?: () => void
  reactions?: Array<{ emoji: string; count: number; userReacted: boolean }>
  onAddReaction?: (messageId: string, emoji: string) => void
  onRemoveReaction?: (messageId: string, emoji: string) => void
  searchTerm?: string
}

function MessageBubble({
  message,
  index,
  totalMessages,
  isSelected = false,
  isSelecting = false,
  isHighlighted = false,
  isHighContrast = false,
  isReducedMotion = false,
  onToggleSelection,
  onStartSelection,
  reactions = [],
  onAddReaction,
  onRemoveReaction,
  searchTerm = '',
}: MessageBubbleProps) {
  const isUser = message.role === 'user'
  const isSystem = message.role === 'system'

  const handleLongPress = () => {
    onStartSelection?.()
  }

  const accessibilityProps = MessageAccessibility({
    message,
    index,
    isSelected,
    totalMessages,
  })

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
      animate={{
        opacity: 1,
        y: 0,
        scale: isHighlighted ? 1.02 : 1,
        transition: { duration: isReducedMotion ? 0 : 0.2 },
      }}
      className={cn(
        'flex gap-2 sm:gap-3 group',
        isUser ? 'justify-end' : 'justify-start',
        message.threadDepth ? `ml-${Math.min(message.threadDepth * 2, 8)} sm:ml-${Math.min(message.threadDepth * 4, 16)}` : '',
        isSelected && 'selection-highlight rounded-lg p-2',
        isHighlighted && 'ring-2 ring-primary/50'
      )}
      {...accessibilityProps}
    >
      {/* Selection checkbox */}
      <MessageCheckbox messageId={message.id} isSelected={isSelected} isSelecting={isSelecting} onToggle={onToggleSelection || (() => {})} className="self-start mt-2" />

      {!isUser && <div className="flex-shrink-0 w-6 h-6 sm:w-8 sm:h-8 rounded-full bg-muted flex items-center justify-center">{getRoleIcon()}</div>}

      <div className="flex-1 max-w-[280px] sm:max-w-xs lg:max-w-md">
        <div
          className={cn(
            'rounded-lg px-3 py-2 sm:px-4 sm:py-3 relative group/message message-bubble',
            isUser
              ? 'bg-primary text-primary-foreground ml-auto'
              : isSystem
                ? 'bg-amber-50 text-amber-900 border border-amber-200 dark:bg-amber-900/20 dark:text-amber-100 dark:border-amber-800'
                : 'bg-muted text-foreground',
            isHighContrast && 'border-2'
          )}
          onContextMenu={e => {
            e.preventDefault()
            handleLongPress()
          }}
        >
          {/* More options button */}
          {!isSelecting && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-1 right-1 sm:top-2 sm:right-2 opacity-0 group-hover:opacity-100 group/message-hover:opacity-100 transition-opacity h-5 w-5 sm:h-6 sm:w-6 focus-visible-ring"
              onClick={handleLongPress}
            >
              <MoreVertical className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
            </Button>
          )}

          {/* Message header with importance and status */}
          <div className="flex items-center gap-1.5 sm:gap-2 mb-1.5 sm:mb-2">
            {getImportanceBadge()}
            {getProcessingStatus()}
            {message.hasAttachments && <Paperclip className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-muted-foreground" />}
          </div>

          {/* Message content with search highlighting */}
          {searchTerm ? (
            <MessageHighlight content={message.content} searchTerm={searchTerm} className="message-content" />
          ) : (
            <MessageContent content={message.content} messageId={message.id} enableMarkdown={true} enableCopy={true} enableLinkPreview={true} />
          )}

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

        {/* Message Reactions */}
        <MessageReactions messageId={message.id} reactions={reactions} onAddReaction={onAddReaction} onRemoveReaction={onRemoveReaction} className="mt-2" />

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
