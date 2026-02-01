'use client'

import Icon from '@/components/primitives/Icon'
import AgentAvatar from '@/components/animated/AgentAvatar'

import type { MessageModel } from '@starships/protocol'

import LoadingSpinner from '@/components/primitives/LoadingSpinner'
import { useEffect, useLayoutEffect, useMemo, useRef, memo, useState, Fragment, useCallback, type ReactNode } from 'react'
import { ConversationMessageContent } from './ConversationMessageContent'
import { useConversationAgents, useConversationDetail } from '@/hooks/useConversations'
import { useConversationStreamContextOptional } from '@/hooks/ConversationStreamContext'
import type { LlmToolCall } from '@starships/autopilot'
import { useMessageAttachments } from '@/hooks/useFileUpload'
import { useAuth } from '@/hooks/useAuth'
import { buildPlainTextSnippet, stripMarkdownToPlainText } from '@/components/conversation/conversationSearch'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import { isImageUrl } from '@/lib/isImageUrl'
import { formatAgentDisplayName } from '@/lib/agentDisplay'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { TypingDots } from '@/components/ui/TypingDots'
import api from '@/lib/api'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { InlineWidgetRenderer } from '@/components/widgets/InlineWidgetRenderer'

function LinkedConversationCard({
  linkedConversationId,
  linkedConversationHref,
  enableChannelMessageThreads,
  onThreadAction,
  message,
  starshipId,
}: {
  linkedConversationId: string | null
  linkedConversationHref: string | null
  enableChannelMessageThreads: boolean
  onThreadAction?: (args: { messageId: string; linkedConversationId: string | null; messageText?: string; linkedMessage?: MessageModel | null }) => void
  message: MessageModel
  starshipId?: string
}) {
  const { data: conversation } = useConversationDetail(linkedConversationId)
  const { data: agents = [] } = useConversationAgents(linkedConversationId)
  const agentList = useMemo(() => (Array.isArray(agents) ? agents : []) as any[], [agents])

  const rawTitle = String((conversation as any)?.title ?? '').trim()
  const title = rawTitle || (linkedConversationId ? `Conversation ${linkedConversationId.slice(0, 8)}` : 'Conversation')

  const agentNames = agentList.map(a => String(a?.name || a?.slug || '').trim()).filter(Boolean)

  const avatarAttachmentIds = useMemo(() => {
    const ids = agentList.map(a => (typeof a?.avatarAttachmentId === 'string' ? String(a.avatarAttachmentId).trim() : '')).filter(Boolean)
    return Array.from(new Set(ids))
  }, [agentList])
  const { data: avatarAttachments = [] } = useMessageAttachments(avatarAttachmentIds, starshipId)
  const avatarUrlById = useMemo(() => new Map((avatarAttachments || []).map(a => [a.id, a.previewUrl] as const)), [avatarAttachments])

  // Include human participants by sampling recent message authors.
  // The conversation detail endpoint does not currently include members/users.
  const { data: participantsPreview } = useQuery({
    queryKey: ['conversations', 'participants-preview', linkedConversationId],
    enabled: Boolean(linkedConversationId),
    queryFn: async () => {
      if (!linkedConversationId) return null
      const resp = await api.get(`/api/v1/conversations/${encodeURIComponent(linkedConversationId)}/messages`, { params: { limit: 50 } })
      return (resp as any)?.data?.data ?? null
    },
    staleTime: 60_000,
  })

  type ParticipantItem = { kind: 'human'; key: string; label: string; avatarUrl?: string } | { kind: 'agent'; key: string; label: string; seed: string; avatarAttachmentId?: string }

  const participantItems = useMemo<ParticipantItem[]>(() => {
    const items: ParticipantItem[] = []
    const seen = new Set<string>()

    // Humans: derive from recent messages' user identity fields.
    const msgs = Array.isArray((participantsPreview as any)?.messages) ? (((participantsPreview as any).messages as any[]) ?? []) : []
    for (const m of msgs) {
      const role = String(m?.role ?? '')
      if (role !== 'user') continue
      const userId = typeof m?.userId === 'string' ? String(m.userId).trim() : ''
      const userName = typeof m?.userName === 'string' ? String(m.userName).trim() : ''
      const userAvatar = typeof m?.userAvatar === 'string' ? String(m.userAvatar).trim() : ''

      const label = userName || (userId ? `User ${userId.slice(0, 6)}` : 'User')
      const key = userId ? `human:${userId}` : userName ? `human:name:${userName}` : `human:unknown:${label}`
      if (seen.has(key)) continue
      seen.add(key)
      items.push({ kind: 'human', key, label, ...(userAvatar ? { avatarUrl: userAvatar } : null) })
    }

    // Agents: from the agents list.
    for (let idx = 0; idx < agentList.length; idx++) {
      const a = agentList[idx]
      const id = typeof a?.id === 'string' ? String(a.id).trim() : ''
      const label = String(a?.name || a?.slug || id || `Agent ${idx + 1}`).trim() || `Agent ${idx + 1}`
      const key = `agent:${id || label}`
      if (seen.has(key)) continue
      seen.add(key)
      const seed = String(a?.name || a?.slug || id || `agent-${idx}`).trim() || `agent-${idx}`
      const aid = typeof a?.avatarAttachmentId === 'string' ? String(a.avatarAttachmentId).trim() : ''
      items.push({ kind: 'agent', key, label, seed, ...(aid ? { avatarAttachmentId: aid } : null) })
    }

    return items
  }, [agentList, participantsPreview])

  const participantsLabel = useMemo(() => {
    const labels = participantItems.map(p => p.label).filter(Boolean)
    if (labels.length === 0) return 'No participants'
    if (labels.length <= 3) return labels.join(', ')
    return `${labels.slice(0, 3).join(', ')} +${labels.length - 3}`
  }, [participantItems])

  // IMPORTANT: Don't early-return before hooks, or we can change hook ordering
  // between renders when `linkedConversationId` flips from null -> string.
  if (!linkedConversationId) return null

  const cardInner = (
    <div className="w-full rounded-xl border border-border/60 bg-card/60 hover:bg-card transition-colors px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <Icon name="thread" className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <p className="text-sm font-medium text-foreground truncate">{title}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Participants (overlapping avatars) */}
          {participantItems.length > 0 && (
            <div className="flex items-center -space-x-2" title={participantsLabel} aria-label={`Participants: ${participantsLabel}`}>
              {participantItems.slice(0, 4).map(p => {
                if (p.kind === 'agent') {
                  const imageUrl = p.avatarAttachmentId ? avatarUrlById.get(p.avatarAttachmentId) : undefined
                  return (
                    <div key={p.key} className="h-7 w-7 rounded-full ring-2 ring-background bg-muted overflow-hidden">
                      <AgentAvatar seed={p.seed} imageUrl={imageUrl} size={28} rounded />
                    </div>
                  )
                }
                return (
                  <Avatar key={p.key} className="h-7 w-7 rounded-full ring-2 ring-background bg-muted overflow-hidden">
                    {p.avatarUrl ? <AvatarImage src={p.avatarUrl} alt={p.label} referrerPolicy="no-referrer" crossOrigin="anonymous" className="object-cover" /> : null}
                    <AvatarFallback className="rounded-full bg-muted text-muted-foreground text-[10px] font-semibold">{initialsFromName(p.label)}</AvatarFallback>
                  </Avatar>
                )
              })}
              {participantItems.length > 4 && (
                <div className="h-7 w-7 rounded-full ring-2 ring-background bg-muted text-xs font-semibold text-muted-foreground flex items-center justify-center">+{participantItems.length - 4}</div>
              )}
            </div>
          )}
          <Icon name="chevron-right" className="h-4 w-4 text-muted-foreground/80 opacity-100 group-hover:opacity-100 transition-opacity flex-shrink-0" />
        </div>
      </div>
    </div>
  )

  // In channel mode, open the thread pane (no navigation).
  if (enableChannelMessageThreads) {
    return (
      <div className="mt-2 mb-2 w-full -mx-2">
        <button
          type="button"
          className="group text-left w-full"
          onClick={e => {
            e.preventDefault()
            e.stopPropagation()
            onThreadAction?.({ messageId: message.id, linkedConversationId, messageText: message.content, linkedMessage: message })
          }}
        >
          {cardInner}
        </button>
      </div>
    )
  }

  // Non-channel mode: link to the child conversation route.
  if (!linkedConversationHref) return null
  return (
    <div className="mt-2 mb-2 w-full -mx-2">
      <Link href={linkedConversationHref} className="block group w-full">
        {cardInner}
      </Link>
    </div>
  )
}

interface ConversationMessageListProps {
  conversationId: string | null
  starshipId?: string
  /** Optional channel name when the conversation is a channel (used for empty-state hero). */
  channelName?: string | null
  bottomPaddingPx?: number
  className?: string
  scrollClassName?: string
  /**
   * Controls the maximum width of the inner message column.
   * - 'constrained' (default): center a readable column (max-w-4xl)
   * - 'full': allow messages to expand to the full available width
   */
  contentWidth?: 'constrained' | 'full'
  /** When true, show a per-message action to start/open a thread (child conversation). */
  enableChannelMessageThreads?: boolean
  /**
   * When provided, thread navigation will open inside the current page (e.g. right-side pane)
   * instead of changing the route.
   */
  onOpenThread?: (args: { conversationId: string | null; linkedMessage?: MessageModel | null; parentConversationId?: string | null }) => void
  /**
   * Optional pinned message rendered as the first message in the list (e.g. "linked message" when opening a thread from a channel).
   * If its id matches an existing message in the list, the existing one is deduped.
   */
  pinnedFirstMessage?: MessageModel | null
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
  channelName,
  bottomPaddingPx,
  className,
  scrollClassName,
  contentWidth = 'constrained',
  enableChannelMessageThreads = false,
  onOpenThread,
  pinnedFirstMessage,
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
  const canLoadOlder = !messagesOverride && Boolean(stream?.hasMoreBefore) && Boolean(stream?.oldestCursor) && typeof stream?.loadOlder === 'function'
  const isLoadingOlder = Boolean(stream?.isLoadingOlder)

  const { data: conversationDetail } = useConversationDetail(conversationId)

  // Fallback to server-sourced conversation agents for reloads where the UI store lacks agentName
  const { data: conversationAgents = [] } = useConversationAgents(conversationId)
  const agentObj = Array.isArray(conversationAgents) && conversationAgents.length > 0 ? conversationAgents[0] : undefined
  const agentName = agentNameOverride ?? agentObj?.name
  // #region agent log
  useEffect(() => {
    const cid = typeof conversationId === 'string' ? String(conversationId) : ''
    if (!cid) return
    const a: any = agentObj as any
    const display = a ? formatAgentDisplayName(a) : null
    const role = typeof a?.role === 'string' ? String(a.role) : null
    fetch('http://127.0.0.1:7242/ingest/f94efb64-8fc4-4319-97c1-245fc1440b35', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'debug-session',
        runId: 'run2',
        hypothesisId: 'H8',
        location: 'packages/client/src/components/conversation/ConversationMessageList.tsx:agentLabel',
        message: 'ConversationMessageList agent label inputs',
        data: {
          conversationId: cid,
          agentObjId: typeof a?.id === 'string' ? String(a.id) : null,
          agentObjName: typeof a?.name === 'string' ? String(a.name) : null,
          agentObjRole: role,
          agentNameProp: typeof agentName === 'string' ? agentName : agentName == null ? null : String(agentName),
          formattedFromAgentObj: display,
          conversationAgentsCount: Array.isArray(conversationAgents) ? conversationAgents.length : null,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {})
  }, [conversationId, agentObj, agentName, conversationAgents])
  // #endregion
  const agentSlug = useMemo(() => {
    const raw = (agentObj as any)?.slug
    return typeof raw === 'string' && raw.trim().length > 0 ? raw.trim() : undefined
  }, [agentObj])
  const agentAvatarAttachmentId = agentObj?.avatarAttachmentId as string | undefined
  const avatarIds = useMemo(() => (agentAvatarAttachmentId ? [agentAvatarAttachmentId] : []), [agentAvatarAttachmentId])
  const { data: agentAvatarAttachments = [] } = useMessageAttachments(avatarIds, starshipId)
  const agentAvatarUrl = agentAvatarUrlOverride ?? agentAvatarAttachments?.[0]?.previewUrl

  const handleThreadAction = useCallback(
    async (args: { messageId: string; linkedConversationId: string | null; messageText?: string; linkedMessage?: MessageModel | null }) => {
      const sid = typeof starshipId === 'string' ? starshipId : ''
      const parentConversationId = typeof conversationId === 'string' ? conversationId : ''
      if (!enableChannelMessageThreads) return
      if (!sid || !parentConversationId) return

      const existing = typeof args.linkedConversationId === 'string' ? args.linkedConversationId.trim() : ''
      if (existing) {
        onOpenThread?.({ conversationId: existing, linkedMessage: args.linkedMessage ?? null, parentConversationId })
        return
      }

      // Draft thread: open the pane without persisting anything yet.
      // We only create/link the child conversation when the user sends the first message in the thread.
      onOpenThread?.({ conversationId: null, linkedMessage: args.linkedMessage ?? null, parentConversationId })
    },
    [conversationId, enableChannelMessageThreads, onOpenThread, starshipId]
  )

  // Scroll container reference
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const lastMessageCountRef = useRef(0)
  const messageRefs = useRef<Record<string, HTMLDivElement | null>>({})
  // Per-conversation “snap-to-bottom once content exists” state (prevents initial top->bottom jump).
  const bottomSnapStateRef = useRef<{ key: string; didSnapOnceContentExists: boolean } | null>(null)

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
    const isHiddenThreadContextSeed = (m: any): boolean => {
      if (!m) return false
      // Hide only our special "seed" system messages; keep other system messages visible.
      const role = String(m?.role ?? '')
      if (role !== 'system') return false
      const mt = String(m?.messageType ?? '')
      const content = String(m?.content ?? '')
      const meta = m?.metadata
      const flagged = Boolean(meta && typeof meta === 'object' && (meta as any).thread_context_seed === true)
      return (mt === 'system_instruction' && flagged) || content.startsWith('[THREAD_CONTEXT_SEED]')
    }

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
    const sortedMessages = [...messages]
      .filter(m => !isHiddenThreadContextSeed(m as any))
      .sort((a, b) => {
        const ka = sortKey(a as any)
        const kb = sortKey(b as any)
        if (ka !== kb) return ka - kb
        // Tie-breaker: createdAt then id for deterministic order
        const ta = toTime((a as any)?.createdAt)
        const tb = toTime((b as any)?.createdAt)
        if (ta !== tb) return ta - tb
        return String((a as any)?.id ?? '').localeCompare(String((b as any)?.id ?? ''))
      })

    // Deduplicate by message id to avoid duplicates during baseline replays or optimistic/SSE overlaps.
    //
    // IMPORTANT:
    // We intentionally dedupe by message id ONLY (not id+toolCallIds). Treating toolCallIds as part
    // of the identity can accidentally render multiple copies of the *same* assistant message while
    // its toolCalls are being incrementally updated (e.g. ids/arguments arriving later), which looks
    // like a "pending tool call" repeating forever.
    const mergeToolCalls = (a?: LlmToolCall[], b?: LlmToolCall[]): LlmToolCall[] | undefined => {
      const aa = Array.isArray(a) ? a : []
      const bb = Array.isArray(b) ? b : []
      if (aa.length === 0 && bb.length === 0) return undefined
      const map = new Map<string, LlmToolCall>()
      const keyOf = (tc: any, idx: number): string => {
        const id = tc?.id ?? tc?.call_id ?? tc?.toolCallId
        if (id != null && String(id).trim().length > 0) return `id:${String(id)}`
        const name = tc?.function?.name
        if (typeof name === 'string' && name.trim().length > 0) return `name:${name.trim()}`
        return `idx:${idx}`
      }
      // Prefer the later update (b) when keys overlap.
      aa.forEach((tc, idx) => map.set(keyOf(tc as any, idx), tc))
      bb.forEach((tc, idx) => map.set(keyOf(tc as any, idx), tc))
      return Array.from(map.values())
    }

    const mergeToolResults = (a?: any[], b?: any[]): any[] | undefined => {
      const aa = Array.isArray(a) ? a : []
      const bb = Array.isArray(b) ? b : []
      if (aa.length === 0 && bb.length === 0) return undefined
      const map = new Map<string, any>()
      const keyOf = (tr: any, idx: number): string => {
        const id = tr?.id ?? tr?.toolCallId ?? tr?.call_id
        if (id != null && String(id).trim().length > 0) return `id:${String(id)}`
        return `idx:${idx}`
      }
      aa.forEach((tr, idx) => map.set(keyOf(tr, idx), tr))
      bb.forEach((tr, idx) => map.set(keyOf(tr, idx), tr))
      return Array.from(map.values())
    }

    const mergeUiActions = (a?: any[], b?: any[]): any[] | undefined => {
      const aa = Array.isArray(a) ? a : []
      const bb = Array.isArray(b) ? b : []
      if (aa.length === 0 && bb.length === 0) return undefined
      const map = new Map<string, any>()
      const keyOf = (ua: any, idx: number): string => {
        const action = typeof ua?.action === 'string' ? ua.action : ''
        const widgetId = ua?.payload?.widget?.id ?? ua?.payload?.toolCallId ?? ''
        if (action && widgetId) return `${action}:${String(widgetId)}`
        // Fallback: stringify a small stable prefix
        try {
          return `${action}:${JSON.stringify(ua).slice(0, 128)}`
        } catch {
          return `idx:${idx}`
        }
      }
      aa.forEach((ua, idx) => map.set(keyOf(ua, idx), ua))
      bb.forEach((ua, idx) => map.set(keyOf(ua, idx), ua))
      return Array.from(map.values())
    }

    const mergeMessage = (prev: ExtendedMessage, next: ExtendedMessage): ExtendedMessage => {
      const mergedToolCalls = mergeToolCalls(prev.toolCalls, next.toolCalls)
      const mergedToolResults = mergeToolResults((prev as any).toolResults, (next as any).toolResults)
      const mergedUiActions = mergeUiActions((prev as any).uiActions, (next as any).uiActions)

      const pickLonger = <T,>(pa?: T[], pb?: T[]): T[] | undefined => {
        const aLen = Array.isArray(pa) ? pa.length : 0
        const bLen = Array.isArray(pb) ? pb.length : 0
        if (aLen === 0 && bLen === 0) return undefined
        return bLen >= aLen ? (pb as T[]) : (pa as T[])
      }

      const merged: ExtendedMessage = {
        ...prev,
        ...next,
        // Preserve "true" streaming/sending flags if either version had them.
        streaming: Boolean((prev as any).streaming || (next as any).streaming),
        sending: Boolean((prev as any).sending || (next as any).sending),
        toolCalls: mergedToolCalls,
        ...(mergedToolResults ? { toolResults: mergedToolResults } : null),
        ...(mergedUiActions ? { uiActions: mergedUiActions } : null),
        chunks: pickLonger((prev as any).chunks, (next as any).chunks),
        reasoningChunks: pickLonger((prev as any).reasoningChunks, (next as any).reasoningChunks),
      }

      // Prefer non-empty content/reasoning if the newer version is empty.
      try {
        const prevContent = typeof prev.content === 'string' ? prev.content : ''
        const nextContent = typeof next.content === 'string' ? next.content : ''
        if (prevContent.trim().length > 0 && nextContent.trim().length === 0) merged.content = prevContent
      } catch {}
      try {
        const prevReason = typeof (prev as any).reasoning === 'string' ? String((prev as any).reasoning) : ''
        const nextReason = typeof (next as any).reasoning === 'string' ? String((next as any).reasoning) : ''
        if (prevReason.trim().length > 0 && nextReason.trim().length === 0) (merged as any).reasoning = prevReason
      } catch {}

      return merged
    }

    const uniqueById = new Map<string, ExtendedMessage>()
    for (const m of sortedMessages) {
      const id = m?.id != null ? String(m.id) : ''
      // Messages should always have an id, but be defensive.
      const key = id && id.trim().length > 0 ? id : `__noid__:${uniqueById.size}`
      const prev = uniqueById.get(key)
      const next = m as ExtendedMessage
      if (!prev) {
        uniqueById.set(key, next)
        continue
      }
      // Merge and re-insert to ensure we keep the most up-to-date copy.
      const merged = mergeMessage(prev, next)
      uniqueById.delete(key)
      uniqueById.set(key, merged)
    }

    const uniqueMessages: Array<MessageModel & { streaming?: boolean; chunks?: StreamChunk[]; sending?: boolean }> = Array.from(uniqueById.values())

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
    const pinned = pinnedFirstMessage as ExtendedMessage | null | undefined
    if (!pinned) return filtered
    const pinnedId = typeof (pinned as any)?.id === 'string' ? String((pinned as any).id).trim() : ''
    if (!pinnedId) return filtered
    const withoutPinned = filtered.filter(m => m.id !== pinnedId)
    return [pinned, ...withoutPinned]
  }, [displayMessages, pinnedFirstMessage])

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

  // Bottom anchoring (layout phase): when messages/gap-loader first appear for a conversation,
  // snap to the bottom BEFORE paint so there’s no visible scroll “jump”.
  useLayoutEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return

    const pinnedId = typeof (pinnedFirstMessage as any)?.id === 'string' ? String((pinnedFirstMessage as any).id) : ''
    const snapKey = `${String(conversationId ?? 'none')}|${pinnedId}`

    if (!bottomSnapStateRef.current || bottomSnapStateRef.current.key !== snapKey) {
      bottomSnapStateRef.current = { key: snapKey, didSnapOnceContentExists: false }
      // Treat this as a fresh timeline for scroll-behavior decisions.
      lastMessageCountRef.current = 0
    }

    const hasContent = renderMessages.length > 0 || shouldShowGapLoader || Boolean(pinnedFirstMessage)
    if (!bottomSnapStateRef.current.didSnapOnceContentExists && hasContent) {
      // IMPORTANT:
      // Tailwind `scroll-smooth` (scroll-behavior: smooth) can cause even scrollTop assignment to animate.
      // Temporarily disable smooth behavior so the initial anchor is instantaneous.
      const prevInlineScrollBehavior = container.style.scrollBehavior
      container.style.scrollBehavior = 'auto'
      container.scrollTop = container.scrollHeight
      // Restore any inline style after we've applied the snap.
      container.style.scrollBehavior = prevInlineScrollBehavior
      isNearBottomRef.current = true
      bottomSnapStateRef.current.didSnapOnceContentExists = true
    }
  }, [conversationId, pinnedFirstMessage, renderMessages.length, shouldShowGapLoader, displayMessages.length])

  // Optimized auto-scroll with debouncing (now supports streaming progress).
  useEffect(() => {
    if (!scrollContainerRef.current) return

    const container = scrollContainerRef.current
    const isActivelyStreaming = isAssistantStreaming || !!activeRenderedStreamingAssistantId || shouldShowGapLoader
    const shouldStickToBottom = isNearBottomRef.current

    // Only scroll if user is near bottom (as last reported by onScroll) or new messages arrived.
    // NOTE: during streaming, content grows without a scroll event; keeping a ref avoids losing the lock.
    //
    if (shouldStickToBottom) {
      const messagesIncreased = displayMessages.length > lastMessageCountRef.current
      const requestedBehavior: ScrollBehavior = messagesIncreased ? 'auto' : isActivelyStreaming ? 'auto' : 'smooth'

      // Use requestAnimationFrame for smooth scrolling
      requestAnimationFrame(() => {
        if (!scrollContainerRef.current) return
        scrollContainerRef.current.scrollTo({
          top: scrollContainerRef.current.scrollHeight,
          // Prefer immediate scroll during streaming to avoid "lagging behind" effect.
          behavior: requestedBehavior,
        })
      })
    }

    lastMessageCountRef.current = displayMessages.length
  }, [activeRenderedStreamingAssistantId, displayMessages.length, isAssistantStreaming, lastRenderedProgressKey, shouldShowGapLoader])

  // Ensure the GAP loader remains visible by auto-scrolling when we are waiting for assistant text
  // either initially or while waiting after tool results.
  useEffect(() => {
    if (!scrollContainerRef.current) return
    if (shouldShowGapLoader && isNearBottomRef.current) {
      requestAnimationFrame(() => {
        if (!scrollContainerRef.current) return
        // Keep it unanimated to avoid visible “scrolling” on load.
        scrollContainerRef.current.scrollTo({ top: scrollContainerRef.current.scrollHeight, behavior: 'auto' })
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

  if (!conversationId && !messagesOverride && !pinnedFirstMessage) {
    return <EmptyState />
  }

  const showChannelHero = Boolean(enableChannelMessageThreads && !pinnedFirstMessage)
  const shouldBottomAlignChannelHero = Boolean(showChannelHero && renderMessages.length === 0 && !shouldShowGapLoader)

  const hasSearchMatches = matchingPositions.length > 0
  // Search input UI intentionally disabled for now.
  const showSearchBar = false
  const currentMatchMessageId = hasSearchMatches ? matchingPositions[currentMatchIndex]?.messageId : null

  return (
    <div className={cn('h-full min-h-0 flex flex-col', className)}>
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
        className={cn(
          // Do NOT use `scroll-smooth` here; it causes the initial bottom anchor to animate (looks like top->bottom jump).
          'flex-1 min-h-0 overflow-y-auto px-4',
          sizeVariant === 'delegation' ? 'pt-3' : 'pt-6',
          scrollClassName
        )}
        // When the channel is empty, we want the hero to "sit" near the bottom like Slack.
        // The normal bottom padding is intentionally large (to avoid message overlap with the composer),
        // but that padding makes an empty-state hero float too high.
        style={{ paddingBottom: shouldBottomAlignChannelHero ? 32 : (bottomPaddingPx ?? 160) }}
        onScroll={() => {
          const container = scrollContainerRef.current
          if (!container) return
          isNearBottomRef.current = container.scrollTop + container.clientHeight >= container.scrollHeight - SCROLL_THRESHOLD_PX
        }}
      >
        <div
          className={cn(
            'w-full bg-transparent',
            contentWidth === 'constrained' ? 'max-w-4xl mx-auto' : 'max-w-none',
            // Allows the timeline to sit at the bottom when short.
            'min-h-full flex flex-col'
          )}
        >
          {canLoadOlder && (
            <div className="flex justify-center pb-4">
              <button
                type="button"
                className={cn('text-xs px-3 py-1.5 rounded-md border bg-background hover:bg-muted transition-colors', isLoadingOlder ? 'opacity-60 pointer-events-none' : '')}
                onClick={() => (stream as any)?.loadOlder?.({ limit: 100 })}
              >
                {isLoadingOlder ? 'Loading…' : 'Load older messages'}
              </button>
            </div>
          )}

          <div className="mt-auto">
            {showChannelHero ? (
              <ChannelHero
                channelName={channelName}
                conversationTitle={typeof (conversationDetail as any)?.title === 'string' ? String((conversationDetail as any).title) : null}
                bottomAlign={shouldBottomAlignChannelHero}
              />
            ) : null}
            {renderMessages.map((message, idx) => {
              const prev = idx > 0 ? (renderMessages[idx - 1] as ExtendedMessage) : null
              const showAssistantAvatar = message.role !== 'assistant' ? true : !(prev && prev.role === 'assistant')
              const pinnedId = typeof (pinnedFirstMessage as any)?.id === 'string' ? String((pinnedFirstMessage as any).id).trim() : ''
              const suppressLinkedConversationCard = Boolean(pinnedId && String(message.id) === pinnedId)
              const userKey = (m: any): string | null => {
                if (!m || String(m?.role ?? '') !== 'user') return null
                const uid = typeof m?.userId === 'string' ? m.userId.trim() : ''
                if (uid) return `id:${uid}`
                const un = typeof m?.userName === 'string' ? m.userName.trim() : ''
                if (un) return `name:${un}`
                const ua = typeof m?.userAvatar === 'string' ? m.userAvatar.trim() : ''
                if (ua) return `avatar:${ua}`
                // Backward-compat: treat unknown human author as the same person.
                return 'unknown'
              }
              const prevUserKey = prev ? userKey(prev) : null
              const currUserKey = userKey(message)
              const isConsecutiveUser = Boolean(currUserKey && prevUserKey && currUserKey === prevUserKey)
              const startsNewGroup = (() => {
                if (!prev) return false
                if (message.role === 'assistant') return Boolean(showAssistantAvatar)
                if (message.role === 'user') return !isConsecutiveUser
                return prev.role !== message.role
              })()
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
                      enableChannelMessageThreads={enableChannelMessageThreads}
                      onThreadAction={handleThreadAction}
                      showAssistantAvatar={showAssistantAvatar}
                      isConsecutiveUser={isConsecutiveUser}
                      startsNewGroup={startsNewGroup}
                      isFirstMessage={isFirstMessage && message.role === 'assistant' && message.messageType !== 'tool_result'}
                      suppressLinkedConversationCard={suppressLinkedConversationCard}
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
                          <div className="flex items-start gap-3 w-full max-w-full pr-[var(--conversation-right-gutter)]">
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
                  <div className="group flex items-start gap-3 w-full max-w-full pr-[var(--conversation-right-gutter)] rounded-lg px-2 py-2 -mx-2 hover:bg-black/5 dark:hover:bg-white/10 transition-colors">
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
  enableChannelMessageThreads?: boolean
  onThreadAction?: (args: { messageId: string; linkedConversationId: string | null; messageText?: string; linkedMessage?: MessageModel | null }) => void
  showAssistantAvatar?: boolean
  /** True when the previous rendered message row was also a user message. */
  isConsecutiveUser?: boolean
  /** True when this row begins a new visual author/role group (so it should get the standard top gap). */
  startsNewGroup?: boolean
  /**
   * If true, apply the same top spacing a first user message gets (mt-6)
   * so assistant-first conversations don't look "pinned" to the top.
   */
  isFirstMessage?: boolean
  /** When true, do not show the linked-thread preview card under this message row. */
  suppressLinkedConversationCard?: boolean
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
    enableChannelMessageThreads = false,
    onThreadAction,
    showAssistantAvatar = true,
    isConsecutiveUser = false,
    startsNewGroup = false,
    isFirstMessage = false,
    suppressLinkedConversationCard = false,
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
    const avatarWidthClass = isHero ? 'w-10' : isDelegation ? 'w-6' : 'w-8'
    const contentTextClass = isHero ? 'text-base leading-relaxed prose' : undefined
    const isUser = message.role === 'user'
    const { userName, userEmail, userAvatar } = useAuth()
    const messageUserName = typeof (message as any)?.userName === 'string' && String((message as any).userName).trim().length > 0 ? String((message as any).userName).trim() : undefined
    const messageUserAvatar = typeof (message as any)?.userAvatar === 'string' && String((message as any).userAvatar).trim().length > 0 ? String((message as any).userAvatar).trim() : undefined

    const effectiveUserName = userNameOverride ?? messageUserName ?? userName
    const effectiveUserEmail = userEmailOverride ?? userEmail
    const effectiveUserAvatar = userAvatarUrlOverride ?? messageUserAvatar ?? userAvatar
    const fallbackVariant = userAvatarFallbackVariantOverride ?? 'initials'

    // Generic: allow any message to link to another conversation (thread preview/index post)
    const linkedConversationId = useMemo(() => {
      const anyMsg = message as unknown as { linkedConversationId?: unknown; linked_conversation_id?: unknown }
      const raw = anyMsg?.linkedConversationId ?? anyMsg?.linked_conversation_id
      return typeof raw === 'string' && raw.trim().length > 0 ? raw.trim() : null
    }, [message])

    const linkedConversationHref = useMemo(() => {
      if (!linkedConversationId) return null
      if (typeof starshipSlug === 'string' && starshipSlug.trim().length > 0) {
        return `/ship/${encodeURIComponent(starshipSlug)}/conversations/${encodeURIComponent(linkedConversationId)}`
      }
      return null
    }, [linkedConversationId, starshipSlug])

    const threadActionButton = useMemo(() => {
      if (!enableChannelMessageThreads) return null
      // Only show on real messages (skip tool_result rows; they are not rendered here anyway)
      const label = linkedConversationId ? 'Open thread' : 'Start thread'
      return (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={e => {
            e.preventDefault()
            e.stopPropagation()
            onThreadAction?.({ messageId: message.id, linkedConversationId, messageText: message.content, linkedMessage: message })
          }}
          aria-label={label}
          title={label}
        >
          <Icon name="thread" className="h-4 w-4" />
        </Button>
      )
    }, [enableChannelMessageThreads, linkedConversationId, message.content, message.id, onThreadAction])

    if (isUser) {
      const isConsecutiveSameUser = Boolean(isConsecutiveUser)
      // When the "user" is being overridden to represent an agent (e.g. Aria in landing demos),
      // prefer an explicitly-provided avatar URL (if any). Otherwise fall back to the seeded agent avatar.
      // Never fall back to the signed-in user's avatar when a seed override is present.
      const explicitUserAvatarUrl = userAvatarUrlOverride
      const shouldUseExplicitUserAvatar = isImageUrl(explicitUserAvatarUrl)
      const shouldUseAuthedUserAvatar = !userAvatarSeedOverride && isImageUrl(effectiveUserAvatar)

      if (isHero || isDelegation) {
        // User message: Neutral bubble on the right (landing demos)
        // Keep spacing similar to assistant hero/delegation rows (avoid large inter-message gaps)
        // IMPORTANT: Avoid `mb-*` here; it creates unwanted gaps even when the next message is consecutive.
        const userRowClass = isDelegation ? cn('gap-2', isConsecutiveSameUser ? 'mt-0' : 'mt-3') : cn('gap-3 mr-6', isConsecutiveSameUser ? 'mt-0' : 'mt-6')
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
                {!suppressLinkedConversationCard && (
                  <LinkedConversationCard
                    linkedConversationId={linkedConversationId}
                    linkedConversationHref={linkedConversationHref}
                    enableChannelMessageThreads={enableChannelMessageThreads}
                    onThreadAction={onThreadAction}
                    message={message}
                    starshipId={starshipId}
                  />
                )}
              </div>
              {isConsecutiveSameUser ? (
                // Only reserve width, not height (prevents "blank gap" under short consecutive messages)
                <div className={cn('flex-shrink-0 mt-1', avatarWidthClass)} aria-hidden="true" />
              ) : (
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
              )}
            </div>
          </div>
        )
      }

      // User message: Render using the same engine as assistant messages (no bubble) - app layout
      const userDisplayName = (effectiveUserName || effectiveUserEmail || 'You').trim()
      const userProfileHref = typeof starshipSlug === 'string' && starshipSlug.trim().length > 0 ? `/ship/${encodeURIComponent(starshipSlug)}/settings/my-profile` : '/profile'

      return (
        <div className="flex justify-start w-full">
          <div
            className={cn(
              // Match assistant row layout: no outer vertical padding/margins (ConversationMessageContent controls spacing)
              'group flex flex-1 min-w-0 items-start gap-3 w-full max-w-full rounded-lg pl-2 pr-[var(--conversation-right-gutter)] -mx-2',
              'py-0',
              // Keep a little top spacing when a user message starts a conversation chunk
              // (No negative margins; we handle tight stacking by not reserving avatar height below.)
              isConsecutiveSameUser ? 'mt-0' : 'mt-4'
            )}
          >
            {isConsecutiveSameUser ? (
              // Only reserve width, not height (prevents "inflated" spacing between short consecutive user messages)
              <div className="flex-shrink-0 w-10 mt-1" aria-hidden="true" />
            ) : (
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
            )}
            <div className="min-w-0 flex-1 w-full pt-0.5">
              {!isConsecutiveSameUser && (
                <div className="mb-0 text-sm font-bold font-mono text-foreground">
                  <Link href={userProfileHref} className="hover:underline underline-offset-2">
                    {userDisplayName}
                  </Link>
                </div>
              )}
              <ConversationMessageContent
                content={message.content}
                messageId={message.id}
                enableMarkdown={true}
                enableCopy={true}
                extraActions={threadActionButton}
                enableLinkPreview={true}
                isStreaming={false}
                compact={isConsecutiveSameUser}
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
              {!suppressLinkedConversationCard && (
                <LinkedConversationCard
                  linkedConversationId={linkedConversationId}
                  linkedConversationHref={linkedConversationHref}
                  enableChannelMessageThreads={enableChannelMessageThreads}
                  onThreadAction={onThreadAction}
                  message={message}
                  starshipId={starshipId}
                />
              )}
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
          <div className={cn('flex justify-start', startsNewGroup ? (isDelegation ? 'mt-2' : 'mt-4') : '')}>
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
                  extraActions={null}
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
                {!suppressLinkedConversationCard && (
                  <LinkedConversationCard
                    linkedConversationId={linkedConversationId}
                    linkedConversationHref={linkedConversationHref}
                    enableChannelMessageThreads={enableChannelMessageThreads}
                    onThreadAction={onThreadAction}
                    message={message}
                    starshipId={starshipId}
                  />
                )}
              </div>
            </div>
          </div>
        )
      }

      return (
        <div className={cn('flex justify-start w-full', isFirstMessage ? 'mt-6' : startsNewGroup ? 'mt-4' : '')}>
          <div
            className={cn(
              'group flex flex-1 min-w-0 items-start gap-3 w-full max-w-full rounded-lg pl-2 pr-[var(--conversation-right-gutter)] -mx-2',
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
                extraActions={threadActionButton}
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
              {!suppressLinkedConversationCard && (
                <LinkedConversationCard
                  linkedConversationId={linkedConversationId}
                  linkedConversationHref={linkedConversationHref}
                  enableChannelMessageThreads={enableChannelMessageThreads}
                  onThreadAction={onThreadAction}
                  message={message}
                  starshipId={starshipId}
                />
              )}
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
    {
      const prevAny = prevProps.message as unknown as { linkedConversationId?: unknown; linked_conversation_id?: unknown }
      const nextAny = nextProps.message as unknown as { linkedConversationId?: unknown; linked_conversation_id?: unknown }
      const prevLink = prevAny?.linkedConversationId ?? prevAny?.linked_conversation_id
      const nextLink = nextAny?.linkedConversationId ?? nextAny?.linked_conversation_id
      if (String(prevLink ?? '') !== String(nextLink ?? '')) return false
    }
    if ((prevProps.showAssistantAvatar ?? true) !== (nextProps.showAssistantAvatar ?? true)) return false
    if (Boolean(prevProps.isConsecutiveUser) !== Boolean(nextProps.isConsecutiveUser)) return false
    if (Boolean(prevProps.startsNewGroup) !== Boolean(nextProps.startsNewGroup)) return false
    if ((prevProps.isFirstMessage ?? false) !== (nextProps.isFirstMessage ?? false)) return false
    if (Boolean(prevProps.suppressLinkedConversationCard) !== Boolean(nextProps.suppressLinkedConversationCard)) return false

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
    if (Boolean(prevProps.enableChannelMessageThreads) !== Boolean(nextProps.enableChannelMessageThreads)) return false
    if ((prevProps.onThreadAction ? '1' : '0') !== (nextProps.onThreadAction ? '1' : '0')) return false

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

function ChannelHero({
  channelName,
  conversationTitle,
  bottomAlign,
}: {
  channelName?: string | null
  conversationTitle: string | null
  bottomAlign: boolean
}) {
  const displayName =
    (typeof channelName === 'string' && channelName.trim().length > 0 ? channelName.trim() : null) ||
    (typeof conversationTitle === 'string' && conversationTitle.trim().length > 0 ? conversationTitle.trim() : null) ||
    'Channel'
  const displayHashed = `#${displayName.replace(/^#/, '')}`

  return (
    <div className={cn(bottomAlign && 'mt-auto', 'pb-10 pt-10')}>
      <div className="max-w-3xl">
        <div className="flex items-start gap-4">
          <div className="h-14 w-14 rounded-2xl bg-muted/60 border border-border/60 flex items-center justify-center flex-shrink-0">
            <Icon name="hash" className="h-7 w-7 text-muted-foreground" />
          </div>
          <div className="min-w-0">
            <h2 className="text-2xl font-semibold text-foreground truncate">{displayName}</h2>
            <p className="text-muted-foreground mt-1 leading-relaxed">
              This is the beginning of {displayHashed}. Send a message to start a conversation.
            </p>
          </div>
        </div>
      </div>
      <div
        role="separator"
        aria-hidden="true"
        // Match ConversationSummaryBar's `border-b border-border` (same thickness + color),
        // but with a left-weighted fade (transparent → solid border → transparent).
        className="mt-8 h-px w-full bg-[linear-gradient(90deg,transparent_0%,hsl(var(--border))_7%,hsl(var(--border))_18%,hsl(var(--border)/0.35)_62%,transparent_100%)]"
      />
    </div>
  )
}
