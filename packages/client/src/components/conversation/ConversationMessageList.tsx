'use client'

import Icon from '@/components/primitives/Icon'
import AgentAvatar from '@/components/animated/AgentAvatar'

import type { MessageModel } from '@starships/protocol'

import LoadingSpinner from '@/components/primitives/LoadingSpinner'
import { useEffect, useMemo, useRef, memo } from 'react'
import { ConversationMessageContent } from './ConversationMessageContent'
import { useConversationAgents } from '@/hooks/useConversations'
import { useConversationStreamContextOptional } from '@/hooks/ConversationStreamContext'
import type { LlmToolCall } from '@starships/autopilot'
import { useMessageAttachments } from '@/hooks/useFileUpload'
import { MessageAttachment, MessageAttachmentSkeleton } from './MessageAttachment'
import { useAuth } from '@/hooks/useAuth'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'

interface ConversationMessageListProps {
  conversationId: string | null
  starshipId?: string
  bottomPaddingPx?: number
  className?: string
  scrollClassName?: string
  /**
   * Optional override for the "user" identity (useful for demo / internal chats on landing).
   * If omitted, the component uses the signed-in user's info via `useAuth()`.
   */
  userNameOverride?: string
  userEmailOverride?: string
  userAvatarUrlOverride?: string
  /**
   * If set, render the user's avatar using the AgentAvatar component (seeded).
   * Useful to represent "Aria" when she's the delegator on the right side.
   */
  userAvatarSeedOverride?: string
  /**
   * Optional override for static/demo rendering (e.g. landing page).
   * When provided, the list will render these messages even if `conversationId` is null.
   */
  messagesOverride?: MessageModel[]
  /**
   * Optional overrides for demo/static rendering when no stream context exists.
   */
  agentNameOverride?: string
  agentAvatarUrlOverride?: string
  isRespondingOverride?: boolean
  isAssistantStreamingOverride?: boolean
  isAwaitingToolResultsOverride?: boolean
}

export function ConversationMessageList({
  conversationId,
  starshipId,
  bottomPaddingPx,
  className,
  scrollClassName,
  userNameOverride,
  userEmailOverride,
  userAvatarUrlOverride,
  userAvatarSeedOverride,
  messagesOverride,
  agentNameOverride,
  agentAvatarUrlOverride,
  isRespondingOverride,
  isAssistantStreamingOverride,
  isAwaitingToolResultsOverride,
}: ConversationMessageListProps) {
  // Render from stream context when available, otherwise allow static/demo rendering via overrides.
  const stream = useConversationStreamContextOptional()
  const messages = messagesOverride ?? stream?.messages ?? []
  const isResponding = isRespondingOverride ?? stream?.isResponding ?? false
  const isAssistantStreaming = isAssistantStreamingOverride ?? stream?.isAssistantStreaming ?? false
  const isAwaitingToolResults = isAwaitingToolResultsOverride ?? stream?.isAwaitingToolResults ?? false

  // Fallback to server-sourced conversation agents for reloads where the UI store lacks agentName
  const { data: conversationAgents = [] } = useConversationAgents(conversationId)
  const agentObj = Array.isArray(conversationAgents) && conversationAgents.length > 0 ? (conversationAgents[0] as any) : undefined
  const agentName = agentNameOverride ?? agentObj?.name
  const agentAvatarAttachmentId = agentObj?.avatarAttachmentId as string | undefined
  const avatarIds = useMemo(() => (agentAvatarAttachmentId ? [agentAvatarAttachmentId] : []), [agentAvatarAttachmentId])
  const { data: agentAvatarAttachments = [] } = useMessageAttachments(avatarIds, starshipId)
  const agentAvatarUrl = agentAvatarUrlOverride ?? agentAvatarAttachments?.[0]?.previewUrl

  // Scroll container reference
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const lastMessageCountRef = useRef(0)
  // Track whether the user is currently near the bottom. This avoids the "scroll a tiny amount then stop"
  // issue during streaming where message length stays constant but chunks keep appending.
  const isNearBottomRef = useRef(true)
  const SCROLL_THRESHOLD_PX = 120

  // Create display messages with optimized rendering and group tool calls with their results
  const displayMessages = useMemo(() => {
    // Sort ascending by createdAt
    const sortedMessages = [...messages].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())

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

      // 1) Collapse local temp assistant shell into the next concrete assistant
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
          if ((merged as any).toolCalls == null || (merged as any).toolCalls.length === 0) {
            ;(merged as any).toolCalls = cur.toolCalls
          }
          merged.streaming = cur.streaming || merged.streaming
          collapsedMessages.push(merged)
          i++ // skip concrete assistant already merged
          continue
        }
      }

      // 2) Drop server-side blank assistant shell (no content, chunks, reasoning, or toolCalls).
      // Preserve if it's actively streaming (so caret can show) and only drop if non-streaming.
      if (cur?.role === 'assistant' && !(typeof cur?.id === 'string' && cur.id.startsWith('temp-assistant-'))) {
        const streaming = Boolean((cur as any)?.streaming)
        const hasContent = typeof cur?.content === 'string' && cur.content.trim().length > 0
        const hasChunks = Array.isArray(cur?.chunks) && cur.chunks.length > 0
        const hasRChunks = Array.isArray(cur?.reasoningChunks) && cur.reasoningChunks.length > 0
        const hasReasoning = typeof cur?.reasoning === 'string' && cur.reasoning.trim().length > 0
        const hasToolCalls = Array.isArray(cur?.toolCalls) && cur.toolCalls.length > 0
        const hasAttachments = Array.isArray((cur as any)?.attachmentIds) && (cur as any).attachmentIds.length > 0

        if (!(hasContent || hasChunks || hasRChunks || hasReasoning || hasToolCalls || hasAttachments)) {
          // Keep actively streaming assistant shells visible
          if (streaming) {
            collapsedMessages.push(cur)
            continue
          }
          const next: any = uniqueMessages[i + 1]
          if (next && next.role === 'assistant') {
            // skip current blank shell; next will be processed/pushed in subsequent iterations
            continue
          } else {
            // trailing blank shell — drop it
            continue
          }
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
        const rid = (msg as any).toolCallId ?? (msg as any).call_id ?? (msg as any).id
        if (rid != null) {
          toolResultsMap.set(String(rid), msg)
        }
      }
    })

    // Second pass: group messages and attach matching tool results
    const groupedMessages: Array<MessageModel & { streaming?: boolean; chunks?: StreamChunk[]; sending?: boolean; toolResults?: any[] }> = []

    for (const message of baseMessages) {
      // If this is an assistant message with tool calls, attach all matching tool results
      if (message.role === 'assistant' && (message as any).toolCalls?.length > 0) {
        const toolCallIds = ((message as any).toolCalls || [])
          .map((tc: any) => (tc as any).id ?? (tc as any).call_id ?? (tc as any).toolCallId ?? (tc as any).function?.id)
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

    // UI guard: drop blank assistant shells (no content/chunks/reasoning and no toolCalls).
    // NOTE: Do NOT treat toolResults alone as renderable; without toolCalls the tool panel won't show.
    const pruned = groupedMessages.filter(msg => {
      if (msg.role !== 'assistant' || msg.messageType === 'tool_result') return true
      const a: any = msg as any
      const hasContent = typeof msg.content === 'string' && msg.content.trim().length > 0
      const hasChunks = Array.isArray(a?.chunks) && a.chunks.length > 0
      const hasRChunks = Array.isArray(a?.reasoningChunks) && a.reasoningChunks.length > 0
      const hasReasoning = typeof a?.reasoning === 'string' && a.reasoning.trim().length > 0
      const hasToolCalls = Array.isArray(a?.toolCalls) && a.toolCalls.length > 0
      const hasAttachments = Array.isArray(a?.attachmentIds) && a.attachmentIds.length > 0
      return hasContent || hasChunks || hasRChunks || hasReasoning || hasToolCalls || hasAttachments
    })

    return pruned
  }, [messages])

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

  // Determine if any assistant textual progress has occurred after the latest user turn.
  // Progress means: content tokens (chunks), reasoning tokens (reasoningChunks), final reasoning, or finalized content text.
  // Tool calls alone do NOT count as progress.
  const hasAssistantTextProgressAfterUser = useMemo(() => {
    // Find most recent user message index
    let lastUserIdx = -1
    for (let i = displayMessages.length - 1; i >= 0; i--) {
      const mm: any = displayMessages[i]
      if (mm?.role === 'user') {
        lastUserIdx = i
        break
      }
    }
    // Scan messages after the last user for any assistant textual progress
    for (let i = lastUserIdx + 1; i < displayMessages.length; i++) {
      const m: any = displayMessages[i]
      if (m?.role !== 'assistant') continue
      const hasChunks = Array.isArray(m?.chunks) && m.chunks.length > 0
      const hasRChunks = Array.isArray(m?.reasoningChunks) && m.reasoningChunks.length > 0
      const hasReasoning = typeof m?.reasoning === 'string' && m.reasoning.trim().length > 0
      const hasContent = typeof m?.content === 'string' && m.content.trim().length > 0
      if (hasChunks || hasRChunks || hasReasoning || hasContent) {
        return true
      }
    }
    return false
  }, [displayMessages])

  // When tools are executed mid-turn, show the GAP loader again until LLM resumes streaming text/reasoning.
  // We detect a "gap" if we see a tool_result after the last user message, but no assistant chunks/reasoning chunks
  // have arrived AFTER that tool_result.
  const awaitingResumeAfterTools = useMemo(() => {
    // Find most recent user message index
    let lastUserIdx = -1
    for (let i = displayMessages.length - 1; i >= 0; i--) {
      const mm: any = displayMessages[i]
      if (mm?.role === 'user') {
        lastUserIdx = i
        break
      }
    }

    // Most recent tool result timestamp after the user
    let lastToolTs = -1
    for (let i = lastUserIdx + 1; i < displayMessages.length; i++) {
      const m: any = displayMessages[i]
      // Standalone tool_result messages
      if (m?.messageType === 'tool_result') {
        const t = Date.parse(String(m?.createdAt || m?.updatedAt || ''))
        if (!Number.isNaN(t)) lastToolTs = Math.max(lastToolTs, t)
      }
      // Grouped tool results attached to assistant messages
      if (m?.role === 'assistant' && Array.isArray(m?.toolResults) && m.toolResults.length > 0) {
        for (const tr of m.toolResults as any[]) {
          const t = Date.parse(String(tr?.createdAt || tr?.updatedAt || ''))
          if (!Number.isNaN(t)) lastToolTs = Math.max(lastToolTs, t)
        }
      }
    }
    if (lastToolTs < 0) return false

    // Most recent assistant textual progress timestamp after the user.
    // Consider chunk timestamps when present; otherwise fall back to the finalized message timestamp
    // if the assistant has content or reasoning (common after refresh/baseline load).
    let lastAssistantProgressTs = -1
    for (let i = lastUserIdx + 1; i < displayMessages.length; i++) {
      const m: any = displayMessages[i]
      if (m?.role !== 'assistant') continue

      const hasChunks = Array.isArray(m?.chunks) && m.chunks.length > 0
      const hasRChunks = Array.isArray(m?.reasoningChunks) && m.reasoningChunks.length > 0
      const hasReasoning = typeof m?.reasoning === 'string' && m.reasoning.trim().length > 0
      const hasContent = typeof m?.content === 'string' && m.content.trim().length > 0

      const lastC = hasChunks ? Number(m.chunks[m.chunks.length - 1]?.timestamp) : -1
      const lastR = hasRChunks ? Number(m.reasoningChunks[m.reasoningChunks.length - 1]?.timestamp) : -1

      // Fallback to message updatedAt/createdAt when finalized text/reasoning exists but no chunks are present (e.g., after refresh)
      let finalTs = -1
      if ((hasContent || hasReasoning) && !(hasChunks || hasRChunks)) {
        const t = Date.parse(String(m?.updatedAt || m?.createdAt || ''))
        if (!Number.isNaN(t)) finalTs = t
      }

      lastAssistantProgressTs = Math.max(lastAssistantProgressTs, lastC, lastR, finalTs)
    }

    // Gap exists if no assistant textual progress has arrived AFTER the last tool result
    return lastAssistantProgressTs < 0 || lastAssistantProgressTs <= lastToolTs
  }, [displayMessages])

  // Final GAP loader decision: show if we're responding AND either:
  //  - no assistant text progress yet after the user (first response is pending), or
  //  - we are waiting for the assistant to resume after tool results.
  const shouldShowGapLoader = useMemo(() => {
    // We want the gap loader whenever the turn is active but we are not currently streaming text.
    // - Show before first tokens
    // - Show between assistant messages (assistant finished one message but turn is still active)
    // - Show for “resume after tools” gaps
    // - Do NOT show while awaiting tool results (tool UI shows its own spinner)
    const betweenMessages = isResponding && !isAssistantStreaming && !awaitingResumeAfterTools
    const responding = !isAwaitingToolResults && isResponding && (!hasAssistantTextProgressAfterUser || awaitingResumeAfterTools || betweenMessages)
    const toolGapFetching = awaitingResumeAfterTools && isResponding
    return responding || toolGapFetching
  }, [isAwaitingToolResults, isResponding, isAssistantStreaming, hasAssistantTextProgressAfterUser, awaitingResumeAfterTools])

  // Filter out assistant shells with no renderable content to avoid blank duplicate bubbles
  const renderMessages = useMemo(() => {
    const canRenderAssistant = (msg: any) => {
      if (msg.role !== 'assistant') return true
      if (msg.messageType === 'tool_result') return true
      const hasContent = typeof msg.content === 'string' && msg.content.trim().length > 0
      const hasChunks = Array.isArray(msg.chunks) && msg.chunks.length > 0
      const hasRChunks = Array.isArray((msg as any)?.reasoningChunks) && (msg as any).reasoningChunks.length > 0
      const hasReasoning = typeof (msg as any)?.reasoning === 'string' && (msg as any).reasoning.trim().length > 0
      const hasToolCalls = Array.isArray((msg as any)?.toolCalls) && (msg as any).toolCalls.length > 0
      const hasToolResults = Array.isArray((msg as any)?.toolResults) && (msg as any).toolResults.length > 0
      const hasAttachments = Array.isArray((msg as any)?.attachmentIds) && (msg as any).attachmentIds.length > 0
      return hasContent || hasChunks || hasRChunks || hasReasoning || hasToolCalls || hasToolResults || hasAttachments
    }
    return displayMessages.filter(canRenderAssistant)
  }, [displayMessages])

  // Active streaming ID among rendered messages (avoids selecting a filtered-out shell)
  const activeRenderedStreamingAssistantId = useMemo(() => {
    let lastId: string | null = null
    for (const m of renderMessages) {
      if (m.role === 'assistant' && (m as any).streaming) {
        lastId = m.id
      }
    }
    return lastId
  }, [renderMessages])

  // "Progress key" for streaming: changes when chunks/tool results advance even if message count doesn't.
  const lastRenderedMessage: any = renderMessages.length > 0 ? (renderMessages[renderMessages.length - 1] as any) : null
  const lastRenderedChunkTs = useMemo(() => {
    const chunks = lastRenderedMessage?.chunks
    if (Array.isArray(chunks) && chunks.length > 0) {
      return Number(chunks[chunks.length - 1]?.timestamp) || 0
    }
    return 0
  }, [lastRenderedMessage?.chunks])
  const lastRenderedProgressKey = useMemo(() => {
    const id = lastRenderedMessage?.id ?? 'none'
    const updatedAt = String(lastRenderedMessage?.updatedAt ?? lastRenderedMessage?.createdAt ?? '')
    const toolResultsLen = Array.isArray(lastRenderedMessage?.toolResults) ? lastRenderedMessage.toolResults.length : 0
    return [id, updatedAt, String(lastRenderedChunkTs), String(toolResultsLen), String(activeRenderedStreamingAssistantId ?? ''), shouldShowGapLoader ? 'gap' : ''].join('|')
  }, [
    activeRenderedStreamingAssistantId,
    lastRenderedChunkTs,
    lastRenderedMessage?.createdAt,
    lastRenderedMessage?.id,
    lastRenderedMessage?.updatedAt,
    lastRenderedMessage?.toolResults,
    shouldShowGapLoader,
  ])

  // Initialize near-bottom status on mount / when container ref becomes available.
  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return
    isNearBottomRef.current = container.scrollTop + container.clientHeight >= container.scrollHeight - SCROLL_THRESHOLD_PX
  }, [])

  // Optimized auto-scroll with debouncing (now supports streaming progress).
  useEffect(() => {
    if (!scrollContainerRef.current) return

    const container = scrollContainerRef.current
    const isActivelyStreaming = isAssistantStreaming || !!activeRenderedStreamingAssistantId || shouldShowGapLoader

    // Only scroll if user is near bottom (as last reported by onScroll) or new messages arrived.
    // NOTE: during streaming, content grows without a scroll event; keeping a ref avoids losing the lock.
    if (isNearBottomRef.current || displayMessages.length > lastMessageCountRef.current || shouldShowGapLoader) {
      // Use requestAnimationFrame for smooth scrolling
      requestAnimationFrame(() => {
        if (!scrollContainerRef.current) return
        scrollContainerRef.current.scrollTo({
          top: scrollContainerRef.current.scrollHeight,
          // Prefer immediate scroll during streaming to avoid "lagging behind" effect.
          behavior: displayMessages.length === lastMessageCountRef.current ? (isActivelyStreaming ? 'auto' : 'smooth') : 'auto',
        })
      })
    }

    lastMessageCountRef.current = displayMessages.length
  }, [activeRenderedStreamingAssistantId, displayMessages.length, isAssistantStreaming, lastRenderedProgressKey, shouldShowGapLoader])

  // Ensure the GAP loader remains visible by auto-scrolling when we are waiting for assistant text
  // either initially or while waiting after tool results.
  useEffect(() => {
    if (!scrollContainerRef.current) return
    if (shouldShowGapLoader) {
      requestAnimationFrame(() => {
        if (!scrollContainerRef.current) return
        scrollContainerRef.current.scrollTo({ top: scrollContainerRef.current.scrollHeight, behavior: 'smooth' })
      })
    }
  }, [shouldShowGapLoader])

  if (!conversationId && !messagesOverride) {
    return <EmptyState />
  }

  return (
    <div className={cn('h-full flex flex-col', className)}>
      <div
        ref={scrollContainerRef}
        className={cn('flex-1 overflow-y-auto px-4 pt-6 scroll-smooth', scrollClassName)}
        style={{ paddingBottom: bottomPaddingPx ?? 160 }}
        onScroll={() => {
          const container = scrollContainerRef.current
          if (!container) return
          isNearBottomRef.current = container.scrollTop + container.clientHeight >= container.scrollHeight - SCROLL_THRESHOLD_PX
        }}
      >
        <div className="w-full max-w-4xl mx-auto bg-transparent">
          {renderMessages.map((message, idx) => {
            const prev = idx > 0 ? (renderMessages[idx - 1] as any) : null
            const showAssistantAvatar = message.role !== 'assistant' ? true : !(prev && prev.role === 'assistant')
            return (
              <MemoizedMessageBubble
                key={message.id}
                message={message}
                agentName={message.agentName || agentName}
                agentAvatarUrl={agentAvatarUrl}
                isStreamingActive={message.id === activeRenderedStreamingAssistantId}
                starshipId={starshipId}
                showAssistantAvatar={showAssistantAvatar}
                userNameOverride={userNameOverride}
                userEmailOverride={userEmailOverride}
                userAvatarUrlOverride={userAvatarUrlOverride}
                userAvatarSeedOverride={userAvatarSeedOverride}
              />
            )
          })}
          {/* Gap loader: show while awaiting first assistant text OR between tool results and next assistant text */}
          {shouldShowGapLoader && (
            <div className="flex justify-start">
              <div className="flex items-start gap-3 w-full">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-muted flex items-center justify-center mt-1 overflow-hidden">
                  <AgentAvatar seed={agentName} imageUrl={agentAvatarUrl} size={32} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-sm leading-relaxed text-muted-foreground">
                    <LoadingSpinner className="w-4 h-4 text-muted-foreground" />
                    <span>{(agentName || 'Assistant') + ' is typing...'}</span>
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

// Extended message type with streaming properties
interface ExtendedMessage extends MessageModel {
  streaming?: boolean
  chunks?: StreamChunk[]
  sending?: boolean
  reasoning?: string
  reasoningChunks?: StreamChunk[]
  toolCalls?: LlmToolCall[]
  toolResults?: Array<{
    toolCallId?: string
    content?: string
  }>
  attachmentIds?: string[]
}

interface ConversationMessageBubbleProps {
  message: ExtendedMessage
  agentName?: string
  agentAvatarUrl?: string
  isStreamingActive?: boolean
  starshipId?: string
  showAssistantAvatar?: boolean
  userNameOverride?: string
  userEmailOverride?: string
  userAvatarUrlOverride?: string
  userAvatarSeedOverride?: string
}

function isImageUrl(value?: string | null): boolean {
  if (!value || typeof value !== 'string') return false
  const trimmed = value.trim()
  return /^(https?:\/\/|data:image\/[a-zA-Z]+;base64,|\/)/.test(trimmed)
}

function initialsFromName(name?: string | null): string {
  if (!name || typeof name !== 'string') return 'U'
  const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 2)
  if (parts.length === 0) return 'U'
  return parts
    .map(p => p[0]?.toUpperCase())
    .filter(Boolean)
    .join('')
}

// User message attachments component
function UserMessageAttachments({ attachmentIds, starshipId }: { attachmentIds: string[]; starshipId: string }) {
  const { data: attachments, isLoading } = useMessageAttachments(attachmentIds, starshipId)

  if (isLoading) {
    return (
      <div className="mb-1 space-y-2">
        {attachmentIds.map(id => (
          <MessageAttachmentSkeleton key={id} className="max-w-xs" />
        ))}
      </div>
    )
  }

  if (!attachments || attachments.length === 0) {
    return null
  }

  return (
    <div className="mb-1 space-y-2">
      {attachments.map(attachment => (
        <MessageAttachment key={attachment.id} attachment={attachment} className="max-w-xs" />
      ))}
    </div>
  )
}

// Memoized message bubble to prevent unnecessary re-renders
const MemoizedMessageBubble = memo(
  function ConversationMessageBubble({
    message,
    agentName,
    agentAvatarUrl,
    isStreamingActive,
    starshipId,
    showAssistantAvatar = true,
    userNameOverride,
    userEmailOverride,
    userAvatarUrlOverride,
    userAvatarSeedOverride,
  }: ConversationMessageBubbleProps) {
    const isUser = message.role === 'user'
    const { userName, userEmail, userAvatar } = useAuth()
    const effectiveUserName = userNameOverride ?? userName
    const effectiveUserEmail = userEmailOverride ?? userEmail
    const effectiveUserAvatar = userAvatarUrlOverride ?? userAvatar

    if (isUser) {
      // User message: Neutral bubble on the right
      return (
        <div className="flex justify-end">
          <div className="mb-4 mt-6 flex items-end gap-3 max-w-[70%]">
            <div className="flex flex-col gap-2 items-end">
              {/* Attachments outside bubble */}
              {message.attachmentIds && message.attachmentIds.length > 0 && starshipId && <UserMessageAttachments attachmentIds={message.attachmentIds} starshipId={starshipId} />}
              {/* Message bubble (match navigation/sidebar background color) */}
              <div className={`bg-card text-card-foreground shadow-sm rounded-2xl rounded-br-md px-4 py-3 relative ${message.sending ? 'opacity-70' : ''}`}>
                <div className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</div>
                {message.sending && (
                  <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-card border-2 border-background rounded-full flex items-center justify-center">
                    <div className="w-2 h-2 bg-card-foreground rounded-full animate-pulse" />
                  </div>
                )}
              </div>
            </div>
            <Avatar className="flex-shrink-0 w-8 h-8 rounded-full ring-1 ring-border/40 bg-primary/10 mb-1 overflow-hidden">
              {userAvatarSeedOverride ? (
                <AgentAvatar seed={userAvatarSeedOverride} size={32} />
              ) : isImageUrl(effectiveUserAvatar) ? (
                <AvatarImage
                  src={effectiveUserAvatar!}
                  alt={effectiveUserName || effectiveUserEmail || 'User avatar'}
                  referrerPolicy="no-referrer"
                  crossOrigin="anonymous"
                  className="rounded-full object-cover"
                />
              ) : null}
              <AvatarFallback className="rounded-full bg-primary/10 text-primary text-xs font-semibold">{initialsFromName(effectiveUserName || effectiveUserEmail)}</AvatarFallback>
            </Avatar>
          </div>
        </div>
      )
    } else {
      // AI message: Plain text on the left (no bubble)
      return (
        <div className="flex justify-start">
          <div className="flex items-start gap-3 w-full">
            {showAssistantAvatar ? (
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-muted flex items-center justify-center mt-1 overflow-hidden">
                <AgentAvatar seed={agentName} imageUrl={agentAvatarUrl} size={32} />
              </div>
            ) : (
              <div className="flex-shrink-0 w-8 h-8 mt-1" aria-hidden="true" />
            )}
            <div className="flex-1 w-full">
              <ConversationMessageContent
                content={message.content}
                messageId={message.id}
                enableMarkdown={true}
                enableCopy={!isStreamingActive}
                enableLinkPreview={true}
                isStreaming={!!isStreamingActive}
                className="text-foreground"
                chunks={message.chunks}
                reasoning={message.reasoning}
                reasoningChunks={message.reasoningChunks}
                agentName={agentName}
                toolCalls={message.toolCalls}
                toolResults={message.toolResults}
                messageType={message.messageType}
                attachmentIds={message.attachmentIds}
                starshipId={starshipId}
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
    if ((prevProps.showAssistantAvatar ?? true) !== (nextProps.showAssistantAvatar ?? true)) return false

    // Re-render when agent label changes (post-reload agent restoration)
    if ((prevProps.agentName || '') !== (nextProps.agentName || '')) return false

    // Re-render if the agent avatar URL changes (e.g. after attachments load)
    if ((prevProps.agentAvatarUrl || '') !== (nextProps.agentAvatarUrl || '')) return false

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
    const prevCalls = (prevProps.message as any).toolCalls?.length ?? 0
    const nextCalls = (nextProps.message as any).toolCalls?.length ?? 0
    if (prevCalls !== nextCalls) return false

    // Re-render when user overrides change (demo/internal chats)
    if ((prevProps.userNameOverride || '') !== (nextProps.userNameOverride || '')) return false
    if ((prevProps.userEmailOverride || '') !== (nextProps.userEmailOverride || '')) return false
    if ((prevProps.userAvatarUrlOverride || '') !== (nextProps.userAvatarUrlOverride || '')) return false
    if ((prevProps.userAvatarSeedOverride || '') !== (nextProps.userAvatarSeedOverride || '')) return false

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
