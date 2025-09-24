'use client'

import { useStarshipUIStore } from '@/store/starship-ui-store'
import { cn } from '@/lib/utils'
import type { MessageModel } from '@starships/protocol'
import { Bot, User, Loader2 } from 'lucide-react'
import { useEffect, useMemo, useRef, memo } from 'react'
import { ConversationMessageContent } from './ConversationMessageContent'

// Stable empty array to prevent re-render storms when no conversationId is present.
// Returning a new array literal from the selector causes a new reference on every store change.
const EMPTY_MESSAGES: ReadonlyArray<MessageModel & { streaming?: boolean; chunks?: StreamChunk[]; sending?: boolean }> = Object.freeze([])

interface ConversationMessageListProps {
  conversationId: string | null
  starshipId?: string
  bottomPaddingPx?: number
}

export function ConversationMessageList({ conversationId, starshipId, bottomPaddingPx }: ConversationMessageListProps) {
  // Render purely from the Zustand UI store. The subscription to query + SSE is driven elsewhere (e.g., input).
  const isLoading = false
  const error: any = null

  // Use stable selectors to avoid returning new objects each render
  const storeMessages = useStarshipUIStore(state => {
    if (!conversationId) return EMPTY_MESSAGES as any
    const convo = state.conversations[conversationId]
    return (convo?.messages as any) || EMPTY_MESSAGES
  })
  const agentName = useStarshipUIStore(state => {
    if (!conversationId) return undefined
    return state.conversations[conversationId]?.agentName
  })
  const isResponding = useStarshipUIStore(state => {
    if (!conversationId) return false
    return state.conversations[conversationId]?.isResponding === true
  })

  // Scroll container reference
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const lastMessageCountRef = useRef(0)

  // Create display messages with optimized rendering and group tool calls with their results
  const displayMessages = useMemo(() => {
    // Sort ascending by createdAt
    const sortedMessages = [...storeMessages].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())

    // Deduplicate by message id to avoid duplicates during baseline replays or optimistic/SSE overlaps
    const seenIds = new Set<string>()
    const uniqueMessages: Array<MessageModel & { streaming?: boolean; chunks?: StreamChunk[]; sending?: boolean }> = []
    for (const m of sortedMessages) {
      const key = (m as any)?.id != null ? String((m as any).id) : null
      if (key) {
        if (seenIds.has(key)) continue
        seenIds.add(key)
      }
      uniqueMessages.push(m)
    }

    // Collapse temp assistant shell followed by concrete assistant from server (UI-level safety if merging missed)
    const collapsedMessages: Array<MessageModel & { streaming?: boolean; chunks?: StreamChunk[]; sending?: boolean }> = []
    for (let i = 0; i < uniqueMessages.length; i++) {
      const cur: any = uniqueMessages[i]
      if (cur?.role === 'assistant' && typeof cur?.id === 'string' && cur.id.startsWith('temp-assistant-')) {
        const next: any = uniqueMessages[i + 1]
        if (next && next.role === 'assistant' && !(typeof next.id === 'string' && next.id.startsWith('temp-assistant-'))) {
          const merged: any = { ...next }
          if (Array.isArray(cur.chunks) && (!Array.isArray(merged.chunks) || merged.chunks.length === 0)) {
            merged.chunks = cur.chunks
          }
          if (Array.isArray(cur.reasoningChunks) && (!Array.isArray(merged.reasoningChunks) || merged.reasoningChunks.length === 0)) {
            merged.reasoningChunks = cur.reasoningChunks
          }
          if ((merged as any).tool_calls == null || (merged as any).tool_calls.length === 0) {
            ;(merged as any).tool_calls = cur.tool_calls
          }
          merged.streaming = cur.streaming || merged.streaming
          collapsedMessages.push(merged)
          i++ // skip concrete assistant already merged
          continue
        }
      }
      collapsedMessages.push(cur)
    }

    const baseMessages = collapsedMessages

    // First pass: collect all tool result messages by normalized tool call id
    const toolResultsMap = new Map<string, any>()
    const processedResultIds = new Set<string>()

    baseMessages.forEach(msg => {
      if (msg.messageType === 'tool_result') {
        const rid = (msg as any).tool_call_id ?? (msg as any).call_id ?? (msg as any).id
        if (rid != null) {
          toolResultsMap.set(String(rid), msg)
        }
      }
    })

    // Second pass: group messages and attach matching tool results
    const groupedMessages: Array<MessageModel & { streaming?: boolean; chunks?: StreamChunk[]; sending?: boolean; toolResults?: any[] }> = []

    for (const message of baseMessages) {
      // If this is an assistant message with tool calls, attach all matching tool results
      if (message.role === 'assistant' && (message as any).tool_calls?.length > 0) {
        const toolCallIds = ((message as any).tool_calls || [])
          .map((tc: any) => (tc as any).id ?? (tc as any).call_id ?? (tc as any).tool_call_id ?? (tc as any).function?.id)
          .filter(Boolean)
          .map((id: any) => String(id))
        const toolResults: any[] = []

        // Collect all matching tool results
        for (const toolCallId of toolCallIds) {
          if (toolResultsMap.has(toolCallId)) {
            const result = toolResultsMap.get(toolCallId)
            toolResults.push(result)
            processedResultIds.add(result.id) // Mark as processed
          }
        }

        // Add the grouped message with tool results
        groupedMessages.push({
          ...message,
          toolResults,
        })
      }
      // Only add tool result messages if they weren't already grouped with their tool calls
      else if (message.messageType === 'tool_result' && !processedResultIds.has(message.id)) {
        groupedMessages.push(message)
      }
      // For all other messages, add them normally
      else if (message.messageType !== 'tool_result') {
        groupedMessages.push(message)
      }
    }

    return groupedMessages
  }, [storeMessages])

  // Determine which assistant message should display the streaming caret (latest streaming one)
  const activeStreamingAssistantId = useMemo(() => {
    let lastId: string | null = null
    for (const m of displayMessages) {
      if (m.role === 'assistant' && (m as any).streaming) {
        lastId = m.id
      }
    }
    return lastId
  }, [displayMessages])

  // Hide "responding" indicator if any assistant is already streaming (prevents double assistant rows)
  const hasAssistantStreaming = useMemo(() => {
    return displayMessages.some(m => m.role === 'assistant' && (m as any).streaming === true)
  }, [displayMessages])

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
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-4 pt-6 scroll-smooth" style={{ paddingBottom: bottomPaddingPx ?? 160 }}>
        <div className="max-w-4xl mx-auto space-y-2">
          {displayMessages.map(message => (
            <MemoizedMessageBubble key={message.id} message={message} agentName={agentName} isStreamingActive={message.id === activeStreamingAssistantId} />
          ))}
          {/* Show responding indicator after the last user message */}
          {isResponding && agentName && displayMessages.length > 0 && displayMessages[displayMessages.length - 1]?.role === 'user' && !hasAssistantStreaming && (
            <div className="flex justify-start">
              <div className="flex items-start gap-3 max-w-[85%]">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-muted flex items-center justify-center mt-1">
                  <Bot className="w-4 h-4 text-muted-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-2 text-muted-foreground">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span className="text-xs font-medium">{agentName} is thinking...</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

interface StreamChunk {
  content: string
  position: number
  timestamp: number
}

interface ConversationMessageBubbleProps {
  message: MessageModel & { streaming?: boolean; chunks?: StreamChunk[]; sending?: boolean; toolResults?: any[] }
  agentName?: string
  isStreamingActive?: boolean
}

// Memoized message bubble to prevent unnecessary re-renders
const MemoizedMessageBubble = memo(
  function ConversationMessageBubble({ message, agentName, isStreamingActive }: ConversationMessageBubbleProps) {
    const isUser = message.role === 'user'

    if (isUser) {
      // User message: Blue bubble on the right
      return (
        <div className="flex justify-end">
          <div className="mb-4 mt-6 flex items-end gap-3 max-w-[70%]">
            <div className={`bg-primary text-primary-foreground rounded-2xl rounded-br-md px-4 py-3 relative ${message.sending ? 'opacity-70' : ''}`}>
              <div className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</div>
              {message.sending && (
                <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-primary border-2 border-background rounded-full flex items-center justify-center">
                  <div className="w-2 h-2 bg-primary-foreground rounded-full animate-pulse" />
                </div>
              )}
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
                enableCopy={!isStreamingActive}
                enableLinkPreview={true}
                isStreaming={!!isStreamingActive}
                className="text-foreground"
                chunks={message.chunks}
                reasoning={(message as any).reasoning}
                reasoningChunks={(message as any).reasoningChunks}
                agentName={agentName}
                toolCalls={(message as any).tool_calls}
                toolResults={(message as any).toolResults}
                messageType={message.messageType}
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
    if (prevProps.isStreamingActive !== nextProps.isStreamingActive) return false
    if (prevProps.message.messageType !== nextProps.message.messageType) return false

    // Re-render when text (assistant content) changes
    if (prevProps.message.content !== nextProps.message.content) return false

    // Re-render when reasoning text changes (server may replace aggregated with finalized)
    const prevReasoning = (prevProps.message as any).reasoning
    const nextReasoning = (nextProps.message as any).reasoning
    if (prevReasoning !== nextReasoning) return false

    // Re-render when reasoningChunks count changes (reasoning-first streaming)
    const prevRChunks = (prevProps.message as any).reasoningChunks?.length ?? 0
    const nextRChunks = (nextProps.message as any).reasoningChunks?.length ?? 0
    if (prevRChunks !== nextRChunks) return false

    // Re-render when content chunks count changes
    const prevChunks = prevProps.message.chunks?.length ?? 0
    const nextChunks = nextProps.message.chunks?.length ?? 0
    if (prevChunks !== nextChunks) return false

    // Re-render when tool calls count changes
    const prevCalls = (prevProps.message as any).tool_calls?.length ?? 0
    const nextCalls = (nextProps.message as any).tool_calls?.length ?? 0
    if (prevCalls !== nextCalls) return false

    // CRITICAL: Re-render when grouped toolResults attach later
    const prevToolResults = (prevProps.message as any).toolResults?.length ?? 0
    const nextToolResults = (nextProps.message as any).toolResults?.length ?? 0
    if (prevToolResults !== nextToolResults) return false

    return true
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
