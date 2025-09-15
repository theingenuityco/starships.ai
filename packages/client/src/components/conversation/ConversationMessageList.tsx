'use client'

import { useConversation } from '@/hooks/useConversations'
import { cn } from '@/lib/utils'
import type { MessageModel } from '@starships/protocol'
import { Bot, User } from 'lucide-react'
import { useEffect, useMemo, useRef } from 'react'
import { ConversationMessageContent } from './ConversationMessageContent'

interface ConversationMessageListProps {
  conversationId: string | null
  starshipId?: string
}

export function ConversationMessageList({ conversationId, starshipId }: ConversationMessageListProps) {
  // Get messages and streaming state from unified hook
  const { messages, isLoading, error, isStreaming, streamingContent } = useConversation(conversationId)

  // Scroll container reference
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  // Create display messages including streaming content
  const displayMessages = useMemo(() => {
    let combinedMessages = [...messages]

    // Add streaming message if we have streaming content
    if (isStreaming && streamingContent && streamingContent.trim()) {
      const hasStreamingMessage = messages.some(msg => msg.streaming === true)

      if (!hasStreamingMessage) {
        const streamingMessage = {
          id: `streaming-${Date.now()}`,
          content: streamingContent,
          role: 'assistant' as const,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          messageType: 'agent_response' as const,
          streaming: true,
        }
        combinedMessages = [...combinedMessages, streamingMessage]
      }
    }

    // Sort by creation time
    return combinedMessages.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
  }, [messages, isStreaming, streamingContent])

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollContainerRef.current) {
      const container = scrollContainerRef.current
      const isNearBottom = container.scrollTop + container.clientHeight >= container.scrollHeight - 100

      if (isNearBottom || isStreaming) {
        setTimeout(() => {
          container.scrollTop = container.scrollHeight
        }, 100)
      }
    }
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
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-4 py-6">
        <div className="max-w-4xl mx-auto space-y-6">
          {displayMessages.map(message => (
            <ConversationMessageBubble key={message.streaming ? `streaming-${message.content?.length}` : message.id} message={message} />
          ))}
        </div>
      </div>
    </div>
  )
}

interface ConversationMessageBubbleProps {
  message: MessageModel & { streaming?: boolean }
}

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
              enableCopy={false}
              enableLinkPreview={true}
              isStreaming={message.streaming}
              className="text-foreground"
            />
          </div>
        </div>
      </div>
    )
  }
}

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
