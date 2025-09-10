'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useConversationMessages, useDeleteMessage } from '@/hooks/useMessages'
import { useMessageStreaming } from '@/hooks/useMessageStreaming'
import { cn } from '@/lib/utils'
import type { MessageModel } from '@starships/protocol'
import { AlertCircle, Bot, Clock, Loader2, MessageSquare, MoreVertical, Paperclip, Timer, User, XCircle } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { AccessibilityEnhancements, MessageAccessibility, useAccessibilityFeatures } from './AccessibilityEnhancements'
import { MessageContent } from './MessageContent'
import { MessageReactions, useMessageReactions } from './MessageReactions'
import { MessageCheckbox, MessageSelection } from './MessageSelection'
import { VirtualizedMessageList } from './VirtualizedMessageList'

interface ConversationMessageListProps {
  conversationId: string | null
  starshipId?: string
  streamId?: string | null
  enableVirtualization?: boolean
  enableAccessibility?: boolean
}

export function ConversationMessageList({ conversationId, starshipId, streamId, enableVirtualization = false, enableAccessibility = true }: ConversationMessageListProps) {
  // Data fetching
  const { data: messageData, isLoading: loading, error: queryError } = useConversationMessages(conversationId || '', 100, !!conversationId)
  const deleteMessage = useDeleteMessage()

  // Streaming state - use streamId from props
  const { streamingState, isStreaming, streamingContent, streamingMessages } = useMessageStreaming(streamId ?? undefined, conversationId ?? undefined)
  const messages = messageData?.messages || []
  const error = queryError ? 'Failed to load conversation history' : null

  // Unified message display - combines API messages with streaming messages
  const displayMessages = useMemo(() => {
    // Add streaming messages (separate workflow event messages)
    const allStreamingMessages = streamingMessages || []

    // Legacy: if we have streamingContent but no streaming messages, create fallback message
    const legacyStreamingMessage =
      isStreaming && streamingContent && allStreamingMessages.length === 0
        ? {
            id: 'streaming-message',
            content: streamingContent,
            role: 'assistant' as const,
            timestamp: new Date().toISOString(),
            conversationId: conversationId || '',
            starshipId: starshipId || '',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            version: '1.0.0',
            threadDepth: 0,
            processingStatus: 'streaming' as const,
            messageType: 'agent_response' as const,
            importance: 'medium' as const,
            contentLength: streamingContent.length,
            hasAttachments: false,
            streaming: true,
          }
        : null

    // Combine API messages with streaming messages (multiple separate messages)
    const combinedMessages = [...messages]

    if (allStreamingMessages.length > 0) {
      // Add each streaming message separately (workflow events as individual bubbles)
      combinedMessages.push(...allStreamingMessages)
    } else if (legacyStreamingMessage) {
      // Fallback to single accumulated message for legacy content chunks
      combinedMessages.push(legacyStreamingMessage)
    }

    return combinedMessages
  }, [messages, isStreaming, streamingContent, streamingMessages, conversationId, starshipId])

  // Message selection state
  const [selectedMessages, setSelectedMessages] = useState<string[]>([])
  const [isSelectionMode, setIsSelectionMode] = useState(false)

  // Message reactions
  const { addReaction, removeReaction, getMessageReactions } = useMessageReactions()

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

  const toggleSelectionMode = () => {
    setIsSelectionMode(!isSelectionMode)
    setSelectedMessages([])
  }

  // Reset selection when conversation changes
  useEffect(() => {
    setSelectedMessages([])
    setIsSelectionMode(false)
  }, [conversationId])

  const renderMessage = (message: MessageModel & { streaming?: boolean }, index: number) => (
    <MessageBubble
      key={message.streaming ? 'streaming-message' : message.id}
      message={message}
      index={index}
      totalMessages={displayMessages.length}
      isSelected={selectedMessages.includes(message.id)}
      isSelecting={isSelectionMode}
      isHighlighted={false}
      isHighContrast={isHighContrast}
      isReducedMotion={isReducedMotion}
      onToggleSelection={handleMessageToggle}
      onStartSelection={toggleSelectionMode}
      reactions={getMessageReactions(message.id)}
      onAddReaction={addReaction}
      onRemoveReaction={removeReaction}
      searchTerm=""
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
      {/* Message Selection Bar */}
      <MessageSelection selectedMessages={selectedMessages} messages={messages} onSelectionChange={handleSelectionChange} onBulkCopy={handleBulkCopy} onBulkDelete={handleBulkDelete} />

      {/* Accessibility Enhancements */}
      {enableAccessibility && <AccessibilityEnhancements messages={messages} />}

      {/* Messages List */}
      <div className="flex-1 relative">
        {enableVirtualization ? (
          <VirtualizedMessageList messages={displayMessages} renderMessage={renderMessage} className="h-full message-scroll-area" reverseOrder={true} />
        ) : (
          <div className="h-full overflow-y-auto message-scroll-area flex justify-center">
            <div className="w-full max-w-4xl p-2 sm:p-4 flex flex-col gap-3 sm:gap-4">
              {displayMessages
                .slice()
                .reverse()
                .map((message: MessageModel & { streaming?: boolean }, index: number) => renderMessage(message, index))}
            </div>
          </div>
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
      streaming: <Loader2 className="w-3 h-3 animate-spin" />,
      failed: <XCircle className="w-3 h-3 text-destructive" />,
    }

    const statusColors = {
      pending: 'text-muted-foreground',
      processing: 'text-blue-600',
      streaming: 'text-green-600',
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
    <div
      className={cn(
        'flex gap-2 sm:gap-3 group opacity-100',
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

          {/* Message content */}
          <MessageContent content={message.content} messageId={message.id} enableMarkdown={true} enableCopy={true} enableLinkPreview={true} isStreaming={message.streaming} />

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
    </div>
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
      <div className="max-w-md mx-auto space-y-6 opacity-100">
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
              <div key={suggestion} className="p-3 bg-muted/50 rounded-lg text-sm text-left border border-border/40 hover:bg-muted/70 transition-colors cursor-pointer opacity-100">
                {suggestion}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
