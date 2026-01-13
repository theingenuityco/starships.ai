'use client'

import Icon from '@/components/primitives/Icon'
import AgentAvatar from '@/components/animated/AgentAvatar'

import type { MessageModel } from '@starships/protocol'

import LoadingSpinner from '@/components/primitives/LoadingSpinner'
import { useEffect, useMemo, useRef, memo, useState, Fragment } from 'react'
import { ConversationMessageContent } from './ConversationMessageContent'
import { useConversationAgents } from '@/hooks/useConversations'
import { useConversationStreamContextOptional } from '@/hooks/ConversationStreamContext'
import type { LlmToolCall } from '@starships/autopilot'
import { useMessageAttachments } from '@/hooks/useFileUpload'
import { MessageAttachment, MessageAttachmentSkeleton } from './MessageAttachment'
import { useAuth } from '@/hooks/useAuth'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { motion } from 'motion/react'
import { staggerContainer, staggerItem } from '@/lib/animations'
import { toast } from 'sonner'
import { tableToMarkdown } from '@/components/markdown/markdownComponents'
import { isAnimationComplete } from '@/hooks/useMessageAnimationState'
import { TypingDots } from '@/components/ui/TypingDots'

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
}: ConversationMessageListProps) {
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

  // Track which turns have been marked as complete (to prevent flickering)
  // Once a turn is complete, its buttons should always be shown
  const completedTurnIdsRef = useRef<Set<string>>(new Set())

  // Track which turns have already animated their buttons (to prevent re-animation)
  const animatedTurnIdsRef = useRef<Set<string>>(new Set())

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
      const shouldKeep = hasContent || hasChunks || hasRChunks || hasReasoning || hasToolCalls || hasAttachments
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
      return hasContent || hasChunks || hasRChunks || hasReasoning || hasToolCalls || hasToolResults || hasAttachments
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

  // Effect to mark turns as complete when they meet the criteria
  // This runs after renderMessages is computed to avoid using it before declaration
  useEffect(() => {
    renderMessages.forEach((message, idx) => {
      const next = idx < renderMessages.length - 1 ? (renderMessages[idx + 1] as ExtendedMessage) : null
      const messageId = message.id

      // Skip if already marked complete
      if (completedTurnIdsRef.current.has(messageId)) return

      // Only process assistant messages (not tool_result messages)
      if (message.role !== 'assistant' || message.messageType === 'tool_result') return

      // Check if this turn should be complete
      const extendedMsg = message as ExtendedMessage
      const isNotStreaming = !extendedMsg.streaming
      const isTurnBoundary = next?.role === 'user' || next === null
      const animationDone = isAnimationComplete(messageId)
      const hasChunks = Array.isArray(extendedMsg.chunks) && extendedMsg.chunks.length > 0

      // Check if all tool calls have completed
      const toolCalls = extendedMsg.toolCalls || []
      const toolResults = extendedMsg.toolResults || []
      const totalToolCalls = Array.isArray(toolCalls) ? toolCalls.length : 0
      const completedToolResults = Array.isArray(toolResults) ? toolResults.length : 0
      const allToolCallsDone = totalToolCalls === 0 || (totalToolCalls > 0 && completedToolResults >= totalToolCalls)

      // Don't mark as complete if we're still awaiting tool results (for the last message)
      const isLastMessage = idx === renderMessages.length - 1
      const shouldWaitForToolResults = isLastMessage && isAwaitingToolResults

      // Check if there are any more assistant messages in this turn after this one
      // Look ahead to find the next user message, and check if there are any assistant messages between now and then
      let hasMoreAssistantMessagesInTurn = false
      if (!isTurnBoundary) {
        // Look ahead through messages until we hit a user message or end
        for (let i = idx + 1; i < renderMessages.length; i++) {
          const futureMsg = renderMessages[i] as ExtendedMessage
          if (futureMsg.role === 'user') {
            // Found the next turn, stop looking
            break
          }
          if (futureMsg.role === 'assistant' && futureMsg.messageType !== 'tool_result') {
            // Found another assistant message in this turn
            hasMoreAssistantMessagesInTurn = true
            break
          }
        }
      }

      // A turn is complete if: assistant message (not tool_result), not streaming, at turn boundary,
      // (animation done OR never streamed), all tool calls are done, not awaiting tool results,
      // and there are no more assistant messages in this turn
      if (isNotStreaming && isTurnBoundary && (animationDone || !hasChunks) && allToolCallsDone && !shouldWaitForToolResults && !hasMoreAssistantMessagesInTurn) {
        completedTurnIdsRef.current.add(messageId)
      }
    })
  }, [renderMessages, isAwaitingToolResults])

  // Component to render action buttons after a complete turn
  function TurnActionButtons({ turnMessages, turnId }: { turnMessages: MessageModel[]; turnId: string }) {
    // Initialize state based on whether this turn has already been animated
    // Once a turn is marked as animated, it will never animate again (even on re-renders)
    const [shouldAnimateButtons] = useState<boolean>(() => {
      const alreadyAnimated = animatedTurnIdsRef.current.has(turnId)
      if (!alreadyAnimated) {
        // Mark as animated immediately to prevent re-animation on future renders
        animatedTurnIdsRef.current.add(turnId)
        return true
      }
      return false
    })

    const extractTurnText = (): string => {
      const parts: string[] = []
      for (const msg of turnMessages) {
        if (msg.role === 'user') {
          parts.push(`**User:**\n${msg.content || ''}`)
        } else if (msg.role === 'assistant') {
          const content = msg.content || ''
          const reasoning = (msg as ExtendedMessage).reasoning
          if (reasoning && typeof reasoning === 'string' && reasoning.trim()) {
            parts.push(`**Assistant (thinking):**\n${reasoning}`)
          }
          if (content.trim()) {
            parts.push(`**Assistant:**\n${content}`)
          }
        }
      }
      return parts.join('\n\n')
    }

    const handleCopyTurn = async () => {
      try {
        const turnText = extractTurnText()
        await navigator.clipboard.writeText(turnText)
        toast.success('Turn copied to clipboard')
      } catch (error) {
        toast.error('Failed to copy turn')
      }
    }

    const handleExportTurn = () => {
      try {
        const turnText = extractTurnText()
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5)
        const filename = `turn-${turnId.slice(0, 8)}-${timestamp}.md`

        const blob = new Blob([turnText], { type: 'text/markdown' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = filename
        document.body.appendChild(a)
        a.click()
        a.remove()
        URL.revokeObjectURL(url)

        toast.success('Turn exported successfully')
      } catch (error) {
        toast.error('Failed to export turn')
      }
    }

    return (
      <div className="flex justify-start">
        <div className="flex items-start gap-3 w-full">
          {/* Spacer to match avatar width */}
          <div className="flex-shrink-0 w-8 h-8" aria-hidden="true" />
          <motion.div key={`turn-buttons-${turnId}`} variants={staggerContainer} initial={shouldAnimateButtons ? 'hidden' : 'visible'} animate="visible" className="flex items-center gap-2 mt-4 mb-4">
            <motion.div variants={staggerItem}>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleCopyTurn} title="Copy turn">
                <Icon name="copy" className="w-3 h-3" />
              </Button>
            </motion.div>
            <motion.div variants={staggerItem}>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleExportTurn} title="Export turn">
                <Icon name="download" className="w-3 h-3" />
              </Button>
            </motion.div>
          </motion.div>
        </div>
      </div>
    )
  }

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
            const prev = idx > 0 ? (renderMessages[idx - 1] as ExtendedMessage) : null
            const next = idx < renderMessages.length - 1 ? (renderMessages[idx + 1] as ExtendedMessage) : null
            const showAssistantAvatar = message.role !== 'assistant' ? true : !(prev && prev.role === 'assistant')

            // Check if this is the end of a complete turn
            // Once a turn is marked as complete (via useEffect), always show its buttons (prevents flickering)
            const messageId = message.id
            const isTurnEnd = completedTurnIdsRef.current.has(messageId)

            // Find the start of this turn (the user message before this assistant message)
            // Use a reverse loop since findLastIndex is not available in older TypeScript targets
            const turnStartIdx =
              message.role === 'assistant'
                ? (() => {
                    const slice = renderMessages.slice(0, idx + 1)
                    for (let i = slice.length - 1; i >= 0; i--) {
                      if (slice[i].role === 'user') return i
                    }
                    return -1
                  })()
                : -1

            const turnMessages = turnStartIdx >= 0 ? renderMessages.slice(turnStartIdx, idx + 1) : []

            return (
              <Fragment key={message.id}>
                <MemoizedMessageBubble
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
                  userAvatarFallbackVariantOverride={userAvatarFallbackVariantOverride}
                  isAwaitingToolResults={isAwaitingToolResults}
                  isLastMessage={idx === renderMessages.length - 1}
                />
                {/* Only show buttons after the final assistant message of a complete turn (not tool_result messages or intermediate messages) */}
                {/* Must be: marked as turn end, assistant message, not tool_result, at turn boundary (next is user or null), and have turn messages */}
                {isTurnEnd && message.role === 'assistant' && message.messageType !== 'tool_result' && (next?.role === 'user' || next === null) && turnMessages.length > 0 && (
                  <TurnActionButtons turnMessages={turnMessages} turnId={message.id} />
                )}
              </Fragment>
            )
          })}
          {/* Gap loader: show while awaiting first assistant text OR between tool results and next assistant text */}
          {shouldShowGapLoader && (
            <div className="flex justify-start">
              <div className="flex items-start gap-3 w-full">
                {/* No avatar for typing indicator; keep spacer for alignment */}
                <div className="flex-shrink-0 w-8 h-8 mt-1" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-sm leading-relaxed text-muted-foreground">
                    <TypingDots />
                    <span className="text-sm leading-relaxed">Typing...</span>
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
  userAvatarFallbackVariantOverride?: 'initials' | 'user-icon'
  isAwaitingToolResults?: boolean
  isLastMessage?: boolean
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
    userAvatarFallbackVariantOverride,
    isAwaitingToolResults = false,
    isLastMessage = false,
  }: ConversationMessageBubbleProps) {
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

      // User message: Neutral bubble on the right
      return (
        <div className="flex justify-end">
          <div className="mb-4 mt-6 flex w-full sm:w-auto items-end gap-3 max-w-full sm:max-w-[70%]">
            <div className="flex flex-1 flex-col gap-2 items-end">
              {/* Attachments outside bubble */}
              {message.attachmentIds && message.attachmentIds.length > 0 && starshipId && <UserMessageAttachments attachmentIds={message.attachmentIds} starshipId={starshipId} />}
              {/* Message bubble (match navigation/sidebar background color) */}
              <div className={`w-full sm:w-auto bg-card text-card-foreground border border-border/60 shadow-sm rounded-2xl rounded-br-md px-4 py-3 relative ${message.sending ? 'opacity-70' : ''}`}>
                <div className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</div>
                {message.sending && (
                  <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-card border-2 border-background rounded-full flex items-center justify-center">
                    <div className="w-2 h-2 bg-card-foreground rounded-full animate-pulse" />
                  </div>
                )}
              </div>
            </div>
            <Avatar className="flex-shrink-0 w-8 h-8 rounded-full ring-1 ring-border/40 bg-primary/10 mb-1 overflow-hidden">
              {shouldUseExplicitUserAvatar ? (
                <AvatarImage
                  src={explicitUserAvatarUrl!}
                  alt={effectiveUserName || effectiveUserEmail || 'User avatar'}
                  referrerPolicy="no-referrer"
                  crossOrigin="anonymous"
                  className="rounded-full object-cover"
                />
              ) : userAvatarSeedOverride ? (
                <AgentAvatar seed={userAvatarSeedOverride} size={32} />
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
                  <Icon name="user" iconOverride={{ type: 'phosphor', component: 'User' }} weight="bold" size={16} className="text-primary" />
                ) : (
                  initialsFromName(effectiveUserName || effectiveUserEmail)
                )}
              </AvatarFallback>
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
                isAwaitingToolResults={isAwaitingToolResults}
                isLastMessage={isLastMessage}
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

    // CRITICAL: Re-render when grouped toolResults attach later
    const prevToolResults = (prevProps.message as ExtendedMessage).toolResults?.length ?? 0
    const nextToolResults = (nextProps.message as ExtendedMessage).toolResults?.length ?? 0
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
