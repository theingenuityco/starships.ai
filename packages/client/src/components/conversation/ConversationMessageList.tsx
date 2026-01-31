'use client'

import Icon from '@/components/primitives/Icon'
import AgentAvatar from '@/components/animated/AgentAvatar'

import type { MessageModel } from '@starships/protocol'

import LoadingSpinner from '@/components/primitives/LoadingSpinner'
import { useEffect, useMemo, useRef, memo, useState, Fragment, type ReactNode } from 'react'
import { ConversationMessageContent } from './ConversationMessageContent'
import { useConversationAgents } from '@/hooks/useConversations'
import { useConversationStreamContextOptional } from '@/hooks/ConversationStreamContext'
import type { LlmToolCall } from '@starships/autopilot'
import { useMessageAttachments } from '@/hooks/useFileUpload'
import { useAuth } from '@/hooks/useAuth'
import { buildPlainTextSnippet, stripMarkdownToPlainText } from '@/components/conversation/conversationSearch'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { TypingDots } from '@/components/ui/TypingDots'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { InlineWidgetRenderer } from '@/components/widgets/InlineWidgetRenderer'

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
   * Controls what the user avatar falls back to when no image/seed is provided.
   * - 'initials' (default): renders initials (e.g. "You" -> "Y")
   * - 'user-icon': renders a generic user icon (recommended for landing page mock conversations)
   */
  userAvatarFallbackVariantOverride?: 'initials' | 'user-icon'
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
  /**
   * When 'hero', uses larger text (+2px) and bigger avatars for landing demos.
   * When 'delegation', uses smaller text and tighter spacing to fit multi-panel demos without scroll.
   */
  sizeVariant?: 'default' | 'hero' | 'delegation'
  /** When true, hide the copy and download turn-action buttons (e.g. for landing demos). */
  hideTurnActionButtons?: boolean
  /** Submitted search query (runs search and opens sidebar). When set, used for highlight and matching. */
  submittedQuery?: string
  /** Called when user submits search (Enter or Search button). */
  onSearchSubmit?: (query: string) => void
  /** Called when search results are computed (for sidebar). */
  onSearchResults?: (results: import('./conversationSearch').SearchResult[]) => void
  /** When set (e.g. from sidebar result click), scroll to this match index. */
  selectedMatchIndex?: number | null
  /** When true, hide the search input (e.g. when search is in navbar) and show only Prev/Next. */
  hideSearchInput?: boolean
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
  userAvatarFallbackVariantOverride,
  messagesOverride,
  agentNameOverride,
  agentAvatarUrlOverride,
  isRespondingOverride,
  isAssistantStreamingOverride,
  isAwaitingToolResultsOverride,
  sizeVariant = 'default',
  hideTurnActionButtons = false,
  submittedQuery: submittedQueryProp,
  onSearchSubmit,
  onSearchResults,
  selectedMatchIndex,
  hideSearchInput = false,
}: ConversationMessageListProps) {
  const params = useParams<{ slug?: string }>()
  const starshipSlug = useMemo(() => {
    const raw = (params as any)?.slug
    if (typeof raw === 'string') return raw
    if (Array.isArray(raw) && typeof raw[0] === 'string') return raw[0]
    return undefined
  }, [params])

  // Render from stream context when available, otherwise allow static/demo rendering via overrides.
  const stream = useConversationStreamContextOptional()
  const messages = messagesOverride ?? stream?.messages ?? []
  const isResponding = isRespondingOverride ?? stream?.isResponding ?? false
  const isAssistantStreaming = isAssistantStreamingOverride ?? stream?.isAssistantStreaming ?? false
  const isAwaitingToolResults = isAwaitingToolResultsOverride ?? stream?.isAwaitingToolResults ?? false

  // Fallback to server-sourced conversation agents for reloads where the UI store lacks agentName
  const { data: conversationAgents = [] } = useConversationAgents(conversationId)
  const agentObj = Array.isArray(conversationAgents) && conversationAgents.length > 0 ? conversationAgents[0] : undefined
  const agentName = agentNameOverride ?? agentObj?.name
  const agentSlug = useMemo(() => {
    const raw = (agentObj as any)?.slug
    return typeof raw === 'string' && raw.trim().length > 0 ? raw.trim() : undefined
  }, [agentObj])
  const agentAvatarAttachmentId = agentObj?.avatarAttachmentId as string | undefined
  const avatarIds = useMemo(() => (agentAvatarAttachmentId ? [agentAvatarAttachmentId] : []), [agentAvatarAttachmentId])
  const { data: agentAvatarAttachments = [] } = useMessageAttachments(avatarIds, starshipId)
  const agentAvatarUrl = agentAvatarUrlOverride ?? agentAvatarAttachments?.[0]?.previewUrl

  // Scroll container reference
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const lastMessageCountRef = useRef(0)
  const messageRefs = useRef<Record<string, HTMLDivElement | null>>({})

  // In-chat search: local input value (typed); submitted query from parent drives highlight and sidebar
  const [searchInputValue, setSearchInputValue] = useState('')
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0)
  const submittedQuery = submittedQueryProp ?? ''
  const highlightTerm = submittedQuery.trim() || undefined
  // Normalize query by stripping markdown so "The last **Avatar** movie" matches content "The last Avatar movie".
  const normalizedHighlightTerm = highlightTerm ? (stripMarkdownToPlainText(highlightTerm).trim() || undefined) : undefined
  // Track whether the user is currently near the bottom. This avoids the "scroll a tiny amount then stop"
  // issue during streaming where message length stays constant but chunks keep appending.
  const isNearBottomRef = useRef(true)
  const SCROLL_THRESHOLD_PX = 120

  // Create display messages with optimized rendering and group tool calls with their results
  const displayMessages = useMemo(() => {
    // Sort ascending by createdAt, with a special rule for the active stream placeholder.
    //
    // Why:
    // During an active turn the backend streams deltas into a stable placeholder message id:
    // `stream-${turnId}`. Tool-call messages can be persisted as separate assistant messages with a
    // slightly later createdAt, which would cause the placeholder bubble to appear *above* them.
    // Then, when more deltas arrive, it looks like "streaming resumed from an earlier message"
    // even though the correct messageId is being updated.
    //
    // UX: while streaming, keep the stream placeholder pinned to the bottom of the list.
    const toTime = (s: any): number => {
      const t = typeof s === 'string' ? Date.parse(s) : NaN
      return Number.isFinite(t) ? t : 0
    }
    const sortKey = (m: any): number => {
      const base = toTime(m?.createdAt)
      const id = typeof m?.id === 'string' ? m.id : ''
      const streaming = Boolean(m?.streaming)
      if (streaming && id.startsWith('stream-')) return Number.MAX_SAFE_INTEGER
      return base
    }
    const sortedMessages = [...messages].sort((a, b) => {
      const ka = sortKey(a as any)
      const kb = sortKey(b as any)
      if (ka !== kb) return ka - kb
      // Tie-breaker: createdAt then id for deterministic order
      const ta = toTime((a as any)?.createdAt)
      const tb = toTime((b as any)?.createdAt)
      if (ta !== tb) return ta - tb
      return String((a as any)?.id ?? '').localeCompare(String((b as any)?.id ?? ''))
    })

    // Deduplicate by message id to avoid duplicates during baseline replays or optimistic/SSE overlaps
    // IMPORTANT: For assistant messages with tool calls, deduplicate by (id + toolCallIds) to preserve
    // multiple assistant messages with the same id but different tool calls
    const seenIds = new Set<string>()
    const uniqueMessages: Array<MessageModel & { streaming?: boolean; chunks?: StreamChunk[]; sending?: boolean }> = []
    for (const m of sortedMessages) {
      const key = m.id != null ? String(m.id) : null
      if (key) {
        // For assistant messages with tool calls, create a composite key to preserve messages with different tool calls
        if (m.role === 'assistant' && Array.isArray(m.toolCalls) && m.toolCalls.length > 0) {
          const toolCallIds = m.toolCalls
            .map((tc: any) => tc.id ?? tc.call_id ?? tc.toolCallId)
            .filter(Boolean)
            .join(',')
          const compositeKey = `${key}:${toolCallIds}`
          if (seenIds.has(compositeKey)) continue
          seenIds.add(compositeKey)
        } else {
          if (seenIds.has(key)) continue
          seenIds.add(key)
        }
      }
      uniqueMessages.push(m)
    }

    // Collapse temp user + assistant shells followed by concrete messages from server (UI-level safety if merging missed)
    const collapsedMessages: Array<MessageModel & { streaming?: boolean; chunks?: StreamChunk[]; sending?: boolean }> = []

    for (let i = 0; i < uniqueMessages.length; i++) {
      const cur = uniqueMessages[i] as ExtendedMessage

      // 0) Collapse local temp user message into the next concrete user message.
      // This avoids a common "double user message" when we pre-seed a temp message during the
      // /conversations -> /conversations/:id handoff and the server later emits the real message via SSE.
      if (cur?.role === 'user' && typeof cur?.id === 'string' && cur.id.startsWith('temp-user-')) {
        const next = uniqueMessages[i + 1] as ExtendedMessage | undefined
        if (next && next.role === 'user' && !(typeof next.id === 'string' && next.id.startsWith('temp-user-'))) {
          const curContent = String(cur?.content ?? '')
          const nextContent = String(next?.content ?? '')
          const curTs = Number(new Date(cur.createdAt).getTime())
          const nextTs = Number(new Date(next.createdAt).getTime())
          // Require same content and very close timestamps so we don't hide intentional repeats.
          if (curContent === nextContent && Number.isFinite(curTs) && Number.isFinite(nextTs) && Math.abs(nextTs - curTs) <= 15_000) {
            collapsedMessages.push(next)
            i++ // skip next (we already pushed it)
            continue
          }
        }
      }

      // 1) Collapse local temp assistant shell into the next concrete assistant
      if (cur?.role === 'assistant' && typeof cur?.id === 'string' && cur.id.startsWith('temp-assistant-')) {
        const next = uniqueMessages[i + 1] as ExtendedMessage | undefined
        if (next && next.role === 'assistant' && !(typeof next.id === 'string' && next.id.startsWith('temp-assistant-'))) {
          const merged: ExtendedMessage = { ...next }
          if (Array.isArray(cur.chunks) && (!Array.isArray(merged.chunks) || merged.chunks.length === 0)) {
            merged.chunks = cur.chunks
          }
          if (Array.isArray(cur.reasoningChunks) && (!Array.isArray(merged.reasoningChunks) || merged.reasoningChunks.length === 0)) {
            merged.reasoningChunks = cur.reasoningChunks
          }
          // Merge tool calls: combine arrays to preserve all tool calls from both messages
          const curToolCalls = Array.isArray(cur.toolCalls) ? cur.toolCalls : []
          const mergedToolCalls = Array.isArray(merged.toolCalls) ? merged.toolCalls : []
          if (curToolCalls.length > 0 || mergedToolCalls.length > 0) {
            // Combine tool calls, avoiding duplicates by ID
            const toolCallMap = new Map<string, LlmToolCall>()
            // First add merged tool calls
            mergedToolCalls.forEach(tc => {
              const tcWithExtras = tc as LlmToolCall & { call_id?: string; toolCallId?: string }
              const id = tc.id ?? tcWithExtras.call_id ?? tcWithExtras.toolCallId
              if (id != null) {
                toolCallMap.set(String(id), tc)
              }
            })
            // Then add current tool calls (will overwrite if duplicate ID, but that's fine)
            curToolCalls.forEach(tc => {
              const tcWithExtras = tc as LlmToolCall & { call_id?: string; toolCallId?: string }
              const id = tc.id ?? tcWithExtras.call_id ?? tcWithExtras.toolCallId
              if (id != null) {
                toolCallMap.set(String(id), tc)
              } else {
                // If no ID, add it anyway (might be a partial tool call)
                toolCallMap.set(`no-id-${toolCallMap.size}`, tc)
              }
            })
            merged.toolCalls = Array.from(toolCallMap.values())
          }
          merged.streaming = cur.streaming || merged.streaming
          collapsedMessages.push(merged)
          i++ // skip concrete assistant already merged
          continue
        }
      }

      // 2) Drop server-side blank assistant shell (no content, chunks, reasoning, or toolCalls).
      // Preserve if it's actively streaming (so caret can show) and only drop if non-streaming.
      // IMPORTANT: Always preserve assistant messages with tool calls, even if they have no content
      if (cur?.role === 'assistant' && !(typeof cur?.id === 'string' && cur.id.startsWith('temp-assistant-'))) {
        const streaming = Boolean(cur.streaming)
        const hasContent = typeof cur.content === 'string' && cur.content.trim().length > 0
        const hasChunks = Array.isArray(cur.chunks) && cur.chunks.length > 0
        const hasRChunks = Array.isArray(cur.reasoningChunks) && cur.reasoningChunks.length > 0
        const hasReasoning = typeof cur.reasoning === 'string' && cur.reasoning.trim().length > 0
        const hasToolCalls = Array.isArray(cur.toolCalls) && cur.toolCalls.length > 0
        const hasAttachments = Array.isArray(cur.attachmentIds) && cur.attachmentIds.length > 0

        // Always preserve assistant messages with tool calls, even if they have no other content
        if (hasToolCalls) {
          collapsedMessages.push(cur)
          continue
        }

        if (!(hasContent || hasChunks || hasRChunks || hasReasoning || hasAttachments)) {
          // Keep actively streaming assistant shells visible
          if (streaming) {
            collapsedMessages.push(cur)
            continue
          }
          // IMPORTANT: When multiple assistant messages exist in sequence, we need to be careful
          // If the next message is also an assistant, check if it has tool calls
          // If it does, the current blank shell might be a placeholder that should be dropped
          // If it doesn't, preserve the current one to avoid losing messages
          const next = uniqueMessages[i + 1] as ExtendedMessage | undefined
          if (next && next.role === 'assistant') {
            const nextHasToolCalls = Array.isArray(next.toolCalls) && next.toolCalls.length > 0
            // If next has tool calls, current blank shell is likely a placeholder - skip it
            // If next doesn't have tool calls either, preserve current to avoid losing messages
            if (nextHasToolCalls) {
              // skip current blank shell; next will be processed/pushed in subsequent iterations
              continue
            } else {
              // Both are blank - preserve current
              collapsedMessages.push(cur)
              continue
            }
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
        const toolResultMsg = msg as ExtendedMessage & { toolCallId?: string; call_id?: string }
        const rid = toolResultMsg.toolCallId ?? toolResultMsg.call_id ?? msg.id
        if (rid != null) {
          toolResultsMap.set(String(rid), msg)
        }
      }
    })

    // Second pass: group messages and attach matching tool results
    const groupedMessages: ExtendedMessage[] = []

    for (const message of baseMessages) {
      // If this is an assistant message with tool calls, attach all matching tool results
      const assistantMsg = message as ExtendedMessage
      if (assistantMsg.role === 'assistant' && Array.isArray(assistantMsg.toolCalls) && assistantMsg.toolCalls.length > 0) {
        const toolCallIds = assistantMsg.toolCalls
          .map(tc => {
            const tcWithExtras = tc as LlmToolCall & { call_id?: string; toolCallId?: string }
            return tc.id ?? tcWithExtras.call_id ?? tcWithExtras.toolCallId
          })
          .filter((id): id is string => id != null)
          .map(id => String(id))
        const toolResults: ExtendedMessage[] = []

        // Collect all matching tool results that haven't been processed yet
        for (const toolCallId of toolCallIds) {
          if (toolResultsMap.has(toolCallId)) {
            const result = toolResultsMap.get(toolCallId)
            if (result) {
              // Only attach if this result hasn't been processed yet (to avoid attaching same result to multiple messages)
              if (!processedResultIds.has(result.id)) {
                toolResults.push(result)
                processedResultIds.add(result.id) // Mark as processed
              }
            }
          }
        }

        // Always add assistant messages with tool calls, even if no results are attached yet
        // This ensures tool calls are visible even when results haven't arrived
        groupedMessages.push({
          ...assistantMsg,
          toolResults,
        })
      }
      // Only add tool result messages if they weren't already grouped with their tool calls
      // IMPORTANT: Do NOT render standalone tool_result messages.
      // Tool results should only render within the assistant message's tool panel once the matching tool call is present.
      // This prevents the UI from showing orphan tool results (which can happen when results arrive before the
      // assistant tool-call message is present client-side).
      else if (message.messageType === 'tool_result') {
        // Skip: tool results should only render within the assistant message's tool panel
        continue
      }
      // For all other messages, add them normally
      else {
        groupedMessages.push(message)
      }
    }

    // Cleanup pass: Find standalone tool results and attach them to matching assistant messages
    // This handles the case where tool results arrive before their assistant messages
    const standaloneToolResults = groupedMessages.filter(m => m.messageType === 'tool_result' && !processedResultIds.has(m.id))
    for (let i = groupedMessages.length - 1; i >= 0; i--) {
      const msg = groupedMessages[i] as ExtendedMessage
      if (msg.messageType === 'tool_result' && !processedResultIds.has(msg.id)) {
        const toolResultMsg = msg as ExtendedMessage & { toolCallId?: string; call_id?: string }
        const toolCallId = toolResultMsg.toolCallId ?? toolResultMsg.call_id ?? msg.id
        if (toolCallId != null) {
          // Look for an assistant message that has this tool call
          for (let j = 0; j < groupedMessages.length; j++) {
            const assistantMsg = groupedMessages[j] as ExtendedMessage
            if (assistantMsg.role === 'assistant' && Array.isArray(assistantMsg.toolCalls) && assistantMsg.toolCalls.length > 0) {
              const hasMatchingToolCall = assistantMsg.toolCalls.some(tc => {
                const tcWithExtras = tc as LlmToolCall & { call_id?: string; toolCallId?: string }
                const tcId = tc.id ?? tcWithExtras.call_id ?? tcWithExtras.toolCallId
                return tcId != null && String(tcId) === String(toolCallId)
              })
              if (hasMatchingToolCall) {
                // Attach this tool result to the assistant message
                const existingResults = Array.isArray(assistantMsg.toolResults) ? assistantMsg.toolResults : []
                assistantMsg.toolResults = [...existingResults, msg]
                processedResultIds.add(msg.id) // Mark as processed
                // Remove from groupedMessages
                groupedMessages.splice(i, 1)
                break
              }
            }
          }
        }
      }
    }

    // UI guard: drop blank assistant shells (no content/chunks/reasoning and no toolCalls).
    // NOTE: Do NOT treat toolResults alone as renderable; without toolCalls the tool panel won't show.
    const pruned = groupedMessages.filter(msg => {
      if (msg.role !== 'assistant' || msg.messageType === 'tool_result') return true
      const extendedMsg = msg as ExtendedMessage
      const hasContent = typeof msg.content === 'string' && msg.content.trim().length > 0
      const hasChunks = Array.isArray(extendedMsg.chunks) && extendedMsg.chunks.length > 0
      const hasRChunks = Array.isArray(extendedMsg.reasoningChunks) && extendedMsg.reasoningChunks.length > 0
      const hasReasoning = typeof extendedMsg.reasoning === 'string' && extendedMsg.reasoning.trim().length > 0
      const hasToolCalls = Array.isArray(extendedMsg.toolCalls) && extendedMsg.toolCalls.length > 0
      const hasAttachments = Array.isArray(extendedMsg.attachmentIds) && extendedMsg.attachmentIds.length > 0
      const hasUIActions = Array.isArray(extendedMsg.uiActions) && extendedMsg.uiActions.length > 0
      const shouldKeep = hasContent || hasChunks || hasRChunks || hasReasoning || hasToolCalls || hasAttachments || hasUIActions
      return shouldKeep
    })

    return pruned
  }, [messages])

  // Determine which assistant message should display the streaming caret (latest streaming one)
  const activeStreamingAssistantId = useMemo(() => {
    let lastId: string | null = null
    for (const m of displayMessages) {
      const extendedMsg = m as ExtendedMessage
      if (m.role === 'assistant' && extendedMsg.streaming) {
        lastId = m.id
      }
    }
    return lastId
  }, [displayMessages])

  // New loading logic:
  // - turn is active (isResponding)
  // - assistant hasn't started streaming tokens yet (isAssistantStreaming=false)
  // - if tools are actively running, tool UI should show its own state
  const shouldShowGapLoader = Boolean(isResponding && !isAssistantStreaming && !isAwaitingToolResults)

  // Filter out assistant shells with no renderable content to avoid blank duplicate bubbles
  const renderMessages = useMemo(() => {
    const canRenderAssistant = (msg: ExtendedMessage) => {
      if (msg.role !== 'assistant') return true
      if (msg.messageType === 'tool_result') return true
      const hasContent = typeof msg.content === 'string' && msg.content.trim().length > 0
      const hasChunks = Array.isArray(msg.chunks) && msg.chunks.length > 0
      const hasRChunks = Array.isArray(msg.reasoningChunks) && msg.reasoningChunks.length > 0
      const hasReasoning = typeof msg.reasoning === 'string' && msg.reasoning.trim().length > 0
      const hasToolCalls = Array.isArray(msg.toolCalls) && msg.toolCalls.length > 0
      const hasToolResults = Array.isArray(msg.toolResults) && msg.toolResults.length > 0
      const hasAttachments = Array.isArray(msg.attachmentIds) && msg.attachmentIds.length > 0
      const hasUIActions = Array.isArray(msg.uiActions) && msg.uiActions.length > 0
      return hasContent || hasChunks || hasRChunks || hasReasoning || hasToolCalls || hasToolResults || hasAttachments || hasUIActions
    }
    const filtered = displayMessages.filter(canRenderAssistant)
    return filtered
  }, [displayMessages])

  // Active streaming ID among rendered messages (avoids selecting a filtered-out shell)
  const activeRenderedStreamingAssistantId = useMemo(() => {
    let lastId: string | null = null
    for (const m of renderMessages) {
      const extendedM = m as ExtendedMessage
      if (m.role === 'assistant' && extendedM.streaming) {
        lastId = m.id
      }
    }
    return lastId
  }, [renderMessages])

  // "Progress key" for streaming: changes when chunks/tool results advance even if message count doesn't.
  const lastRenderedMessage: ExtendedMessage | null = renderMessages.length > 0 ? (renderMessages[renderMessages.length - 1] as ExtendedMessage) : null
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

  // In-chat search: one entry per occurrence (so "Avatar" 5 times = 5 positions, not 2 messages). Case-insensitive. Cap term length to avoid ReDoS. Use normalized term so markdown in query matches plain content.
  const MAX_SEARCH_TERM_LENGTH = 200
  const matchingPositions = useMemo(() => {
    if (!normalizedHighlightTerm) return []
    const q = normalizedHighlightTerm.trim().toLowerCase().slice(0, MAX_SEARCH_TERM_LENGTH)
    if (!q) return []
    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const positions: { messageId: string }[] = []
    for (const msg of renderMessages) {
      const content = typeof (msg as ExtendedMessage).content === 'string' ? (msg as ExtendedMessage).content : ''
      const reasoning = typeof (msg as ExtendedMessage).reasoning === 'string' ? (msg as ExtendedMessage).reasoning : ''
      // Strip markdown from content so "The last **Avatar** movie" in message matches query "the last avatar movie"
      const plainContent = stripMarkdownToPlainText(`${content} ${reasoning}`)
      const searchable = plainContent.toLowerCase()
      const matches = searchable.match(new RegExp(escaped, 'g'))
      const count = matches ? matches.length : 0
      for (let i = 0; i < count; i++) {
        positions.push({ messageId: msg.id })
      }
    }
    return positions
  }, [renderMessages, normalizedHighlightTerm])

  // Clamp current match index when query or matches change
  useEffect(() => {
    if (matchingPositions.length === 0) {
      setCurrentMatchIndex(0)
      return
    }
    setCurrentMatchIndex(i => Math.min(i, matchingPositions.length - 1))
  }, [matchingPositions.length, submittedQuery])

  // Scroll to current match when user clicks Prev/Next (main bar)
  useEffect(() => {
    if (matchingPositions.length === 0 || currentMatchIndex < 0) return
    const messageId = matchingPositions[currentMatchIndex]?.messageId
    if (!messageId) return
    const el = messageRefs.current[messageId]
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only scroll when user changes match index (Prev/Next)
  }, [currentMatchIndex])

  // When sidebar result is clicked: sync selectedMatchIndex and scroll to that message
  useEffect(() => {
    if (selectedMatchIndex == null || matchingPositions.length === 0) return
    const messageId = matchingPositions[selectedMatchIndex]?.messageId
    if (!messageId) return
    setCurrentMatchIndex(selectedMatchIndex)
    const el = messageRefs.current[messageId]
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [selectedMatchIndex, matchingPositions])

  // Build sidebar results (one per message) and report to parent.
  // Snippets are built from plain text (strip full message then slice) so we never show ** etc. Cap term length to avoid ReDoS. Use normalized term for matching.
  const searchResultsForSidebar = useMemo(() => {
    if (!normalizedHighlightTerm) return null
    const q = normalizedHighlightTerm.toLowerCase().trim().slice(0, MAX_SEARCH_TERM_LENGTH)
    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const results: import('./conversationSearch').SearchResult[] = []
    let firstIndexInPositions = 0
    for (const msg of renderMessages) {
      const content = typeof (msg as ExtendedMessage).content === 'string' ? (msg as ExtendedMessage).content : ''
      const reasoning = typeof (msg as ExtendedMessage).reasoning === 'string' ? (msg as ExtendedMessage).reasoning : ''
      const fullText = `${content} ${reasoning}`.trim()
      // Strip markdown so "The last **Avatar** movie" in message matches query "the last avatar movie"
      const plainFullText = stripMarkdownToPlainText(fullText)
      const searchable = plainFullText.toLowerCase()
      const matches = searchable.match(new RegExp(escaped, 'g'))
      const count = matches ? matches.length : 0
      if (count === 0) continue
      const contentSnippet = buildPlainTextSnippet(plainFullText || content, normalizedHighlightTerm)
      results.push({
        messageId: msg.id,
        role: msg.role,
        contentSnippet: contentSnippet || buildPlainTextSnippet(plainFullText || content, normalizedHighlightTerm),
        timestamp: (msg as ExtendedMessage).createdAt,
        occurrenceCount: count,
        firstMatchIndexInPositions: firstIndexInPositions,
        agentName: msg.role === 'assistant' ? ((msg as ExtendedMessage).agentName ?? agentName) : undefined,
      })
      firstIndexInPositions += count
    }
    return results
  }, [normalizedHighlightTerm, renderMessages, agentName])

  useEffect(() => {
    if (searchResultsForSidebar != null && onSearchResults) {
      onSearchResults(searchResultsForSidebar)
    }
  }, [searchResultsForSidebar, onSearchResults])

  // Message IDs that contain at least one match (so we can highlight the whole message bubble)
  const messageIdsWithMatch = useMemo(() => new Set(matchingPositions.map(p => p.messageId)), [matchingPositions])

  if (!conversationId && !messagesOverride) {
    return <EmptyState />
  }

  const hasSearchMatches = matchingPositions.length > 0
  const showSearchBar = sizeVariant === 'default' && renderMessages.length > 0
  const currentMatchMessageId = hasSearchMatches ? matchingPositions[currentMatchIndex]?.messageId : null

  return (
    <div className={cn('h-full flex flex-col', className)}>
      {showSearchBar && !hideSearchInput && (
        <div className="flex-shrink-0 border-b px-4 py-2 flex items-center gap-2 bg-background/95">
          {!hideSearchInput && (
            <>
              <div className="relative flex-1 min-w-0">
                <Icon name="search" className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none z-10" />
                <Input
                  type="text"
                  placeholder="Search in conversation..."
                  value={searchInputValue}
                  onChange={e => setSearchInputValue(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      const q = searchInputValue.trim()
                      if (q) onSearchSubmit?.(q)
                    }
                  }}
                  className="pl-8 pr-8 h-8 text-xs"
                  aria-label="Search in conversation"
                />
                {searchInputValue && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchInputValue('')
                      onSearchSubmit?.('')
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label="Clear search"
                  >
                    <Icon name="x" className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              {onSearchSubmit && (
                <Button
                  variant="default"
                  size="sm"
                  className="h-8 flex-shrink-0 text-xs"
                  onClick={() => {
                    const q = searchInputValue.trim()
                    if (q) onSearchSubmit(q)
                  }}
                  aria-label="Search"
                >
                  Search
                </Button>
              )}
            </>
          )}
          {highlightTerm && (
            <>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 flex-shrink-0"
                onClick={() => setCurrentMatchIndex(i => (i <= 0 ? matchingPositions.length - 1 : i - 1))}
                disabled={!hasSearchMatches}
                aria-label="Previous match"
              >
                <Icon name="caret-up" className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 flex-shrink-0"
                onClick={() => setCurrentMatchIndex(i => (i >= matchingPositions.length - 1 ? 0 : i + 1))}
                disabled={!hasSearchMatches}
                aria-label="Next match"
              >
                <Icon name="caret-down" className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
      )}
      <div
        ref={scrollContainerRef}
        className={cn('flex-1 overflow-y-auto px-4 scroll-smooth', sizeVariant === 'delegation' ? 'pt-3' : 'pt-6', scrollClassName)}
        style={{ paddingBottom: bottomPaddingPx ?? 160 }}
        onScroll={() => {
          const container = scrollContainerRef.current
          if (!container) return
          isNearBottomRef.current = container.scrollTop + container.clientHeight >= container.scrollHeight - SCROLL_THRESHOLD_PX
        }}
      >
        <div className="w-full max-w-4xl mx-auto bg-transparent">
          {renderMessages.map((message, idx) => {
            const prev = idx > 0 ? (renderMessages[idx - 1] as ExtendedMessage) : null
            const showAssistantAvatar = message.role !== 'assistant' ? true : !(prev && prev.role === 'assistant')
            const isFirstMessage = idx === 0
            const messageHasMatch = Boolean(highlightTerm && messageIdsWithMatch.has(message.id))
            const isCurrentMatch = message.id === currentMatchMessageId

            return (
              <Fragment key={message.id}>
                <div
                  ref={el => {
                    messageRefs.current[message.id] = el
                  }}
                  data-message-id={message.id}
                  className={cn(
                    messageHasMatch && 'rounded-lg transition-colors',
                    messageHasMatch && !isCurrentMatch && 'border-l-4 border-amber-500/60 bg-amber-500/5 dark:bg-amber-400/5 pl-2 -ml-2',
                    messageHasMatch && isCurrentMatch && 'border-l-4 border-amber-500 bg-amber-500/10 dark:bg-amber-400/10 pl-2 -ml-2 ring-1 ring-amber-500/40 dark:ring-amber-400/40'
                  )}
                >
                  <MemoizedMessageBubble
                    message={message}
                    agentName={message.agentName || agentName}
                    agentSlug={agentSlug}
                    starshipSlug={starshipSlug}
                    agentAvatarUrl={agentAvatarUrl}
                    isStreamingActive={message.id === activeRenderedStreamingAssistantId}
                    starshipId={starshipId}
                    showAssistantAvatar={showAssistantAvatar}
                    isFirstMessage={isFirstMessage && message.role === 'assistant' && message.messageType !== 'tool_result'}
                    userNameOverride={userNameOverride}
                    userEmailOverride={userEmailOverride}
                    userAvatarUrlOverride={userAvatarUrlOverride}
                    userAvatarSeedOverride={userAvatarSeedOverride}
                    userAvatarFallbackVariantOverride={userAvatarFallbackVariantOverride}
                    isAwaitingToolResults={isAwaitingToolResults}
                    isLastMessage={idx === renderMessages.length - 1}
                    sizeVariant={sizeVariant}
                    highlightTerm={normalizedHighlightTerm}
                  />
                  {(() => {
                    const widgets = message.role === 'assistant' && message.messageType !== 'tool_result' ? extractWidgetResults((message as ExtendedMessage).uiActions) : []
                    if (widgets.length === 0) return null
                    return (
                      <div className="flex justify-start">
                        <div className="flex items-start gap-3 w-full max-w-full pr-[52px]">
                          {/* Spacer to match avatar width */}
                          <div className="flex-shrink-0 w-10 h-10" aria-hidden="true" />
                          <div className="flex-1 w-full">
                            <div className="space-y-4 mt-3 w-full max-w-none">
                              {widgets.map(widget => (
                                <div key={widget.id} className="w-full max-w-none mb-4">
                                  {/* Conversational widget header - hidden for StarshipDetails (widget has its own "My Starship" title) */}
                                  {widget.widgetType !== 'StarshipDetails' && (
                                    <div className="text-sm w-full mb-4">
                                      <div className="flex items-baseline gap-1">
                                        <span className="font-medium">{widget.name}</span>
                                      </div>
                                      {widget.description && <div className="text-muted-foreground text-xs mt-1">{widget.description}</div>}
                                    </div>
                                  )}

                                  {/* Widget visualization - minimal styling, full width */}
                                  {/* NOTE: overflow-x-auto clips box-shadow; add padding so widget cards can render shadows without being cut off */}
                                  <div className="relative w-full max-w-none overflow-x-auto p-2 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                                    <InlineWidgetRenderer
                                      widget={{
                                        widgetType: widget.widgetType,
                                        props: widget.props,
                                      }}
                                      compactMode={true}
                                      className="w-full"
                                    />
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })()}
                </div>
              </Fragment>
            )
          })}
          {/* Gap loader: show while awaiting first assistant text OR between tool results and next assistant text */}
          {shouldShowGapLoader && (
            <div className="flex justify-start">
              {sizeVariant === 'hero' || sizeVariant === 'delegation' ? (
                <div className={cn('flex items-start w-full', sizeVariant === 'delegation' ? 'gap-2' : 'gap-3')}>
                  <div className={cn('flex-shrink-0 mt-1', sizeVariant === 'hero' ? 'w-10 h-10' : 'w-6 h-6')} aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <div className={cn('flex items-center gap-2 leading-relaxed text-muted-foreground', sizeVariant === 'hero' ? 'text-base' : 'text-sm')}>
                      <TypingDots />
                      <span className={sizeVariant === 'hero' ? 'text-base leading-relaxed' : 'text-sm leading-relaxed'}>Typing...</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="group flex items-start gap-3 w-full max-w-full pr-[52px] rounded-lg px-2 py-2 -mx-2 hover:bg-black/5 dark:hover:bg-white/10 transition-colors">
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-muted flex items-center justify-center mt-1 overflow-hidden">
                    <AgentAvatar seed={agentName || 'AI'} imageUrl={agentAvatarUrl} size={40} rounded />
                  </div>
                  <div className="min-w-0 flex-1 pt-0.5">
                    <div className="mb-1 text-sm font-bold text-foreground">
                      {typeof starshipSlug === 'string' && starshipSlug.trim().length > 0 && typeof agentSlug === 'string' && agentSlug.trim().length > 0 ? (
                        <Link href={`/ship/${encodeURIComponent(starshipSlug)}/agent/${encodeURIComponent(agentSlug)}`} className="font-mono hover:underline underline-offset-2">
                          {(agentName || 'Assistant').trim()}
                        </Link>
                      ) : (
                        <span className="font-mono">{(agentName || 'Assistant').trim()}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-sm leading-relaxed text-muted-foreground">
                      <TypingDots />
                      <span className="text-sm leading-relaxed">Typing...</span>
                    </div>
                  </div>
                </div>
              )}
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
  uiActions?: Array<{
    action: string
    payload?: Record<string, unknown>
  }>
  attachmentIds?: string[]
}

interface ConversationMessageBubbleProps {
  message: ExtendedMessage
  agentName?: string
  agentSlug?: string
  starshipSlug?: string
  agentAvatarUrl?: string
  isStreamingActive?: boolean
  starshipId?: string
  showAssistantAvatar?: boolean
  /**
   * If true, apply the same top spacing a first user message gets (mt-6)
   * so assistant-first conversations don't look "pinned" to the top.
   */
  isFirstMessage?: boolean
  userNameOverride?: string
  userEmailOverride?: string
  userAvatarUrlOverride?: string
  userAvatarSeedOverride?: string
  userAvatarFallbackVariantOverride?: 'initials' | 'user-icon'
  isAwaitingToolResults?: boolean
  isLastMessage?: boolean
  sizeVariant?: 'default' | 'hero' | 'delegation'
  /** When set, highlight this search term in message content (in-chat search). */
  highlightTerm?: string
}

const HIGHLIGHT_TERM_MAX_LENGTH = 200

/** Renders plain text with optional search term highlighted (for user bubbles that don't use markdown). Case-insensitive. Cap term length to avoid ReDoS. */
function renderTextWithHighlight(text: string, term: string | undefined): ReactNode {
  if (!term || term.trim() === '') return text
  const t = term.trim().slice(0, HIGHLIGHT_TERM_MAX_LENGTH)
  const escaped = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const parts = text.split(new RegExp(`(${escaped})`, 'gi'))
  const tLower = t.toLowerCase()
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === tLower ? (
          <mark key={i} className="bg-amber-200/70 dark:bg-amber-400/50 rounded px-0.5 font-medium">
            {part}
          </mark>
        ) : (
          part
        )
      )}
    </>
  )
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

// Known widget types from public-docs (rendered immediately after the message row)
const KNOWN_WIDGET_TYPES = new Set([
  'StatCard',
  'DataTable',
  'MetricGrid',
  'BarChart',
  'LineChart',
  'AreaChart',
  'PieChart',
  'DonutChart',
  'RadarChart',
  'RadialChart',
  'ConnectorSuggestionCard',
  'AgentSuggestionCard',
  'StarshipDetails',
])

type WidgetResult = {
  id: string
  widgetType: string
  props: Record<string, unknown>
  name: string
  description: string | undefined
  index: number
}

function extractWidgetResults(uiActions: unknown): WidgetResult[] {
  const actions = Array.isArray(uiActions) ? (uiActions as Array<{ action?: unknown; payload?: unknown }>) : []
  if (actions.length === 0) return []

  const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

  const outRaw: Array<WidgetResult | null> = actions.map((ua, index) => {
    if (!ua || ua.action !== 'render_widget') return null
    const payload = ua.payload
    if (!payload || !isRecord(payload)) return null
    const widget = payload['widget']
    if (!isRecord(widget)) return null

    const widgetType = typeof widget['widgetType'] === 'string' ? widget['widgetType'] : ''
    const props = widget['props']
    if (!widgetType || !KNOWN_WIDGET_TYPES.has(widgetType)) return null
    if (!props || typeof props !== 'object') return null

    const id =
      (typeof widget['id'] === 'string' && widget['id'].trim().length > 0 ? widget['id'] : '') ||
      (typeof payload['toolCallId'] === 'string' && String(payload['toolCallId']).trim().length > 0 ? String(payload['toolCallId']) : '') ||
      `ui-widget-${index}`

    return {
      id,
      widgetType,
      props: props as Record<string, unknown>,
      name: typeof widget['name'] === 'string' && widget['name'].trim().length > 0 ? widget['name'] : 'Widget',
      description: typeof widget['description'] === 'string' ? widget['description'] : undefined,
      index,
    } satisfies WidgetResult
  })
  const out = outRaw.filter((w): w is WidgetResult => w !== null)

  // Safety net: ensure stable unique keys even if upstream accidentally duplicates actions.
  const seen = new Set<string>()
  const deduped: WidgetResult[] = []
  for (const w of out) {
    if (seen.has(w.id)) continue
    seen.add(w.id)
    deduped.push(w)
  }

  return deduped
}

// Memoized message bubble to prevent unnecessary re-renders
const MemoizedMessageBubble = memo(
  function ConversationMessageBubble({
    message,
    agentName,
    agentSlug,
    starshipSlug,
    agentAvatarUrl,
    isStreamingActive,
    starshipId,
    showAssistantAvatar = true,
    isFirstMessage = false,
    userNameOverride,
    userEmailOverride,
    userAvatarUrlOverride,
    userAvatarSeedOverride,
    userAvatarFallbackVariantOverride,
    isAwaitingToolResults = false,
    isLastMessage = false,
    sizeVariant = 'default',
    highlightTerm,
  }: ConversationMessageBubbleProps) {
    const isHero = sizeVariant === 'hero'
    const isDelegation = sizeVariant === 'delegation'
    const avatarSize = isHero ? 40 : isDelegation ? 24 : 32
    const avatarClass = isHero ? 'w-10 h-10' : isDelegation ? 'w-6 h-6' : 'w-8 h-8'
    const contentTextClass = isHero ? 'text-base leading-relaxed prose' : undefined
    const isUser = message.role === 'user'
    const { userName, userEmail, userAvatar } = useAuth()
    const effectiveUserName = userNameOverride ?? userName
    const effectiveUserEmail = userEmailOverride ?? userEmail
    const effectiveUserAvatar = userAvatarUrlOverride ?? userAvatar
    const fallbackVariant = userAvatarFallbackVariantOverride ?? 'initials'

    if (isUser) {
      // When the "user" is being overridden to represent an agent (e.g. Aria in landing demos),
      // prefer an explicitly-provided avatar URL (if any). Otherwise fall back to the seeded agent avatar.
      // Never fall back to the signed-in user's avatar when a seed override is present.
      const explicitUserAvatarUrl = userAvatarUrlOverride
      const shouldUseExplicitUserAvatar = isImageUrl(explicitUserAvatarUrl)
      const shouldUseAuthedUserAvatar = !userAvatarSeedOverride && isImageUrl(effectiveUserAvatar)

      if (isHero || isDelegation) {
        // User message: Neutral bubble on the right (landing demos)
        const userRowClass = isDelegation ? 'mb-4 mt-3 gap-2' : 'mb-4 mt-6 gap-3 mr-6'
        const userBubbleClass = isDelegation ? 'px-3 py-2' : 'px-4 py-3'
        const userTextClass = isHero ? 'text-base' : 'text-sm'
        return (
          <div className="flex justify-end">
            <div className={cn('flex w-full sm:w-auto items-end max-w-full sm:max-w-[70%]', userRowClass)}>
              <div className="flex flex-1 flex-col gap-2 items-end ph-mask-chat-message">
                <div
                  className={cn('w-full sm:w-auto bg-card text-card-foreground border border-border/60 shadow-sm rounded-2xl rounded-br-md relative', userBubbleClass, message.sending && 'opacity-70')}
                >
                  <div className={cn('leading-relaxed whitespace-pre-wrap', userTextClass)}>{renderTextWithHighlight(message.content, highlightTerm)}</div>
                  {message.sending && (
                    <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-card border-2 border-background rounded-full flex items-center justify-center">
                      <div className="w-2 h-2 bg-card-foreground rounded-full animate-pulse" />
                    </div>
                  )}
                </div>
              </div>
              <Avatar className={cn('flex-shrink-0 rounded-full ring-1 ring-border/40 bg-primary/10 mb-1 overflow-hidden', avatarClass)}>
                {shouldUseExplicitUserAvatar ? (
                  <AvatarImage
                    src={explicitUserAvatarUrl!}
                    alt={effectiveUserName || effectiveUserEmail || 'User avatar'}
                    referrerPolicy="no-referrer"
                    crossOrigin="anonymous"
                    className="rounded-full object-cover"
                  />
                ) : userAvatarSeedOverride ? (
                  <AgentAvatar seed={userAvatarSeedOverride} size={avatarSize} />
                ) : shouldUseAuthedUserAvatar ? (
                  <AvatarImage
                    src={effectiveUserAvatar!}
                    alt={effectiveUserName || effectiveUserEmail || 'User avatar'}
                    referrerPolicy="no-referrer"
                    crossOrigin="anonymous"
                    className="rounded-full object-cover"
                  />
                ) : null}
                <AvatarFallback className="rounded-full bg-primary/10 text-primary text-xs font-semibold">
                  {fallbackVariant === 'user-icon' ? (
                    <Icon name="user" iconOverride={{ type: 'phosphor', component: 'User' }} weight="bold" size={isHero ? 20 : 14} className="text-primary" />
                  ) : (
                    initialsFromName(effectiveUserName || effectiveUserEmail)
                  )}
                </AvatarFallback>
              </Avatar>
            </div>
          </div>
        )
      }

      // User message: Render using the same engine as assistant messages (no bubble) - app layout
      const userDisplayName = (effectiveUserName || effectiveUserEmail || 'You').trim()
      const userProfileHref = typeof starshipSlug === 'string' && starshipSlug.trim().length > 0 ? `/ship/${encodeURIComponent(starshipSlug)}/settings/my-profile` : '/profile'

      return (
        <div className="flex justify-start w-full">
          <div className="group mb-2 mt-4 flex flex-1 min-w-0 items-start gap-3 w-full max-w-full rounded-lg pl-2 pr-[52px] py-2 -mx-2">
            <Avatar className="flex-shrink-0 w-10 h-10 rounded-full ring-1 ring-border/40 bg-primary/10 mt-1 overflow-hidden">
              {shouldUseExplicitUserAvatar ? (
                <AvatarImage
                  src={explicitUserAvatarUrl!}
                  alt={effectiveUserName || effectiveUserEmail || 'User avatar'}
                  referrerPolicy="no-referrer"
                  crossOrigin="anonymous"
                  className="rounded-full object-cover"
                />
              ) : userAvatarSeedOverride ? (
                <AgentAvatar seed={userAvatarSeedOverride} size={40} rounded />
              ) : shouldUseAuthedUserAvatar ? (
                <AvatarImage
                  src={effectiveUserAvatar!}
                  alt={effectiveUserName || effectiveUserEmail || 'User avatar'}
                  referrerPolicy="no-referrer"
                  crossOrigin="anonymous"
                  className="rounded-full object-cover"
                />
              ) : null}
              <AvatarFallback className="rounded-full bg-primary/10 text-primary text-xs font-semibold">
                {fallbackVariant === 'user-icon' ? (
                  <Icon name="user" iconOverride={{ type: 'phosphor', component: 'User' }} weight="bold" size={isHero ? 20 : isDelegation ? 14 : 16} className="text-primary" />
                ) : (
                  initialsFromName(effectiveUserName || effectiveUserEmail)
                )}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1 w-full pt-0.5">
              <div className="mb-0 text-sm font-bold font-mono text-foreground">
                <Link href={userProfileHref} className="hover:underline underline-offset-2">
                  {userDisplayName}
                </Link>
              </div>
              <ConversationMessageContent
                content={message.content}
                messageId={message.id}
                enableMarkdown={true}
                enableCopy={true}
                enableLinkPreview={true}
                isStreaming={false}
                className="text-foreground/80"
                chunks={message.chunks}
                reasoning={message.reasoning}
                reasoningChunks={message.reasoningChunks}
                agentName={userDisplayName}
                toolCalls={message.toolCalls}
                toolResults={message.toolResults}
                messageType={message.messageType}
                attachmentIds={message.attachmentIds}
                starshipId={starshipId}
                isAwaitingToolResults={isAwaitingToolResults}
                isLastMessage={isLastMessage}
                highlightTerm={highlightTerm}
              />
            </div>
          </div>
        </div>
      )
    } else {
      // AI message
      const assistantDisplayName = (agentName || 'Assistant').trim()
      const assistantProfileHref =
        typeof starshipSlug === 'string' && starshipSlug.trim().length > 0 && typeof agentSlug === 'string' && agentSlug.trim().length > 0
          ? `/ship/${encodeURIComponent(starshipSlug)}/agent/${encodeURIComponent(agentSlug)}`
          : null

      if (isHero || isDelegation) {
        const assistantGap = isDelegation ? 'gap-2' : 'gap-3'
        return (
          <div className="flex justify-start">
            <div className={cn('flex items-start w-full', assistantGap)}>
              {showAssistantAvatar ? (
                <div className={cn('flex-shrink-0 rounded-full bg-muted flex items-center justify-center mt-1 overflow-hidden', avatarClass)}>
                  <AgentAvatar seed={agentName} imageUrl={agentAvatarUrl} size={avatarSize} />
                </div>
              ) : (
                <div className={cn('flex-shrink-0 mt-1', avatarClass)} aria-hidden="true" />
              )}
              <div className="flex-1 w-full pt-0.5">
                <ConversationMessageContent
                  content={message.content}
                  messageId={message.id}
                  enableMarkdown={true}
                  enableCopy={!isStreamingActive}
                  enableLinkPreview={true}
                  isStreaming={!!isStreamingActive}
                  className="text-foreground"
                  contentTextClass={contentTextClass}
                  chunks={message.chunks}
                  reasoning={message.reasoning}
                  reasoningChunks={message.reasoningChunks}
                  agentName={assistantDisplayName}
                  toolCalls={message.toolCalls}
                  toolResults={message.toolResults}
                  messageType={message.messageType}
                  attachmentIds={message.attachmentIds}
                  starshipId={starshipId}
                  isAwaitingToolResults={isAwaitingToolResults}
                  isLastMessage={isLastMessage}
                  highlightTerm={highlightTerm}
                />
              </div>
            </div>
          </div>
        )
      }

      return (
        <div className={cn('flex justify-start w-full', isFirstMessage ? 'mt-6' : '')}>
          <div
            className={cn(
              'group flex flex-1 min-w-0 items-start gap-3 w-full max-w-full rounded-lg pl-2 pr-[52px] -mx-2',
              // Remove the outside vertical gap between consecutive message rows.
              'py-0',
              !showAssistantAvatar && '-mt-1'
            )}
          >
            {showAssistantAvatar ? (
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-muted flex items-center justify-center mt-1 overflow-hidden">
                <AgentAvatar seed={agentName} imageUrl={agentAvatarUrl} size={40} rounded />
              </div>
            ) : (
              <div className="flex-shrink-0 w-10 h-10 mt-1" aria-hidden="true" />
            )}
            <div className="min-w-0 flex-1 w-full pt-0.5">
              {showAssistantAvatar && (
                <div className="mb-0 text-sm font-bold text-foreground">
                  {assistantProfileHref ? (
                    <Link href={assistantProfileHref} className="font-mono hover:underline underline-offset-2">
                      {assistantDisplayName}
                    </Link>
                  ) : (
                    <span className="font-mono">{assistantDisplayName}</span>
                  )}
                </div>
              )}
              <ConversationMessageContent
                content={message.content}
                messageId={message.id}
                enableMarkdown={true}
                enableCopy={!isStreamingActive}
                enableLinkPreview={true}
                isStreaming={!!isStreamingActive}
                className="text-foreground/80"
                chunks={message.chunks}
                reasoning={message.reasoning}
                reasoningChunks={message.reasoningChunks}
                agentName={assistantDisplayName}
                toolCalls={message.toolCalls}
                toolResults={message.toolResults}
                messageType={message.messageType}
                attachmentIds={message.attachmentIds}
                starshipId={starshipId}
                isAwaitingToolResults={isAwaitingToolResults}
                isLastMessage={isLastMessage}
                highlightTerm={highlightTerm}
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
    if ((prevProps.isFirstMessage ?? false) !== (nextProps.isFirstMessage ?? false)) return false

    // Re-render when agent label changes (post-reload agent restoration)
    if ((prevProps.agentName || '') !== (nextProps.agentName || '')) return false

    // Re-render if the agent avatar URL changes (e.g. after attachments load)
    if ((prevProps.agentAvatarUrl || '') !== (nextProps.agentAvatarUrl || '')) return false

    // Re-render when text (assistant content) changes
    if (prevProps.message.content !== nextProps.message.content) return false

    // Re-render when reasoning text changes (server may replace aggregated with finalized)
    const prevReasoning = (prevProps.message as ExtendedMessage).reasoning
    const nextReasoning = (nextProps.message as ExtendedMessage).reasoning
    if (prevReasoning !== nextReasoning) return false

    // Re-render when reasoningChunks count changes (reasoning-first streaming)
    const prevRChunks = (prevProps.message as ExtendedMessage).reasoningChunks?.length ?? 0
    const nextRChunks = (nextProps.message as ExtendedMessage).reasoningChunks?.length ?? 0
    if (prevRChunks !== nextRChunks) return false

    // Re-render when content chunks count changes
    const prevChunks = prevProps.message.chunks?.length ?? 0
    const nextChunks = nextProps.message.chunks?.length ?? 0
    if (prevChunks !== nextChunks) return false

    // Re-render when tool calls count changes
    const prevCalls = (prevProps.message as ExtendedMessage).toolCalls?.length ?? 0
    const nextCalls = (nextProps.message as ExtendedMessage).toolCalls?.length ?? 0
    if (prevCalls !== nextCalls) return false

    // Re-render when user overrides change (demo/internal chats)
    if ((prevProps.userNameOverride || '') !== (nextProps.userNameOverride || '')) return false
    if ((prevProps.userEmailOverride || '') !== (nextProps.userEmailOverride || '')) return false
    if ((prevProps.userAvatarUrlOverride || '') !== (nextProps.userAvatarUrlOverride || '')) return false
    if ((prevProps.userAvatarSeedOverride || '') !== (nextProps.userAvatarSeedOverride || '')) return false
    if ((prevProps.userAvatarFallbackVariantOverride || '') !== (nextProps.userAvatarFallbackVariantOverride || '')) return false
    if ((prevProps.sizeVariant ?? 'default') !== (nextProps.sizeVariant ?? 'default')) return false
    if ((prevProps.starshipSlug || '') !== (nextProps.starshipSlug || '')) return false
    if ((prevProps.agentSlug || '') !== (nextProps.agentSlug || '')) return false

    // CRITICAL: Re-render when grouped toolResults attach later
    const prevToolResults = (prevProps.message as ExtendedMessage).toolResults?.length ?? 0
    const nextToolResults = (nextProps.message as ExtendedMessage).toolResults?.length ?? 0
    if (prevToolResults !== nextToolResults) return false

    // Re-render when uiActions attach later (render_widget and other UI-driven messages)
    const prevUiActions = (prevProps.message as ExtendedMessage).uiActions?.length ?? 0
    const nextUiActions = (nextProps.message as ExtendedMessage).uiActions?.length ?? 0
    if (prevUiActions !== nextUiActions) return false

    // Re-render when in-chat search highlight term changes
    if ((prevProps.highlightTerm || '') !== (nextProps.highlightTerm || '')) return false

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
