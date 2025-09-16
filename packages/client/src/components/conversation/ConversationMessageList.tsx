'use client'

import { useStarshipUIStore } from '@/store/starship-ui-store'
import { cn } from '@/lib/utils'
import type { MessageModel } from '@starships/protocol'
import { Bot, User } from 'lucide-react'
import { useEffect, useMemo, useRef, memo } from 'react'
import { ConversationMessageContent } from './ConversationMessageContent'

// Stable empty array to prevent re-render storms when no conversationId is present.
// Returning a new array literal from the selector causes a new reference on every store change.
const EMPTY_MESSAGES: ReadonlyArray<MessageModel & { streaming?: boolean; contentChunks?: ContentChunk[] }> = Object.freeze([])

interface ConversationMessageListProps {
  conversationId: string | null
  starshipId?: string
}

export function ConversationMessageList({ conversationId, starshipId }: ConversationMessageListProps) {
  // Render purely from the Zustand UI store. The subscription to query + SSE is driven elsewhere (e.g., input).
  const isLoading = false
  const error: any = null

  const storeMessages = useStarshipUIStore(state => {
    if (!conversationId) return EMPTY_MESSAGES as any
    const convo = state.conversations[conversationId]
    return (convo?.messages as any) || EMPTY_MESSAGES
  })

  // Scroll container reference
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const lastMessageCountRef = useRef(0)

  // Create display messages with optimized rendering (no synthetic overlay; rely on server patches)
  const displayMessages = useMemo(() => {
    return [...storeMessages].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
  }, [storeMessages])

  // Optimized auto-scroll with debouncing
  useEffect(() => {
    if (!scrollContainerRef.current) return

    const container = scrollContainerRef.current
    const shouldScroll = () => {
      const threshold = 100
      return container.scrollTop + container.clientHeight >= container.scrollHeight - threshold
    }

    // Only scroll if user is near bottom or new messages arrived
    if (shouldScroll() || displayMessages.length > lastMessageCountRef.current) {
      // Use requestAnimationFrame for smooth scrolling
      requestAnimationFrame(() => {
        container.scrollTo({
          top: container.scrollHeight,
          behavior: displayMessages.length === lastMessageCountRef.current ? 'smooth' : 'auto',
        })
      })
    }

    lastMessageCountRef.current = displayMessages.length
  }, [displayMessages.length])

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
            <MemoizedMessageBubble key={message.id} message={message} />
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
