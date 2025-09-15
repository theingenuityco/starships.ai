'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useConversation, useDeleteMessage } from '@/hooks/useConversations'
import { cn } from '@/lib/utils'
import type { MessageModel } from '@starships/protocol'
import { AlertCircle, Bot, Clock, Loader2, MessageSquare, MoreVertical, Paperclip, Timer, User, XCircle } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { AccessibilityEnhancements, MessageAccessibility, useAccessibilityFeatures } from './AccessibilityEnhancements'
import { MessageContent } from './MessageContent'
import { MessageReactions, useMessageReactions } from './MessageReactions'
import { MessageCheckbox, MessageSelection } from './MessageSelection'

interface ConversationMessageListProps {
  conversationId: string | null
  starshipId?: string
  enableAccessibility?: boolean
}

export function ConversationMessageList({ conversationId, starshipId, enableAccessibility = true }: ConversationMessageListProps) {
  // Unified conversation hook - handles messages, streaming, and sending
  const { messages, isLoading: loading, error: queryError, streamingState, isStreaming, streamingContent } = useConversation(conversationId)

  const deleteMessage = useDeleteMessage()

  // Scroll container reference
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  const error = queryError ? 'Failed to load conversation history' : null

  // Simplified message display - all messages come from unified hook
  const displayMessages = useMemo(() => {
    console.log('[MESSAGE-LIST] Rendering messages:', {
      messages: messages.length,
      isStreaming,
      streamingContent: streamingContent?.substring(0, 50) + '...',
    })

    // Start with messages from the unified hook
    let combinedMessages = [...messages]

    // Legacy fallback: if we have streamingContent but no streaming message in the list,
    // create a temporary streaming message
    if (isStreaming && streamingContent && streamingContent.trim()) {
      // Check if we already have a streaming message
      const hasStreamingMessage = messages.some(msg => msg.streaming === true)

      if (!hasStreamingMessage) {
        const legacyStreamingMessage = {
          id: `streaming-content-${Date.now()}`,
          content: streamingContent,
          role: 'assistant' as const,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          messageType: 'agent_response' as const,
          streaming: true,
        }

        console.log('[MESSAGE-LIST] Adding legacy streaming message:', streamingContent.substring(0, 50))
        combinedMessages = [...combinedMessages, legacyStreamingMessage]
      }
    }

    // Sort messages by createdAt to ensure consistent ordering
    // This handles both API messages and dynamically added messages (user/streaming)
    return combinedMessages.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
  }, [messages, isStreaming, streamingContent, conversationId, starshipId])

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

  // Note: Streaming events are now handled internally by useConversation hook
  // No need to pass event handlers around

  // Auto-scroll to bottom when new messages arrive or streaming content changes
  useEffect(() => {
    if (scrollContainerRef.current) {
      const container = scrollContainerRef.current
      const isNearBottom = container.scrollTop + container.clientHeight >= container.scrollHeight - 100

      // Auto-scroll if near bottom or if there are streaming messages
      if (isNearBottom || isStreaming) {
        setTimeout(() => {
          container.scrollTop = container.scrollHeight
        }, 100)
      }
    }
  }, [displayMessages.length, isStreaming, streamingContent])

  const renderMessage = (message: ClientStreamingMessage, index: number) => {
    // Generate unique key for each message, including streaming messages
    const messageKey = message.streaming ? `streaming-${message.id}-${message.content?.length || 0}` : message.id

    return (
      <MessageBubble
        key={messageKey}
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
  }

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
        <div ref={scrollContainerRef} className="h-full overflow-y-auto message-scroll-area flex justify-center">
          <div className="w-full max-w-4xl p-2 sm:p-4 flex flex-col gap-3 sm:gap-4">{displayMessages.map((message: ClientStreamingMessage, index: number) => renderMessage(message, index))}</div>
        </div>
      </div>
    </div>
  )
}

// Content chunk interface for delta streaming
interface ContentChunk {
  content: string
  position: number
  timestamp: number
}

// Extended Message interface for client-side streaming support
interface ClientStreamingMessage extends MessageModel {
  sending?: boolean
  streaming?: boolean
  contentChunks?: ContentChunk[]
}

// Enhanced Message Bubble Component with all features
interface MessageBubbleProps {
  message: ClientStreamingMessage
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
    // Importance property no longer exists in simplified MessageModel
    return null
  }

  const getProcessingStatus = () => {
    // Show streaming indicator for streaming messages
    if (message.streaming) {
      return (
        <div className="flex items-center gap-1 text-green-600">
          <Loader2 className="w-3 h-3 animate-spin" />
          <span className="text-xs">streaming</span>
        </div>
      )
    }

    // Show sending indicator for sending messages
    if (message.sending) {
      return (
        <div className="flex items-center gap-1 text-blue-600">
          <Loader2 className="w-3 h-3 animate-spin" />
          <span className="text-xs">sending</span>
        </div>
      )
    }

    return null
  }

  const getRoleIcon = () => {
    if (isSystem) return <AlertCircle className="w-4 h-4" />
    if (isUser) return <User className="w-4 h-4" />
    return <Bot className="w-4 h-4" />
  }

  const getMetadata = () => {
    // Metadata properties no longer exist in simplified MessageModel
    const items = []

    // Show message type if it's not a standard user/assistant message
    if (message.messageType && message.messageType !== 'user_input' && message.messageType !== 'agent_response') {
      items.push(message.messageType.replace('_', ' '))
    }

    return items.length > 0 ? items.join(' • ') : null
  }

  return (
    <div
      className={cn('flex gap-2 sm:gap-3 group opacity-100', isUser ? 'justify-end' : 'justify-start', isSelected && 'selection-highlight rounded-lg p-2', isHighlighted && 'ring-2 ring-primary/50')}
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

          {/* Message header with status */}
          <div className="flex items-center gap-1.5 sm:gap-2 mb-1.5 sm:mb-2">
            {getImportanceBadge()}
            {getProcessingStatus()}
          </div>

          {/* Message content */}
          <MessageContent
            content={message.content}
            messageId={message.id}
            enableMarkdown={true}
            enableCopy={true}
            enableLinkPreview={true}
            isStreaming={message.streaming}
            contentChunks={message.contentChunks}
          />

          {/* Message footer */}
          <div className="flex items-center justify-between mt-1.5 sm:mt-2 pt-1.5 sm:pt-2 border-t border-current/10">
            <div className="text-xs opacity-70 message-timestamp">{new Date(message.createdAt).toLocaleTimeString()}</div>

            {/* Metadata */}
            {getMetadata() && (
              <div className="text-xs opacity-60 flex items-center gap-1 hidden sm:flex">
                <Timer className="w-3 h-3" />
                <span className="truncate max-w-[120px]">{getMetadata()}</span>
              </div>
            )}
          </div>
        </div>

        {/* Message Reactions */}
        <MessageReactions messageId={message.id} reactions={reactions} onAddReaction={onAddReaction} onRemoveReaction={onRemoveReaction} className="mt-2" />

        {/* Thread replies indicator - removed as threading properties no longer exist */}
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
