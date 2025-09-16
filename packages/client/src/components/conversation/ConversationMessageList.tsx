'use client'

import { useConversation } from '@/hooks/useConversations'
import { cn } from '@/lib/utils'
import type { MessageModel } from '@starships/protocol'
import { Bot, User } from 'lucide-react'
import { useEffect, useMemo, useRef, memo } from 'react'
import { ConversationMessageContent } from './ConversationMessageContent'
import { useStarshipUIStore } from '@/store/starship-ui-store'

interface ConversationMessageListProps {
  conversationId: string | null
  starshipId?: string
}

export function ConversationMessageList({ conversationId, starshipId }: ConversationMessageListProps) {
  // Get messages from the unified hook
  const { messages, isLoading, error } = useConversation(conversationId)

  // Stream state from zustand (ephemeral, avoids blocking React Query event loop)
  const streamingUI = useStarshipUIStore(s => (conversationId ? s.conversationsStreaming[conversationId] : undefined))
  const isStreaming = Boolean(streamingUI?.isStreaming)
  const streamingContent = streamingUI?.content ?? ''
  console.log('hello')
  // Scroll container reference
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const lastMessageCountRef = useRef(0)

  // Create display messages with optimized rendering
  const displayMessages = useMemo(() => {
    let combinedMessages = [...messages]

    // Add streaming message if we have streaming content
    if (isStreaming && streamingContent && streamingContent.trim()) {
      // Check if we already have a streaming message
      const existingStreamingIndex = combinedMessages.findIndex(msg => msg.streaming === true)

      const streamingMessage = {
        id: `streaming-${Date.now()}`,
        content: streamingContent,
        role: 'assistant' as const,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        messageType: 'agent_response' as const,
        streaming: true,
      }

      if (existingStreamingIndex >= 0) {
        // Update existing streaming message
        combinedMessages[existingStreamingIndex] = streamingMessage
      } else {
        // Add new streaming message
        combinedMessages = [...combinedMessages, streamingMessage]
      }
    }

    // Sort by creation time for consistent ordering
    return combinedMessages.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
  }, [messages, isStreaming, streamingContent])

  // Optimized auto-scroll with debouncing
  useEffect(() => {
    if (!scrollContainerRef.current) return

    const container = scrollContainerRef.current
    const shouldScroll = () => {
      const threshold = 100
      return container.scrollTop + container.clientHeight >= container.scrollHeight - threshold
    }

    // Only scroll if user is near bottom or new messages arrived
    if (shouldScroll() || displayMessages.length > lastMessageCountRef.current || isStreaming) {
      // Use requestAnimationFrame for smooth scrolling
      requestAnimationFrame(() => {
        container.scrollTo({
          top: container.scrollHeight,
          behavior: displayMessages.length === lastMessageCountRef.current ? 'smooth' : 'auto',
        })
      })
    }

    lastMessageCountRef.current = displayMessages.length
  }, [displayMessages.length, isStreaming, streamingContent])

  if (!conversationId) {
    return <EmptyState />
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-muted-foreground">Loading conversation...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-red-500">Failed to load conversation</div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-4 py-6 scroll-smooth">
        <div className="max-w-4xl mx-auto space-y-6">
          {displayMessages.map(message => (
            <MemoizedMessageBubble key={message.streaming ? `streaming-${message.id}` : message.id} message={message} />
          ))}
        </div>
      </div>
    </div>
  )
}

interface ContentChunk {
  content: string
  position: number
  timestamp: number
}

interface ConversationMessageBubbleProps {
  message: MessageModel & { streaming?: boolean; contentChunks?: ContentChunk[] }
}

// Memoized message bubble to prevent unnecessary re-renders
const MemoizedMessageBubble = memo(
  function ConversationMessageBubble({ message }: ConversationMessageBubbleProps) {
    const isUser = message.role === 'user'

    if (isUser) {
      // User message: Blue bubble on the right
      return (
        <div className="flex justify-end">
          <div className="flex items-end gap-3 max-w-[70%]">
            <div className="bg-primary text-primary-foreground rounded-2xl rounded-br-md px-4 py-3">
              <div className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</div>
            </div>
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center mb-1">
              <User className="w-4 h-4 text-primary" />
            </div>
          </div>
        </div>
      )
    } else {
      // AI message: Plain text on the left (no bubble)
      return (
        <div className="flex justify-start">
          <div className="flex items-start gap-3 max-w-[85%]">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-muted flex items-center justify-center mt-1">
              <Bot className="w-4 h-4 text-muted-foreground" />
            </div>
            <div className="min-w-0 flex-1">
              <ConversationMessageContent
                content={message.content}
                messageId={message.id}
                enableMarkdown={true}
                enableCopy={!message.streaming}
                enableLinkPreview={true}
                isStreaming={message.streaming}
                className="text-foreground"
                contentChunks={message.contentChunks}
              />
            </div>
          </div>
        </div>
      )
    }
  },
  (prevProps, nextProps) => {
    // Custom comparison for memo optimization
    if (prevProps.message.id !== nextProps.message.id) return false
    if (prevProps.message.streaming !== nextProps.message.streaming) return false

    // Re-render when text changes or contentChunks count changes
    const contentUnchanged = prevProps.message.content === nextProps.message.content
    const prevLen = prevProps.message.contentChunks?.length ?? 0
    const nextLen = nextProps.message.contentChunks?.length ?? 0
    const chunksUnchanged = prevLen === nextLen

    return contentUnchanged && chunksUnchanged
  }
)

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full p-8 text-center">
      <div className="max-w-md mx-auto space-y-6">
        <div className="space-y-2">
          <h3 className="text-2xl font-semibold text-foreground">Ready to Chat</h3>
          <p className="text-muted-foreground">Select an agent and start your conversation</p>
        </div>
      </div>
    </div>
  )
}
