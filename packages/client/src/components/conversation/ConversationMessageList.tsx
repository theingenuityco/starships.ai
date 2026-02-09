'use client'

import Icon from '@/components/primitives/Icon'
import AgentAvatar from '@/components/animated/AgentAvatar'

import { DELETED_MESSAGE_MARKER, type MessageModel } from '@starships/protocol'

import LoadingSpinner from '@/components/primitives/LoadingSpinner'
import { useEffect, useLayoutEffect, useMemo, useRef, memo, useState, Fragment, useCallback, type ReactNode } from 'react'
import { ConversationMessageContent } from './ConversationMessageContent'
import { useConversationAgents, useConversationDetail, useDeleteMessage, useStarshipDirectMessages, useUpdateMessage, type DirectMessageListItem } from '@/hooks/useConversations'
import { useConversationStreamContextOptional } from '@/hooks/ConversationStreamContext'
import type { LlmToolCall } from '@starships/autopilot'
import { useMessageAttachments } from '@/hooks/useFileUpload'
import { useAuth } from '@/hooks/useAuth'
import { useStarshipMembersAndInvites } from '@/hooks/useStarshipMembers'
import { buildPlainTextSnippet, stripMarkdownToPlainText } from '@/components/conversation/conversationSearch'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { cn, formatDate, formatTime } from '@/lib/utils'
import { format as formatDay, isToday, isYesterday, parseISO } from 'date-fns'
import { isImageUrl } from '@/lib/isImageUrl'
import { formatAgentDisplayName, formatAgentNameWithRole } from '@/lib/agentDisplay'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { TypingDots } from '@/components/ui/TypingDots'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import api from '@/lib/api'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { InlineWidgetRenderer } from '@/components/widgets/InlineWidgetRenderer'
import { MarketplaceAvatar } from '@/components/marketplace/MarketplaceAvatar'
import { useUserPreferencesStore } from '@/store/user-preferences-store'
import { useModelContextLength } from '@/hooks/useLlmModels'
import { PresenceIndicator } from '@/components/ui/PresenceIndicator'
import { useStarshipPresence } from '@/hooks/useStarshipPresence'
import { Skeleton } from '@/components/ui/skeleton'
import { MessageReactions } from './MessageReactions'
import { MessageReactionAction } from './MessageReactionAction'
import { HoverProfilePopover } from './HoverProfilePopover'
import { AgentProfileHoverCardContent, UserProfileHoverCardContent } from './ProfileHoverCardContent'

type TurnUsageForRing = {
  turnId: string
  at: string
  agentId?: string
  agentName?: string
  model?: string
  usage: { promptTokens: number; completionTokens: number; totalTokens: number; cost?: number }
}

function AgentAvatarWithTurnUsageRing({
  seed,
  imageUrl,
  modelIdOverride,
  tokenLimitOverride,
  size,
  rounded,
  usage,
  enabled,
  busy,
  className,
}: {
  seed: string
  imageUrl?: string
  modelIdOverride?: string | null
  tokenLimitOverride?: number | null
  size: number
  rounded?: boolean
  usage?: TurnUsageForRing | null
  enabled: boolean
  busy?: boolean
  className?: string
}) {
  const modelId =
    (typeof usage?.model === 'string' && usage.model.trim().length > 0 ? usage.model.trim() : null) ||
    (typeof modelIdOverride === 'string' && modelIdOverride.trim().length > 0 ? modelIdOverride.trim() : null)
  const { contextLength } = useModelContextLength(modelId)

  const promptTokens = Number(usage?.usage?.promptTokens ?? 0)
  const completionTokens = Number(usage?.usage?.completionTokens ?? 0)
  const totalTokens = Number(usage?.usage?.totalTokens ?? 0) || Number(promptTokens) + Number(completionTokens)
  const agentTokenLimit = typeof tokenLimitOverride === 'number' && Number.isFinite(tokenLimitOverride) && tokenLimitOverride > 0 ? tokenLimitOverride : null
  const ctx = typeof contextLength === 'number' && Number.isFinite(contextLength) && contextLength > 0 ? contextLength : null

  // Outer ring padding (px) around the avatar
  const pad = 3
  const outer = size + pad * 2
  const stroke = 2
  const r = outer / 2 - stroke / 2
  const c = 2 * Math.PI * r

  // Preferred ring meaning:
  // 1) Turn "tokens burned" vs model context window (preferred when available)
  // 2) Fallback: turn "tokens burned" vs agent token limit (maxTokens)
  const pctTurnVsCtx = ctx && totalTokens > 0 ? Math.max(0, Math.min(100, (totalTokens / ctx) * 100)) : null
  const pctTurnVsMax = agentTokenLimit && totalTokens > 0 ? Math.max(0, Math.min(100, (totalTokens / agentTokenLimit) * 100)) : null
  const pct = pctTurnVsCtx ?? pctTurnVsMax
  const offset = pct == null ? c : c * (1 - pct / 100)

  const ringClass = pct != null && pct >= 90 ? 'text-red-500' : pct != null && pct >= 50 ? 'text-orange-500' : 'text-yellow-500'
  const title = (() => {
    if (!enabled || pct == null) return undefined
    if (pctTurnVsCtx != null && ctx) {
      return `${totalTokens.toLocaleString()}/${ctx.toLocaleString()} turn tokens (${pct.toFixed(pct >= 10 ? 0 : 1)}%)${
        typeof usage?.usage?.cost === 'number' ? ` • $${Number(usage.usage.cost).toFixed(2)}` : ''
      }`
    }
    if (pctTurnVsMax != null && agentTokenLimit) {
      return `${totalTokens.toLocaleString()}/${agentTokenLimit.toLocaleString()} turn tokens (${pct.toFixed(pct >= 10 ? 0 : 1)}%)${
        typeof usage?.usage?.cost === 'number' ? ` • $${Number(usage.usage.cost).toFixed(2)}` : ''
      }`
    }
    return undefined
  })()

  if (!enabled || !usage || pct == null) {
    return (
      <div className={cn('relative flex-shrink-0', className)} style={{ width: size, height: size }}>
        <div className="relative w-full h-full">
          <div className="w-full h-full rounded-full bg-muted flex items-center justify-center overflow-hidden">
            <AgentAvatar seed={seed} imageUrl={imageUrl} size={size} rounded={rounded} />
          </div>
          {/* Align to the avatar box (not an outer wrapper) */}
          <PresenceIndicator kind={busy ? 'busy' : 'online'} active={true} />
        </div>
      </div>
    )
  }

  return (
    <div className={cn('relative flex-shrink-0', className)} style={{ width: outer, height: outer }} aria-label={title} title={title}>
      <svg width={outer} height={outer} viewBox={`0 0 ${outer} ${outer}`} className="absolute inset-0" aria-hidden="true" focusable="false">
        <circle
          cx={outer / 2}
          cy={outer / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          strokeDasharray={c}
          // Negative offset reverses direction (anti-clockwise).
          strokeDashoffset={-offset}
          strokeLinecap="round"
          // Start 45° anticlockwise from bottom (~5 o'clock).
          transform={`rotate(45 ${outer / 2} ${outer / 2})`}
          className={ringClass}
        />
      </svg>
      {/* Anchor the indicator to the inner avatar box (inset), not the outer ring box */}
      <div className="absolute inset-[3px]">
        <div className="relative w-full h-full">
          <div className="w-full h-full rounded-full bg-muted flex items-center justify-center overflow-hidden">
            <AgentAvatar seed={seed} imageUrl={imageUrl} size={size} rounded={rounded} />
          </div>
          <PresenceIndicator kind={busy ? 'busy' : 'online'} active={true} />
        </div>
      </div>
    </div>
  )
}

function LinkedConversationCard({
  linkedConversationId,
  linkedConversationHref,
  isActiveThread,
  enableChannelMessageThreads,
  onThreadAction,
  message,
  starshipId,
  isUserOnline,
}: {
  linkedConversationId: string | null
  linkedConversationHref: string | null
  /** When true, visually highlight this card as the active/open thread. */
  isActiveThread?: boolean
  enableChannelMessageThreads: boolean
  onThreadAction?: (args: { messageId: string; linkedConversationId: string | null; messageText?: string; linkedMessage?: MessageModel | null }) => void
  message: MessageModel
  starshipId?: string
  isUserOnline?: (userId: string) => boolean
}) {
  const { data: conversation, isLoading: isLoadingConversation } = useConversationDetail(linkedConversationId)
  const { data: agents = [], isLoading: isLoadingAgents } = useConversationAgents(linkedConversationId)
  const agentList = useMemo(() => (Array.isArray(agents) ? agents : []) as any[], [agents])
  const { userId: authUserId } = useAuth()
  const isLinkedConversationBusy = !!((conversation as any)?.state && typeof (conversation as any)?.state === 'object' && ((conversation as any).state as any).turnActive === true)

  const rawTitle = String((conversation as any)?.title ?? '').trim()
  const title = rawTitle || (isLoadingConversation || isLoadingAgents ? 'Loading thread...' : linkedConversationId ? `Conversation ${linkedConversationId.slice(0, 8)}` : 'Conversation')

  const agentNames = agentList.map(a => String(a?.name || a?.slug || '').trim()).filter(Boolean)

  const avatarAttachmentIds = useMemo(() => {
    const ids = agentList.map(a => (typeof a?.avatarAttachmentId === 'string' ? String(a.avatarAttachmentId).trim() : '')).filter(Boolean)
    return Array.from(new Set(ids))
  }, [agentList])
  const { data: avatarAttachments = [], isLoading: isLoadingAvatarAttachments } = useMessageAttachments(avatarAttachmentIds, starshipId)
  const avatarUrlById = useMemo(() => new Map((avatarAttachments || []).map(a => [a.id, a.previewUrl] as const)), [avatarAttachments])

  // Starship member directory (resolve userId -> displayName/avatar for participant list)
  const { data: membersAndInvites } = useStarshipMembersAndInvites(String(starshipId || ''), Boolean(starshipId))
  const memberByUserId = useMemo(() => {
    const list = Array.isArray((membersAndInvites as any)?.members) ? (((membersAndInvites as any).members as any[]) ?? []) : []
    const m = new Map<string, { displayName?: string | null; email?: string | null; avatar?: string | null }>()
    for (const it of list) {
      const id = typeof it?.userId === 'string' ? String(it.userId).trim() : ''
      if (!id) continue
      m.set(id, {
        displayName: typeof it?.displayName === 'string' ? String(it.displayName) : null,
        email: typeof it?.email === 'string' ? String(it.email) : null,
        avatar: typeof it?.avatar === 'string' ? String(it.avatar) : null,
      })
    }
    return m
  }, [membersAndInvites])

  // Include human participants by sampling recent message authors.
  // The conversation detail endpoint does not currently include members/users.
  const { data: participantsPreview, isLoading: isLoadingParticipantsPreview } = useQuery({
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

    // Most-recent speakers first: scan messages newest -> oldest and add participants in encounter order.
    const msgsRaw = Array.isArray((participantsPreview as any)?.messages) ? (((participantsPreview as any).messages as any[]) ?? []) : []
    const msgs = msgsRaw.slice().sort((a, b) => {
      const aAt = Date.parse(String(a?.createdAt || a?.updatedAt || '')) || 0
      const bAt = Date.parse(String(b?.createdAt || b?.updatedAt || '')) || 0
      return bAt - aAt
    })

    for (const m of msgs) {
      const role = String(m?.role ?? '')

      if (role === 'user') {
        const userId = typeof m?.userId === 'string' ? String(m.userId).trim() : ''
        const userName = typeof m?.userName === 'string' ? String(m.userName).trim() : ''
        const userAvatar = typeof m?.userAvatar === 'string' ? String(m.userAvatar).trim() : ''

        const fromDirectory = userId ? memberByUserId.get(userId) : null
        const label =
          (userId === String(authUserId || '') ? 'You' : '') || userName || fromDirectory?.displayName?.trim() || fromDirectory?.email?.trim() || '' || (userId ? `User ${userId.slice(0, 6)}` : 'User')
        const key = userId ? `human:${userId}` : userName ? `human:name:${userName}` : `human:unknown:${label}`
        if (seen.has(key)) continue
        seen.add(key)
        const avatarUrl = userAvatar || fromDirectory?.avatar?.trim() || ''
        items.push({ kind: 'human', key, label, ...(avatarUrl ? { avatarUrl } : null) })
        continue
      }

      if (role === 'assistant') {
        const agentId = typeof m?.agentId === 'string' ? String(m.agentId).trim() : ''
        if (!agentId) continue
        const fromList = agentList.find(a => String(a?.id || '').trim() === agentId) as any
        const agentNameFromMsg = typeof m?.agentName === 'string' ? String(m.agentName).trim() : ''
        const label = String(fromList?.name || fromList?.slug || agentNameFromMsg || `Agent ${agentId.slice(0, 6)}`).trim() || `Agent ${agentId.slice(0, 6)}`
        const key = `agent:${agentId}`
        if (seen.has(key)) continue
        seen.add(key)
        const seed = String(fromList?.name || fromList?.slug || agentNameFromMsg || agentId).trim() || agentId
        const aid = typeof fromList?.avatarAttachmentId === 'string' ? String(fromList.avatarAttachmentId).trim() : ''
        items.push({ kind: 'agent', key, label, seed, ...(aid ? { avatarAttachmentId: aid } : null) })
        continue
      }
    }

    // Stable participants list from server (includes conversation member userIds and linked agentIds).
    const participants = Array.isArray((participantsPreview as any)?.participants) ? (((participantsPreview as any).participants as any[]) ?? []) : []
    if (participants.length > 0) {
      for (const raw of participants) {
        const id = typeof raw === 'string' ? raw.trim() : ''
        if (!id) continue
        const fromAgentList = agentList.find(a => String(a?.id || '').trim() === id) as any
        if (fromAgentList) {
          const label = String(fromAgentList?.name || fromAgentList?.slug || id || `Agent ${id.slice(0, 6)}`).trim() || `Agent ${id.slice(0, 6)}`
          const key = `agent:${id || label}`
          if (seen.has(key)) continue
          seen.add(key)
          const seed = String(fromAgentList?.name || fromAgentList?.slug || id || label).trim() || label
          const aid = typeof fromAgentList?.avatarAttachmentId === 'string' ? String(fromAgentList.avatarAttachmentId).trim() : ''
          items.push({ kind: 'agent', key, label, seed, ...(aid ? { avatarAttachmentId: aid } : null) })
        } else {
          const fromDirectory = memberByUserId.get(id)
          const labelRaw = id === String(authUserId || '') ? 'You' : fromDirectory?.displayName?.trim() || fromDirectory?.email?.trim() || ''
          const label = labelRaw || `User ${id.slice(0, 6)}`
          const key = `human:${id}`
          if (seen.has(key)) continue
          seen.add(key)
          const avatarUrl = typeof fromDirectory?.avatar === 'string' ? fromDirectory.avatar.trim() : ''
          items.push({ kind: 'human', key, label, ...(avatarUrl ? { avatarUrl } : null) })
        }
      }
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
  }, [agentList, authUserId, memberByUserId, participantsPreview])

  const participantsLabel = useMemo(() => {
    const labels = participantItems.map(p => p.label).filter(Boolean)
    if (labels.length === 0) return 'No participants'
    if (labels.length <= 3) return labels.join(', ')
    return `${labels.slice(0, 3).join(', ')} +${labels.length - 3}`
  }, [participantItems])

  const shouldShowAvatarPlaceholders = Boolean(isLoadingParticipantsPreview || isLoadingAvatarAttachments)

  // IMPORTANT: Don't early-return before hooks, or we can change hook ordering
  // between renders when `linkedConversationId` flips from null -> string.
  if (!linkedConversationId) return null

  const cardInner = (
    <div
      className={cn('w-full rounded-xl border border-border/60 bg-card/60 hover:bg-card transition-colors px-4 py-3', isActiveThread && 'border-primary/60 bg-primary/5 ring-1 ring-primary/20')}
      data-thread-linked-conversation-id={linkedConversationId ?? undefined}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <Icon name="thread" className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <p className="text-sm font-medium text-foreground truncate">{title}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Participants (overlapping avatars) */}
          {participantItems.length > 0 || shouldShowAvatarPlaceholders ? (
            <div className="flex items-center gap-2" title={participantsLabel} aria-label={`Participants: ${participantsLabel}`}>
              {/* Render most-recent participant LEFTMOST (and on top in the overlap stack). */}
              <div className="flex items-center -space-x-2 space-x-reverse flex-row-reverse">
                {shouldShowAvatarPlaceholders ? (
                  <>
                    <div className="h-7 w-7 rounded-full ring-2 ring-background bg-muted/60 animate-pulse" aria-hidden="true" />
                    <div className="h-7 w-7 rounded-full ring-2 ring-background bg-muted/50 animate-pulse" aria-hidden="true" />
                    <div className="h-7 w-7 rounded-full ring-2 ring-background bg-muted/40 animate-pulse" aria-hidden="true" />
                  </>
                ) : (
                  participantItems
                    .slice(0, 3)
                    .slice()
                    .reverse()
                    .map(p => {
                      if (p.kind === 'agent') {
                        const imageUrl = p.avatarAttachmentId ? avatarUrlById.get(p.avatarAttachmentId) : undefined
                        return (
                          <div key={p.key} className="h-7 w-7 rounded-full ring-2 ring-background bg-muted overflow-hidden">
                            <AgentAvatar seed={p.seed} imageUrl={imageUrl} size={28} rounded />
                          </div>
                        )
                      }
                      return (
                        <div key={p.key} className="h-7 w-7">
                          <Avatar className="h-7 w-7 rounded-full ring-2 ring-background bg-muted overflow-hidden">
                            {p.avatarUrl ? <AvatarImage src={p.avatarUrl} alt={p.label} referrerPolicy="no-referrer" crossOrigin="anonymous" className="object-cover" /> : null}
                            <AvatarFallback className="rounded-full bg-muted text-muted-foreground text-[10px] font-semibold">{initialsFromName(p.label)}</AvatarFallback>
                          </Avatar>
                        </div>
                      )
                    })
                )}
              </div>
              {participantItems.length > 3 ? <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">and {participantItems.length - 3} more</span> : null}
            </div>
          ) : null}
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
  /**
   * Optional override for the conversation title used in the empty-state hero.
   * Primarily used for draft direct-messages (no persisted conversation yet).
   */
  emptyHeroTitleOverride?: string | null
  /**
   * Optional participant metadata for the empty-state hero (e.g. draft DM target).
   * - For agent DMs, pass `{ kind: 'agent', seed, avatarAttachmentId }` to show the agent avatar.
   * - For user DMs, pass `{ kind: 'human', avatarUrl }` to show the peer avatar.
   */
  emptyHeroParticipantOverride?: { kind: 'agent'; label: string; seed: string; avatarAttachmentId?: string | null } | { kind: 'human'; label: string; avatarUrl?: string | null } | null
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
  /**
   * When set, highlight the message row whose `linkedConversationId` matches this id.
   * Used to visually indicate which parent message the currently-open thread is linked to.
   */
  activeThreadConversationId?: string | null
}

export function ConversationMessageList({
  conversationId,
  starshipId,
  channelName,
  emptyHeroTitleOverride,
  emptyHeroParticipantOverride,
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
  activeThreadConversationId,
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
  const awaitRequested = (stream as any)?.awaitRequested as { at: string; nodeRef: string; kind: 'connector_event'; spec: Record<string, unknown> } | null | undefined
  const turnUsageByTurnId = (stream as any)?.turnUsageByTurnId as Record<string, any> | undefined
  const activeTurnId = typeof (stream as any)?.turnId === 'string' ? String((stream as any).turnId) : null
  const activeTurnStatus = typeof (stream as any)?.turnStatus === 'string' ? String((stream as any).turnStatus) : null
  const isTerminalTurnStatus = activeTurnStatus === 'completed' || activeTurnStatus === 'failed' || activeTurnStatus === 'cancelled'
  const presence = useStarshipPresence(String(starshipId || ''), Boolean(starshipId))
  const isConversationBusy = !isTerminalTurnStatus && (activeTurnStatus === 'active' || activeTurnStatus === 'waiting_for_tools') && (isResponding || isAssistantStreaming || isAwaitingToolResults)
  const expertMode = useUserPreferencesStore(s => s.expertMode)
  const canLoadOlder = !messagesOverride && Boolean(stream?.hasMoreBefore) && Boolean(stream?.oldestCursor) && typeof stream?.loadOlder === 'function'
  const isLoadingOlder = Boolean(stream?.isLoadingOlder)

  const { data: conversationDetail } = useConversationDetail(conversationId)
  const resolvedEmptyHeroTitle = useMemo(() => {
    const fromDetail = typeof (conversationDetail as any)?.title === 'string' ? String((conversationDetail as any).title).trim() : ''
    if (fromDetail) return fromDetail
    const fromOverride = typeof emptyHeroTitleOverride === 'string' ? emptyHeroTitleOverride.trim() : ''
    return fromOverride || null
  }, [conversationDetail, emptyHeroTitleOverride])

  // Conversation agents (can be multiple). We need to resolve agent details per message by `message.agentId`.
  type ConversationAgent = {
    id?: string
    name?: string
    role?: string
    slug?: string
    avatarAttachmentId?: string
    model?: string
  }
  const { data: conversationAgentsRaw = [] } = useConversationAgents(conversationId)
  const conversationAgents = useMemo(() => (Array.isArray(conversationAgentsRaw) ? (conversationAgentsRaw as ConversationAgent[]) : []), [conversationAgentsRaw])

  // For user↔user DMs, derive the peer user from the DM list (same source as ConversationSummaryBar).
  const { data: dmListData } = useStarshipDirectMessages(String(starshipId || ''), Boolean(starshipId && conversationId))
  const dmItem = useMemo<DirectMessageListItem | null>(() => {
    const cid = String(conversationId || '')
    const list = (dmListData?.directMessages || []) as DirectMessageListItem[]
    if (!cid || !Array.isArray(list) || list.length === 0) return null
    return list.find(x => String((x as any)?.dm?.conversationId || '') === cid) || null
  }, [dmListData?.directMessages, conversationId])

  const resolvedEmptyHeroParticipant = useMemo(() => {
    // Prefer explicit override (draft DM target).
    if (emptyHeroParticipantOverride) return emptyHeroParticipantOverride

    // user↔user DM: show peer avatar instead of chat icon.
    const dm: any = (dmItem as any)?.dm
    // user↔agent DM: prefer the DM list's resolved agent (authoritative for this DM).
    // The conversation "agents" list can include extra agents (e.g. defaults) or be ordered unexpectedly,
    // which would make the empty-state hero show the wrong agent.
    if (dm?.dmType === 'user_agent') {
      const dmAgent: any = (dmItem as any)?.agent ?? null
      const agentId = typeof dm?.agentId === 'string' ? String(dm.agentId).trim() : ''
      const agent = dmAgent || (agentId ? (conversationAgents.find(a => String((a as any)?.id || '').trim() === agentId) as any) : null) || null
      if (agent) {
        const label = formatAgentDisplayName(agent) || 'Agent'
        const seed = String(agent?.name || agent?.slug || agent?.id || label)
        const avatarAttachmentId = typeof agent?.avatarAttachmentId === 'string' ? String(agent.avatarAttachmentId) : null
        return { kind: 'agent' as const, label, seed, avatarAttachmentId }
      }
      // If we can't resolve the DM's agent, prefer "no participant" (generic DM hero)
      // rather than falling back to conversationAgents[0] (which may be unrelated like Aria).
      return null
    }
    if (dm?.dmType === 'user_user') {
      const peer: any = (dmItem as any)?.peerUser
      const peerId = typeof peer?.id === 'string' ? String(peer.id).trim() : ''
      const label = (typeof peer?.displayName === 'string' && peer.displayName.trim()) || (typeof peer?.email === 'string' && peer.email.trim()) || (peerId ? `User ${peerId.slice(0, 6)}` : 'User')
      const avatarUrl = typeof peer?.avatar === 'string' ? String(peer.avatar) : null
      return { kind: 'human' as const, label, avatarUrl }
    }

    // Otherwise derive from the conversation's first agent (works for empty/brand-new DM conversations too).
    const a0: any = conversationAgents?.[0]
    if (!a0) return null
    const label = formatAgentDisplayName(a0) || 'Agent'
    const seed = String(a0?.name || a0?.slug || a0?.id || label)
    const avatarAttachmentId = typeof a0?.avatarAttachmentId === 'string' ? String(a0.avatarAttachmentId) : null
    return { kind: 'agent' as const, label, seed, avatarAttachmentId }
  }, [conversationAgents, dmItem, emptyHeroParticipantOverride])

  const emptyHeroAvatarAttachmentIds = useMemo(() => {
    const p = resolvedEmptyHeroParticipant
    if (!p || p.kind !== 'agent') return []
    const id = typeof p.avatarAttachmentId === 'string' ? p.avatarAttachmentId.trim() : ''
    return id ? [id] : []
  }, [resolvedEmptyHeroParticipant])
  const { data: emptyHeroAvatarAttachments = [] } = useMessageAttachments(emptyHeroAvatarAttachmentIds, starshipId)
  const emptyHeroAvatarUrlById = useMemo(() => new Map((emptyHeroAvatarAttachments || []).map(a => [a.id, a.previewUrl] as const)), [emptyHeroAvatarAttachments])

  // IMPORTANT:
  // For user↔agent DMs, the streaming placeholder message (`stream-${turnId}`) often arrives without
  // an `agentId`/`agentName` initially. If we fall back to `conversationAgents[0]`, we can render the
  // *wrong* agent label during streaming (e.g. "Aria") and then "snap back" once the final persisted
  // message includes the correct agent metadata. Prefer the DM list's resolved agent instead.
  const dmAgentFallback = useMemo<ConversationAgent | null>(() => {
    const dm: any = (dmItem as any)?.dm
    if (dm?.dmType !== 'user_agent') return null

    const dmAgent: any = (dmItem as any)?.agent ?? null
    const dmAgentId = typeof dm?.agentId === 'string' ? String(dm.agentId).trim() : ''
    const fromConversationList = dmAgentId && Array.isArray(conversationAgents) ? ((conversationAgents.find(a => String((a as any)?.id || '').trim() === dmAgentId) as any) ?? null) : null

    return (dmAgent as any) || (fromConversationList as any) || null
  }, [conversationAgents, dmItem])

  const isUserAgentDm = (dmItem as any)?.dm?.dmType === 'user_agent'
  // For user↔agent DMs, never fall back to some other agent (e.g. Aria) if we can't resolve the DM agent.
  // Prefer rendering a generic "Assistant" over showing the wrong name during streaming.
  const fallbackAgent = isUserAgentDm ? dmAgentFallback : conversationAgents[0]
  const fallbackAgentDisplayName = useMemo(() => {
    if (typeof agentNameOverride === 'string' && agentNameOverride.trim().length > 0) return agentNameOverride.trim()
    if (fallbackAgent) return formatAgentDisplayName(fallbackAgent)
    return undefined
  }, [agentNameOverride, fallbackAgent])

  const agentById = useMemo(() => {
    const m = new Map<string, ConversationAgent>()
    for (const a of conversationAgents) {
      const id = typeof a?.id === 'string' ? a.id.trim() : ''
      if (!id) continue
      m.set(id, a)
    }
    return m
  }, [conversationAgents])

  const agentDisplayNameById = useMemo(() => {
    const m = new Map<string, string>()
    for (const a of conversationAgents) {
      const id = typeof a?.id === 'string' ? a.id.trim() : ''
      if (!id) continue
      const label = formatAgentDisplayName(a).trim()
      if (!label) continue
      m.set(id, label)
    }
    return m
  }, [conversationAgents])

  const agentAvatarAttachmentIds = useMemo(() => {
    const ids = conversationAgents.map(a => (typeof a?.avatarAttachmentId === 'string' ? String(a.avatarAttachmentId).trim() : '')).filter(Boolean)
    const fallbackId = typeof (fallbackAgent as any)?.avatarAttachmentId === 'string' ? String((fallbackAgent as any).avatarAttachmentId).trim() : ''
    if (fallbackId) ids.push(fallbackId)
    return Array.from(new Set(ids))
  }, [conversationAgents, fallbackAgent])
  const { data: agentAvatarAttachments = [] } = useMessageAttachments(agentAvatarAttachmentIds, starshipId)
  const agentAvatarUrlByAttachmentId = useMemo(() => new Map((agentAvatarAttachments || []).map(a => [a.id, a.previewUrl] as const)), [agentAvatarAttachments])

  const resolveAssistantPresentation = useCallback(
    (msg: ExtendedMessage | null | undefined) => {
      if (!msg || msg.role !== 'assistant') return null
      const agentId = typeof (msg as any)?.agentId === 'string' ? String((msg as any).agentId).trim() : ''
      const fromList = agentId ? agentById.get(agentId) : undefined
      const agent = fromList ?? fallbackAgent

      // `message.agentName` often comes from the backend as *name-only* (no role).
      // Always append role when we can resolve it from the agent list.
      const nameFromMsg = typeof (msg as any)?.agentName === 'string' ? String((msg as any).agentName).trim() : ''
      const roleFromAgent = typeof (agent as any)?.role === 'string' ? String((agent as any).role).trim() : ''
      const nameFallback =
        nameFromMsg ||
        (typeof (agent as any)?.name === 'string' ? String((agent as any).name).trim() : '') ||
        (typeof (agent as any)?.slug === 'string' ? String((agent as any).slug).trim() : '') ||
        (agentId ? `Agent ${agentId.slice(0, 6)}` : '')

      const displayName = (formatAgentNameWithRole(nameFallback, roleFromAgent) || nameFallback || fallbackAgentDisplayName || 'Assistant').trim()

      const slugRaw = typeof (agent as any)?.slug === 'string' ? String((agent as any).slug).trim() : ''
      const slug = slugRaw || undefined

      const avatarAttachmentId = typeof (agent as any)?.avatarAttachmentId === 'string' ? String((agent as any).avatarAttachmentId).trim() : ''
      const avatarUrl = agentAvatarUrlOverride ?? (avatarAttachmentId ? agentAvatarUrlByAttachmentId.get(avatarAttachmentId) : undefined)

      const model = typeof (agent as any)?.model === 'string' ? String((agent as any).model).trim() : ''
      const maxTokensRaw = (agent as any)?.maxTokens ?? (agent as any)?.state?.maxTokens
      const maxTokensNum = typeof maxTokensRaw === 'number' ? maxTokensRaw : typeof maxTokensRaw === 'string' ? Number(maxTokensRaw) : NaN
      const maxTokens = Number.isFinite(maxTokensNum) && maxTokensNum > 0 ? maxTokensNum : undefined

      const role = typeof (agent as any)?.role === 'string' ? String((agent as any).role).trim() : undefined
      const version = typeof (agent as any)?.version === 'string' ? String((agent as any).version).trim() : undefined
      const category = typeof (agent as any)?.category === 'string' ? String((agent as any).category).trim() : undefined
      const publicationStatus = typeof (agent as any)?.publicationStatus === 'string' ? String((agent as any).publicationStatus).trim() : undefined
      const assignedToolSlugs = Array.isArray((agent as any)?.assignedToolSlugs)
        ? ((agent as any).assignedToolSlugs as string[]).map(x => String(x)).filter(Boolean)
        : undefined
      const createdAt = typeof (agent as any)?.createdAt === 'string' ? String((agent as any).createdAt).trim() : undefined
      const updatedAt = typeof (agent as any)?.updatedAt === 'string' ? String((agent as any).updatedAt).trim() : undefined

      return {
        displayName: displayName.trim() || 'Assistant',
        slug,
        avatarUrl,
        modelId: model || undefined,
        maxTokens,
        role,
        version,
        category,
        publicationStatus,
        assignedToolSlugs,
        createdAt,
        updatedAt,
      }
    },
    [agentAvatarUrlByAttachmentId, agentAvatarUrlOverride, agentById, agentDisplayNameById, fallbackAgent, fallbackAgentDisplayName]
  )

  const resolveAgentPresentationFromAgent = useCallback(
    (agent: ConversationAgent | null | undefined) => {
      if (!agent) return null
      const roleFromAgent = typeof (agent as any)?.role === 'string' ? String((agent as any).role).trim() : ''
      const nameFallback =
        (typeof (agent as any)?.name === 'string' ? String((agent as any).name).trim() : '') ||
        (typeof (agent as any)?.slug === 'string' ? String((agent as any).slug).trim() : '') ||
        (typeof (agent as any)?.id === 'string' ? `Agent ${String((agent as any).id).slice(0, 6)}` : '')
      const displayName = (formatAgentNameWithRole(nameFallback, roleFromAgent) || nameFallback || fallbackAgentDisplayName || 'Assistant').trim()
      const slugRaw = typeof (agent as any)?.slug === 'string' ? String((agent as any).slug).trim() : ''
      const slug = slugRaw || undefined
      const avatarAttachmentId = typeof (agent as any)?.avatarAttachmentId === 'string' ? String((agent as any).avatarAttachmentId).trim() : ''
      const avatarUrl = agentAvatarUrlOverride ?? (avatarAttachmentId ? agentAvatarUrlByAttachmentId.get(avatarAttachmentId) : undefined)
      return { displayName: displayName || 'Assistant', slug, avatarUrl }
    },
    [agentAvatarUrlByAttachmentId, agentAvatarUrlOverride, fallbackAgentDisplayName]
  )

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
  const normalizedHighlightTerm = highlightTerm ? stripMarkdownToPlainText(highlightTerm).trim() || undefined : undefined
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

  // Gap loader ("Typing...") logic:
  // - We only want to show it when the agent is actually going to respond.
  // - Some turns can briefly enter `active` and then immediately complete with no assistant output
  //   (e.g. "no-op" routing decisions). If we show immediately, it flashes for a split second.
  // - To avoid the flash, debounce: only render the gap loader after a short delay.
  const GAP_LOADER_DELAY_MS = 250
  const isAwaitingAssistant = Boolean(isResponding && !isAssistantStreaming && !isAwaitingToolResults)
  const [gapLoaderArmed, setGapLoaderArmed] = useState(false)
  useEffect(() => {
    if (!isAwaitingAssistant) {
      setGapLoaderArmed(false)
      return
    }
    let cancelled = false
    const t = setTimeout(() => {
      if (!cancelled) setGapLoaderArmed(true)
    }, GAP_LOADER_DELAY_MS)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [isAwaitingAssistant, activeTurnId])

  // Show while awaiting first assistant text OR between tool results and next assistant text.
  const shouldShowGapLoader = Boolean(isAwaitingAssistant && gapLoaderArmed)

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

  const gapLoaderPresentation = useMemo(() => {
    if (!activeTurnId) return null

    // 1) Best: `turn.usage` tells us the actual agent for this turn (when available).
    const usage = activeTurnId && turnUsageByTurnId && typeof turnUsageByTurnId === 'object' ? (turnUsageByTurnId as any)[activeTurnId] : null
    const usageAgentId = typeof usage?.agentId === 'string' ? String(usage.agentId).trim() : ''
    const usageAgentName = typeof usage?.agentName === 'string' ? String(usage.agentName).trim() : ''
    if (usageAgentId) {
      const agent = agentById.get(usageAgentId) ?? null
      const p = resolveAgentPresentationFromAgent(agent)
      if (p) return { ...p, strategy: 'turn.usage.agentId' as const, mentionAgentId: '' }
    }
    if (usageAgentName) {
      return { displayName: usageAgentName, slug: undefined, avatarUrl: undefined, strategy: 'turn.usage.agentName' as const, mentionAgentId: '' }
    }

    // 2) Next-best: parse the last user message for an agent mention (<@a:AGENT_ID> or legacy @slug)
    const lastUser = [...renderMessages].reverse().find(m => (m as any)?.role === 'user') as ExtendedMessage | undefined
    const lastUserContent = typeof (lastUser as any)?.content === 'string' ? String((lastUser as any).content) : ''
    const tokenMatch = lastUserContent.match(/^\s*<@a:([^>\s]+)>/)
    const legacyText = lastUserContent.replace(/<@[^>\n]+>/g, ' ')
    const legacyMentionMatch = legacyText.match(/^\s*@([A-Za-z0-9._-]{1,100})/i)
    const mentionAgentId = tokenMatch ? String(tokenMatch[1] || '').trim() : ''
    const mentionHandle = legacyMentionMatch ? String(legacyMentionMatch[1] || '').trim() : ''
    if (mentionAgentId) {
      const agent = agentById.get(mentionAgentId) ?? null
      const p = resolveAgentPresentationFromAgent(agent)
      if (p) return { ...p, strategy: 'lastUser.<@a:id>' as const, mentionAgentId }
    }
    if (mentionHandle) {
      const lower = mentionHandle.toLowerCase()
      const agent =
        conversationAgents.find(a => {
          const slug = typeof (a as any)?.slug === 'string' ? String((a as any).slug).toLowerCase() : ''
          const name = typeof (a as any)?.name === 'string' ? String((a as any).name).toLowerCase() : ''
          return (slug && slug === lower) || (name && name === lower)
        }) ?? null
      const p = resolveAgentPresentationFromAgent(agent)
      if (p) return { ...p, strategy: 'lastUser.@handle' as const, mentionAgentId: '' }
    }

    // 3) Fallback: previous logic (last assistant / fallback agent)
    const lastAssistant = [...renderMessages].reverse().find(m => (m as any)?.role === 'assistant') as ExtendedMessage | undefined
    const p = resolveAssistantPresentation(lastAssistant) || { displayName: fallbackAgentDisplayName || 'Assistant', slug: undefined, avatarUrl: undefined }
    return {
      displayName: (p.displayName || fallbackAgentDisplayName || 'Assistant').trim() || 'Assistant',
      slug: p.slug,
      avatarUrl: p.avatarUrl,
      strategy: 'fallback' as const,
      mentionAgentId: '',
    }
  }, [activeTurnId, agentById, conversationAgents, fallbackAgentDisplayName, renderMessages, resolveAgentPresentationFromAgent, resolveAssistantPresentation, turnUsageByTurnId])

  const gapLoaderLoggedKeyRef = useRef<string | null>(null)
  useEffect(() => {
    if (!shouldShowGapLoader) {
      gapLoaderLoggedKeyRef.current = null
      return
    }
    const key = `${String(conversationId ?? 'none')}|${String(activeTurnId ?? 'none')}|${String(activeTurnStatus ?? 'none')}`
    if (gapLoaderLoggedKeyRef.current === key) return
    gapLoaderLoggedKeyRef.current = key
  }, [
    activeTurnId,
    activeTurnStatus,
    conversationId,
    fallbackAgentDisplayName,
    isAssistantStreaming,
    isAwaitingAssistant,
    isAwaitingToolResults,
    renderMessages,
    resolveAssistantPresentation,
    shouldShowGapLoader,
    turnUsageByTurnId,
  ])

  const activeThreadParentMessageId = useMemo(() => {
    const tid = typeof activeThreadConversationId === 'string' ? activeThreadConversationId.trim() : ''
    if (!tid) return null
    for (const m of renderMessages) {
      const anyMsg = m as unknown as { linkedConversationId?: unknown; linked_conversation_id?: unknown }
      const raw = anyMsg?.linkedConversationId ?? anyMsg?.linked_conversation_id
      const linked = typeof raw === 'string' && raw.trim().length > 0 ? raw.trim() : ''
      if (linked && linked === tid) return m.id
    }
    return null
  }, [activeThreadConversationId, renderMessages])

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

  const lastAutoScrollThreadIdRef = useRef<string | null>(null)
  const threadOpenAutoScrollTimeoutRef = useRef<number | null>(null)
  useLayoutEffect(() => {
    // When the thread pane opens, the main pane shrinks which can reflow text and
    // push the clicked "thread card" message out of view. Best-effort: scroll the
    // linked parent message back into the viewport once per thread open.
    const tid = typeof activeThreadConversationId === 'string' ? activeThreadConversationId.trim() : ''
    if (!tid) return
    if (lastAutoScrollThreadIdRef.current === tid) return

    const messageId = typeof activeThreadParentMessageId === 'string' ? activeThreadParentMessageId : ''
    if (!messageId) return

    const container = scrollContainerRef.current
    if (!container) return

    // Prefer scrolling the *thread card* into view (it sits below the message content),
    // because centering a very tall message can still leave the card near the bottom edge.
    const cardEl = container.querySelector(`[data-thread-linked-conversation-id="${CSS.escape(tid)}"]`) as HTMLElement | null
    const el = cardEl ?? messageRefs.current[messageId]
    if (!el) return

    const runScroll = (behavior: ScrollBehavior) => {
      // Defer to next frame so layout reflow from pane resize is applied.
      requestAnimationFrame(() => {
        const c = scrollContainerRef.current
        const node = (c ? (c.querySelector(`[data-thread-linked-conversation-id="${CSS.escape(tid)}"]`) as HTMLElement | null) : null) ?? messageRefs.current[messageId]
        if (!c || !node) return

        const cRect = c.getBoundingClientRect()
        const r = node.getBoundingClientRect()
        const pad = 16
        const fullyVisible = r.top >= cRect.top + pad && r.bottom <= cRect.bottom - pad
        // On thread-open we prefer centering the thread card even if it's already visible,
        // to avoid it drifting out of view after the pane shrink/reflow.
        if (!fullyVisible || Boolean(enableChannelMessageThreads && activeThreadConversationId)) {
          // Avoid `scrollIntoView()` here: it can scroll the *page* instead of the message list container,
          // and some browsers clamp "center" in surprising ways. Compute a target scrollTop ourselves.
          try {
            const currentTop = c.scrollTop
            const deltaTop = r.top - cRect.top
            const desired = currentTop + deltaTop - (c.clientHeight / 2 - r.height / 2)
            const maxTop = Math.max(0, c.scrollHeight - c.clientHeight)
            const nextTop = Math.max(0, Math.min(maxTop, desired))
            // Update the "stick to bottom" lock immediately so we don't auto-snap back down
            // after we perform this targeted scroll (e.g. on hard reload with `?thread=` open).
            isNearBottomRef.current = nextTop + c.clientHeight >= c.scrollHeight - SCROLL_THRESHOLD_PX
            c.scrollTo({ top: nextTop, behavior })
          } catch {
            /* ignore */
          }
        }
      })
    }

    // Cancel any prior scheduled correction.
    if (threadOpenAutoScrollTimeoutRef.current != null) {
      window.clearTimeout(threadOpenAutoScrollTimeoutRef.current)
      threadOpenAutoScrollTimeoutRef.current = null
    }

    // 1) Immediate best-effort scroll after the first reflow.
    runScroll('smooth')

    // 2) Correction scroll after the thread pane width transition completes (layout keeps shifting during the 300ms animation).
    // This prevents occasional mis-calculation when we measure mid-transition.
    threadOpenAutoScrollTimeoutRef.current = window.setTimeout(() => {
      threadOpenAutoScrollTimeoutRef.current = null
      runScroll('auto')
      lastAutoScrollThreadIdRef.current = tid
    }, 320)

    return () => {
      if (threadOpenAutoScrollTimeoutRef.current != null) {
        window.clearTimeout(threadOpenAutoScrollTimeoutRef.current)
        threadOpenAutoScrollTimeoutRef.current = null
      }
    }
  }, [activeThreadConversationId, activeThreadParentMessageId])

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
      // During thread-open, avoid overriding the targeted "scroll linked card into view" behavior in the main pane.
      if (enableChannelMessageThreads && activeThreadConversationId && lastAutoScrollThreadIdRef.current !== activeThreadConversationId) {
        return
      }
      const messagesIncreased = displayMessages.length > lastMessageCountRef.current
      const requestedBehavior: ScrollBehavior = messagesIncreased ? 'auto' : isActivelyStreaming ? 'auto' : 'smooth'

      // Use requestAnimationFrame for smooth scrolling
      requestAnimationFrame(() => {
        if (!scrollContainerRef.current) return
        const c2 = scrollContainerRef.current
        const targetTop = c2.scrollHeight
        c2.scrollTo({
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
        agentName:
          msg.role === 'assistant'
            ? (() => {
                const mid = typeof (msg as any)?.agentId === 'string' ? String((msg as any).agentId).trim() : ''
                const agent = mid ? agentById.get(mid) : undefined
                const roleFromAgent = typeof (agent as any)?.role === 'string' ? String((agent as any).role).trim() : ''
                const nameFromMsg = typeof (msg as any)?.agentName === 'string' ? String((msg as any).agentName).trim() : ''
                const nameFallback =
                  nameFromMsg ||
                  (agent ? (typeof (agent as any)?.name === 'string' ? String((agent as any).name).trim() : '') : '') ||
                  (agent ? (typeof (agent as any)?.slug === 'string' ? String((agent as any).slug).trim() : '') : '') ||
                  (mid ? `Agent ${mid.slice(0, 6)}` : '') ||
                  fallbackAgentDisplayName ||
                  'Assistant'
                return (formatAgentNameWithRole(nameFallback, roleFromAgent) || nameFallback || fallbackAgentDisplayName || 'Assistant').trim()
              })()
            : undefined,
      })
      firstIndexInPositions += count
    }
    return results
  }, [agentById, fallbackAgentDisplayName, normalizedHighlightTerm, renderMessages])

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

  // Prevent a brief "channel hero" flash while messages are still hydrating on reload.
  // On first paint, `renderMessages` can be empty while the stream query is loading; at that moment
  // `hasMoreBefore` is also not yet meaningful, which makes the hero incorrectly render.
  //
  // NOTE: `renderMessages` may include `pinnedFirstMessage` (thread context) even when the thread's
  // own stream messages haven't hydrated yet. Use `displayMessages` (stream-derived) to decide whether
  // the timeline is actually hydrated, otherwise we can briefly render ONLY the pinned message.
  // IMPORTANT:
  // The streamed conversation query keeps an SSE connection open; TanStack Query can report `isFetching=true`
  // for the lifetime of that connection. If we treat `isFetching && messages.length===0` as "still loading",
  // an empty-but-valid channel will look stuck in a loading state forever.
  //
  // Instead, key off whether we have received at least one snapshot event. A snapshot can legitimately contain
  // zero messages (new channel), which should show the empty hero state.
  const hasStreamSnapshot = Boolean((stream as any)?.hasSnapshot)
  const isHydratingInitialMessages = Boolean(
    !messagesOverride && stream && !hasStreamSnapshot && (Boolean((stream as any)?.isLoading) || Boolean((stream as any)?.isFetching)) && displayMessages.length === 0
  )

  // Only show the "beginning of channel / conversation" hero when we are actually at the beginning of the timeline.
  // If there are older messages available (pagination / "load older"), do NOT render the hero yet.
  const isAtConversationStart = (() => {
    // Static/demo rendering: treat "start" as empty list only.
    if (messagesOverride) return renderMessages.length === 0
    // Streamed conversations: start == no more older pages.
    if (stream) return !Boolean((stream as any)?.hasMoreBefore)
    return renderMessages.length === 0
  })()
  const isChildConversation = Boolean((conversationDetail as any)?.parentConversationId)
  const showChannelHero = Boolean(enableChannelMessageThreads && !pinnedFirstMessage && isAtConversationStart && !isHydratingInitialMessages)
  // Direct messages: keep the hero visible even after messages exist, but only once we've reached the beginning (Slack-like).
  const showDirectMessageHero = Boolean(!enableChannelMessageThreads && !pinnedFirstMessage && !isChildConversation && isAtConversationStart && !isHydratingInitialMessages)
  const shouldBottomAlignHero = Boolean((showChannelHero || showDirectMessageHero) && renderMessages.length === 0 && !shouldShowGapLoader)

  const hasSearchMatches = matchingPositions.length > 0
  // Search input UI intentionally disabled for now.
  const showSearchBar = false
  const currentMatchMessageId = hasSearchMatches ? matchingPositions[currentMatchIndex]?.messageId : null

  function InitialMessageSkeletons() {
    // Skeleton rows should match the real "app layout" message rows:
    // left avatar slot (40px) + monospace display name + markdown content (no right-aligned bubbles).
    const skLine = 'bg-foreground/5 dark:bg-foreground/10'
    const skAvatar = 'bg-foreground/5 dark:bg-foreground/10 ring-1 ring-border/30'
    const Row = ({ variant, topMarginClass }: { variant: 'assistant' | 'user'; topMarginClass: string }) => {
      const nameWidthClass = variant === 'assistant' ? 'w-40' : 'w-28'
      return (
        <div className={cn('flex justify-start w-full', topMarginClass)}>
          <div className={cn('group relative flex flex-1 min-w-0 items-start gap-3 w-full max-w-full rounded-lg px-2 -mx-2', 'py-0')}>
            <div className="flex-shrink-0 mt-1" style={{ width: 40, height: 40 }} aria-hidden="true">
              <Skeleton className={cn('w-10 h-10 rounded-full', skAvatar)} />
            </div>
            <div className="min-w-0 flex-1 w-full pt-0.5">
              <div className="mb-1.5">
                <Skeleton className={cn('h-4', nameWidthClass, skLine)} />
              </div>
              <div className="space-y-2">
                <Skeleton className={cn('h-4 w-[82%]', skLine)} />
                <Skeleton className={cn('h-4 w-[68%]', skLine)} />
                <Skeleton className={cn('h-4 w-[54%]', skLine)} />
              </div>
            </div>
          </div>
        </div>
      )
    }

    return (
      <div className="pb-6">
        <Row variant="assistant" topMarginClass="mt-6" />
        <Row variant="user" topMarginClass="mt-4" />
        <Row variant="assistant" topMarginClass="mt-4" />
      </div>
    )
  }

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
        style={{ paddingBottom: shouldBottomAlignHero ? 32 : (bottomPaddingPx ?? 160) }}
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
            {isHydratingInitialMessages ? (
              <InitialMessageSkeletons />
            ) : (
              <>
                {showChannelHero ? (
                  <ChannelHero
                    channelName={channelName}
                    conversationTitle={typeof (conversationDetail as any)?.title === 'string' ? String((conversationDetail as any).title) : null}
                    bottomAlign={shouldBottomAlignHero}
                  />
                ) : null}
                {showDirectMessageHero ? (
                  <DirectMessageHero
                    title={resolvedEmptyHeroTitle}
                    participant={resolvedEmptyHeroParticipant ?? null}
                    avatarUrlByAttachmentId={emptyHeroAvatarUrlById}
                    bottomAlign={shouldBottomAlignHero}
                  />
                ) : null}
                {renderMessages.map((message, idx) => {
                  const prev = idx > 0 ? (renderMessages[idx - 1] as ExtendedMessage) : null
                  const next = idx < renderMessages.length - 1 ? (renderMessages[idx + 1] as ExtendedMessage) : null
                  const messageDateKey = getMessageDateKey(message)
                  const prevDateKey = getMessageDateKey(prev)
                  const dateLabel = messageDateKey && messageDateKey !== prevDateKey ? getMessageDateLabel(message) : null
                  const timeGapBreaksGroup = hasGroupTimeGap(prev, message)
                  const showAssistantAvatar = message.role !== 'assistant' ? true : !(prev && prev.role === 'assistant' && !timeGapBreaksGroup)
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
                  const assistantKey = (m: any): string | null => {
                    if (!m || String(m?.role ?? '') !== 'assistant') return null
                    // Don't treat tool_result rows as part of an assistant "turn" for spacing.
                    if (String(m?.messageType ?? '') === 'tool_result') return null
                    const turnId = typeof m?.turnId === 'string' ? String(m.turnId).trim() : ''
                    if (turnId) return `turn:${turnId}`
                    const agentId = typeof m?.agentId === 'string' ? String(m.agentId).trim() : ''
                    if (agentId) return `agent:${agentId}`
                    const agentName = typeof m?.agentName === 'string' ? String(m.agentName).trim() : ''
                    if (agentName) return `name:${agentName}`
                    return 'unknown'
                  }
                  const prevUserKey = prev ? userKey(prev) : null
                  const currUserKey = userKey(message)
                  const nextUserKey = next ? userKey(next) : null
                  const isConsecutiveUser = Boolean(currUserKey && prevUserKey && currUserKey === prevUserKey && !timeGapBreaksGroup)
                  const isNextConsecutiveUser = Boolean(currUserKey && nextUserKey && currUserKey === nextUserKey && !hasGroupTimeGap(message, next))
                  // When a user "turn" spans multiple messages, render *all* messages in that run using the compact
                  // message chrome so the spacing/padding is consistent (including the first message in the run).
                  const compactUserGroup = Boolean(currUserKey && (isConsecutiveUser || isNextConsecutiveUser))
                  const prevAssistantKey = prev ? assistantKey(prev) : null
                  const currAssistantKey = assistantKey(message)
                  const nextAssistantKey = next ? assistantKey(next) : null
                  const isConsecutiveAssistant = Boolean(currAssistantKey && prevAssistantKey && currAssistantKey === prevAssistantKey && !timeGapBreaksGroup)
                  const isNextConsecutiveAssistant = Boolean(currAssistantKey && nextAssistantKey && currAssistantKey === nextAssistantKey && !hasGroupTimeGap(message, next))
                  const compactAssistantGroup = Boolean(currAssistantKey && (isConsecutiveAssistant || isNextConsecutiveAssistant))
                  const startsNewGroup = (() => {
                    if (!prev) return false
                    if (message.role === 'assistant') return Boolean(showAssistantAvatar)
                    if (message.role === 'user') return !isConsecutiveUser
                    return prev.role !== message.role
                  })()
                  const isFirstMessage = idx === 0
                  const messageHasMatch = Boolean(highlightTerm && messageIdsWithMatch.has(message.id))
                  const isCurrentMatch = message.id === currentMatchMessageId
                  let assistant = resolveAssistantPresentation(message)
                  const streamish =
                    message.role === 'assistant' && (message as any)?.streaming === true && typeof (message as any)?.id === 'string' && String((message as any).id).startsWith('stream-')
                  const msgTurnId = typeof (message as any)?.turnId === 'string' ? String((message as any).turnId) : ''
                  if (streamish && activeTurnId && msgTurnId && msgTurnId === activeTurnId && gapLoaderPresentation) {
                    const base =
                      assistant ||
                      ({
                        displayName: (fallbackAgentDisplayName || 'Assistant').trim() || 'Assistant',
                        slug: undefined,
                        avatarUrl: undefined,
                        modelId: undefined,
                        maxTokens: undefined,
                        role: undefined,
                        version: undefined,
                        category: undefined,
                        publicationStatus: undefined,
                        assignedToolSlugs: undefined,
                        createdAt: undefined,
                        updatedAt: undefined,
                      } as const)
                    assistant = {
                      ...base,
                      displayName: gapLoaderPresentation.displayName,
                      slug: gapLoaderPresentation.slug,
                      avatarUrl: gapLoaderPresentation.avatarUrl,
                    }
                  }

                  return (
                    <Fragment key={message.id}>
                      {dateLabel && <MessageDateDivider label={dateLabel} />}
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
                          conversationId={conversationId}
                          agentName={assistant?.displayName}
                          agentSlug={assistant?.slug}
                          agentRole={assistant?.role}
                          agentVersion={assistant?.version}
                          agentCategory={assistant?.category}
                          agentAssignedToolCount={Array.isArray(assistant?.assignedToolSlugs) ? assistant?.assignedToolSlugs.length : undefined}
                          agentCreatedAt={assistant?.createdAt}
                          agentUpdatedAt={assistant?.updatedAt}
                          starshipSlug={starshipSlug}
                          agentAvatarUrl={assistant?.avatarUrl}
                          agentModelId={assistant?.modelId}
                          agentMaxTokens={assistant?.maxTokens}
                          isStreamingActive={message.id === activeRenderedStreamingAssistantId}
                          starshipId={starshipId}
                          enableChannelMessageThreads={enableChannelMessageThreads}
                          onThreadAction={handleThreadAction}
                          showAssistantAvatar={showAssistantAvatar}
                          isConsecutiveUser={isConsecutiveUser}
                          compactUserGroup={compactUserGroup}
                          compactAssistantGroup={compactAssistantGroup}
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
                          expertMode={expertMode}
                          activeThreadConversationId={activeThreadConversationId ?? null}
                          turnUsage={(() => {
                            if (!expertMode) return null
                            if (message.role !== 'assistant') return null
                            const tid = typeof (message as any)?.turnId === 'string' ? String((message as any).turnId) : ''
                            if (!tid) return null
                            const raw = (turnUsageByTurnId?.[tid] ?? null) as any
                            if (!raw) return null
                            // Avoid showing partial/in-progress usage for the currently active turn.
                            // This fixes the "stream value inaccurate, refresh correct" UX: we only display once final.
                            // Robust gating:
                            // - Prefer terminal turn status when we have it.
                            // - But if the client misses the terminal `turn.status` event (SSE drop/reconnect edge cases),
                            //   `activeTurnStatus` can remain "active" even though the UI is no longer responding.
                            //   In that case, allow the ring to render once `isResponding` is false.
                            const shouldHide = Boolean(activeTurnId && tid === activeTurnId && !isTerminalTurnStatus && isResponding)
                            if (shouldHide) return null
                            return raw
                          })()}
                          isUserOnline={presence.isUserOnline}
                          isConversationBusy={isConversationBusy}
                          presenceRevision={presence.dataUpdatedAt}
                        />
                        {(() => {
                          const widgets = message.role === 'assistant' && message.messageType !== 'tool_result' ? extractWidgetResults((message as ExtendedMessage).uiActions) : []
                          if (widgets.length === 0) return null
                          return (
                            <div className="flex justify-start">
                              <div className="flex items-start gap-3 w-full max-w-full -mx-2 px-2">
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
              </>
            )}

            {/* Gap loader: show while awaiting first assistant text OR between tool results and next assistant text */}
            {/* Await banner: show when workflow paused waiting for external event */}
            {Boolean(isAwaitingToolResults && awaitRequested && awaitRequested.kind === 'connector_event') && (
              <div className={cn('flex justify-start w-full', sizeVariant === 'delegation' ? 'mt-2' : 'mt-4')}>
                <div className="group relative flex flex-1 min-w-0 items-start gap-3 w-full max-w-full rounded-lg px-2 -mx-2 py-1.5">
                  <div className="flex-shrink-0 mt-1 w-10 h-10 flex items-center justify-center rounded-full bg-muted/60">
                    <Icon name="clock" className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <div className="min-w-0 flex-1 pt-0.5">
                    <div className="text-sm font-bold text-foreground">Waiting for connector event</div>
                    <div className="text-sm text-muted-foreground mt-0.5">
                      {(() => {
                        const spec = awaitRequested?.spec ?? {}
                        const provider = typeof (spec as any)?.provider === 'string' ? String((spec as any).provider) : ''
                        const connectorId = typeof (spec as any)?.connectorId === 'string' ? String((spec as any).connectorId) : ''
                        const eventTypesRaw = (spec as any)?.eventTypes
                        const eventTypes = Array.isArray(eventTypesRaw) ? eventTypesRaw.map((x: any) => String(x)).filter(Boolean) : []
                        const parts: string[] = []
                        if (provider) parts.push(`provider=${provider}`)
                        if (connectorId) parts.push(`connectorId=${connectorId}`)
                        if (eventTypes.length > 0) parts.push(`eventTypes=${eventTypes.join(',')}`)
                        return parts.length > 0 ? parts.join(' • ') : 'Waiting for any connector event...'
                      })()}
                    </div>
                  </div>
                </div>
              </div>
            )}
            {shouldShowGapLoader && (
              <div className={cn('flex justify-start w-full', sizeVariant === 'delegation' ? 'mt-2' : 'mt-4')}>
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
                  <div className={cn('group relative flex flex-1 min-w-0 items-start gap-3 w-full max-w-full rounded-lg px-2 -mx-2', 'py-0')}>
                    {(() => {
                      // Must match `AgentAvatarWithTurnUsageRing`'s `pad` so gap loader aligns with normal assistant rows in expert mode.
                      const usageRingPadPx = 3
                      const avatarSlotPadPx = Boolean(expertMode) ? usageRingPadPx * 2 : 0
                      const avatarSlotPx = 40 + avatarSlotPadPx
                      const p = gapLoaderPresentation || { displayName: fallbackAgentDisplayName || 'Assistant', slug: undefined, avatarUrl: undefined }
                      return (
                        <div className="flex-shrink-0 mt-1" style={{ width: avatarSlotPx, height: avatarSlotPx }}>
                          <AgentAvatarWithTurnUsageRing
                            seed={p.displayName || 'AI'}
                            imageUrl={p.avatarUrl}
                            modelIdOverride={null}
                            tokenLimitOverride={null}
                            size={40}
                            rounded
                            enabled={Boolean(expertMode)}
                            usage={null}
                            busy={true}
                            className="mx-auto"
                          />
                        </div>
                      )
                    })()}
                    <div className="min-w-0 flex-1 pt-0.5">
                      <div className="mb-0 text-sm font-bold text-foreground">
                        {(() => {
                          const p = gapLoaderPresentation || { displayName: fallbackAgentDisplayName || 'Assistant', slug: undefined, avatarUrl: undefined }
                          const label = (p.displayName || fallbackAgentDisplayName || 'Assistant').trim()
                          const slug = p.slug
                          return typeof starshipSlug === 'string' && starshipSlug.trim().length > 0 && typeof slug === 'string' && slug.trim().length > 0 ? (
                            <Link href={`/ship/${encodeURIComponent(starshipSlug)}/agent/${encodeURIComponent(slug)}`} className="font-mono hover:underline underline-offset-2">
                              {label}
                            </Link>
                          ) : (
                            <span className="font-mono">{label}</span>
                          )
                        })()}
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
  /** Parent conversation id (required for reaction toggles + optimistic cache patching). */
  conversationId: string | null
  agentName?: string
  agentSlug?: string
  agentRole?: string
  agentVersion?: string
  agentCategory?: string
  agentAssignedToolCount?: number
  agentCreatedAt?: string
  agentUpdatedAt?: string
  starshipSlug?: string
  agentAvatarUrl?: string
  /** Agent configured model id (fallback when provider usage omits model). */
  agentModelId?: string
  /** Agent maxTokens (internal per-turn budget / cap). */
  agentMaxTokens?: number
  isStreamingActive?: boolean
  starshipId?: string
  enableChannelMessageThreads?: boolean
  onThreadAction?: (args: { messageId: string; linkedConversationId: string | null; messageText?: string; linkedMessage?: MessageModel | null }) => void
  showAssistantAvatar?: boolean
  /** True when the previous rendered message row was also a user message. */
  isConsecutiveUser?: boolean
  /**
   * When true, render user-message chrome in compact mode even if it's the first message
   * in a multi-message user run (so the entire run stacks tightly).
   */
  compactUserGroup?: boolean
  /**
   * When true, render assistant-message chrome in compact mode even if it's the first message
   * in a multi-message assistant run (so the entire run stacks tightly).
   */
  compactAssistantGroup?: boolean
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
  /** Expert-mode UX: show per-turn context ring around agent avatar. */
  expertMode?: boolean
  /** UX-only usage for this message's turn (if available). */
  turnUsage?: TurnUsageForRing | null
  /** Presence lookup (starship-scoped). */
  isUserOnline?: (userId: string) => boolean
  /** Conversation-scoped "busy" indicator (active or waiting_for_tools). */
  isConversationBusy?: boolean
  /** When set, highlight this row if it links to the active thread. */
  activeThreadConversationId?: string | null
  /**
   * Monotonic revision to force memoized bubbles to re-render when presence changes.
   * (e.g. TanStack Query `dataUpdatedAt` from `useStarshipPresence`).
   */
  presenceRevision?: number
}

const HIGHLIGHT_TERM_MAX_LENGTH = 200
const GROUP_TIME_GAP_MS = 60 * 1000

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

function getMessageTimestampMs(message: any): number | null {
  if (!message) return null
  const raw = message?.createdAt ?? message?.updatedAt
  const t = typeof raw === 'string' ? Date.parse(raw) : NaN
  return Number.isFinite(t) ? t : null
}

function hasGroupTimeGap(prev: any, curr: any): boolean {
  const prevMs = getMessageTimestampMs(prev)
  const currMs = getMessageTimestampMs(curr)
  if (prevMs == null || currMs == null) return false
  return currMs - prevMs >= GROUP_TIME_GAP_MS
}

function getMessageDateKey(message: any): string | null {
  const raw = message?.createdAt ?? message?.updatedAt
  if (typeof raw !== 'string' || raw.trim() === '') return null
  const parsed = parseISO(raw)
  if (Number.isNaN(parsed.getTime())) return null
  return formatDay(parsed, 'yyyy-MM-dd')
}

function getMessageDateLabel(message: any): string | null {
  const raw = message?.createdAt ?? message?.updatedAt
  if (typeof raw !== 'string' || raw.trim() === '') return null
  const parsed = parseISO(raw)
  if (Number.isNaN(parsed.getTime())) return null
  if (isToday(parsed)) return 'Today'
  if (isYesterday(parsed)) return 'Yesterday'
  return formatDay(parsed, 'MMM d, yyyy')
}

function MessageDateDivider({ label }: { label: string }) {
  return (
    <div className="my-4 flex items-center gap-3">
      <div className="h-px flex-1 bg-border/60" />
      <div className="rounded-full border border-border/60 bg-muted/40 px-3 py-0.5 text-xs font-medium text-muted-foreground">
        {label}
      </div>
      <div className="h-px flex-1 bg-border/60" />
    </div>
  )
}

function MessageTimestamp({ value, isEdited = false }: { value?: string | null; isEdited?: boolean }) {
  if (!value || typeof value !== 'string' || value.trim().length === 0) return null
  return (
    <div className="inline-flex shrink-0 whitespace-nowrap items-center gap-1.5 text-[11px] text-foreground/65 leading-none">
      <time dateTime={value} title={formatDate(value)}>
        <span className="tabular-nums leading-none text-foreground/70">{formatTime(value)}</span>
      </time>
      {isEdited ? (
        <span className="ml-1 inline-flex items-center gap-1 text-[10px] tracking-wide text-foreground/55 leading-none">
          <Icon name="edit" className="h-3 w-3 align-middle" />
          edited
        </span>
      ) : null}
    </div>
  )
}

function isDeletedMessageContent(content: unknown): boolean {
  return typeof content === 'string' && content === DELETED_MESSAGE_MARKER
}

function isEditedMessage(message: { createdAt?: string; updatedAt?: string }): boolean {
  if (!message?.createdAt || !message?.updatedAt) return false
  const created = parseISO(message.createdAt)
  const updated = parseISO(message.updatedAt)
  if (Number.isNaN(created.getTime()) || Number.isNaN(updated.getTime())) return false
  return updated.getTime() - created.getTime() >= 1000
}

function getDeletedMessageLabel(isAuthedUserMessage: boolean): string {
  return isAuthedUserMessage ? 'Message deleted by you.' : 'Message deleted by user.'
}

function MessageMoreActions({
  messageId,
  disabled,
  canEdit,
  canDelete,
  isEditing,
  onStartEdit,
  onCancelEdit,
}: {
  messageId: string
  disabled?: boolean
  canEdit: boolean
  canDelete: boolean
  isEditing: boolean
  onStartEdit: () => void
  onCancelEdit: () => void
}) {
  const [deleteOpen, setDeleteOpen] = useState(false)
  const deleteMessage = useDeleteMessage()

  const canConfirmDelete = !deleteMessage.isPending

  if (disabled) return null

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7" aria-label="More options" title="More options">
            <Icon name="dots-horizontal" className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[180px]">
          <DropdownMenuItem
            onSelect={async e => {
              e.preventDefault()
              try {
                await navigator.clipboard.writeText(String(messageId))
              } catch {
                // ignore clipboard failures
              }
            }}
          >
            <Icon name="copy" className="h-4 w-4" />
            Copy message ID
          </DropdownMenuItem>
          {(canEdit || canDelete) && <DropdownMenuSeparator />}
          {canEdit ? (
            <DropdownMenuItem
              onSelect={e => {
                e.preventDefault()
                isEditing ? onCancelEdit() : onStartEdit()
              }}
            >
              <Icon name={isEditing ? 'x' : 'edit'} className="h-4 w-4" />
              {isEditing ? 'Cancel edit' : 'Edit message'}
            </DropdownMenuItem>
          ) : null}
          {canDelete ? (
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              disabled={isEditing}
              onSelect={e => {
                e.preventDefault()
                setDeleteOpen(true)
              }}
            >
              <Icon name="trash" className="h-4 w-4" />
              Delete message
            </DropdownMenuItem>
          ) : null}
          {!canEdit && !canDelete ? <DropdownMenuItem disabled>No other actions</DropdownMenuItem> : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={deleteOpen} onOpenChange={open => setDeleteOpen(open)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete message?</DialogTitle>
            <DialogDescription>This will replace the message with a deleted placeholder for everyone in the conversation.</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="ghost" onClick={() => setDeleteOpen(false)} disabled={deleteMessage.isPending}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={async () => {
                if (!canConfirmDelete) return
                try {
                  await deleteMessage.mutateAsync(messageId)
                  setDeleteOpen(false)
                } catch {
                  // Error toast handled in hook
                }
              }}
              disabled={!canConfirmDelete}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
    conversationId,
    agentName,
    agentSlug,
    agentRole,
    agentVersion,
    agentCategory,
    agentAssignedToolCount,
    agentCreatedAt,
    agentUpdatedAt,
    starshipSlug,
    agentAvatarUrl,
    agentModelId,
    agentMaxTokens,
    isStreamingActive,
    starshipId,
    enableChannelMessageThreads = false,
    onThreadAction,
    showAssistantAvatar = true,
    isConsecutiveUser = false,
    compactUserGroup = false,
    compactAssistantGroup = false,
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
    expertMode = false,
    turnUsage,
    isUserOnline,
    isConversationBusy = false,
    activeThreadConversationId,
    presenceRevision,
  }: ConversationMessageBubbleProps) {
    void presenceRevision
    const isHero = sizeVariant === 'hero'
    const isDelegation = sizeVariant === 'delegation'
    const avatarSize = isHero ? 40 : isDelegation ? 24 : 32
    // Must match `AgentAvatarWithTurnUsageRing`'s `pad`.
    // We reserve this width in expert mode so user/assistant rows share the same "avatar slot" width.
    const usageRingPadPx = 3
    const avatarClass = isHero ? 'w-10 h-10' : isDelegation ? 'w-6 h-6' : 'w-8 h-8'
    const avatarWidthClass = isHero ? 'w-10' : isDelegation ? 'w-6' : 'w-8'
    const contentTextClass = isHero ? 'text-base leading-relaxed prose' : undefined
    const isUser = message.role === 'user'
    const messageTimestamp =
      typeof message.updatedAt === 'string' && message.updatedAt.trim().length > 0
        ? message.updatedAt
        : typeof message.createdAt === 'string' && message.createdAt.trim().length > 0
          ? message.createdAt
          : null
    const { userId: authUserId } = useAuth()
    const sid = typeof starshipId === 'string' ? starshipId : ''
    const cid = typeof conversationId === 'string' ? conversationId : ''
    const { data: membersData } = useStarshipMembersAndInvites(sid, Boolean(sid))
    const memberByUserId = useMemo(() => {
      const list = Array.isArray((membersData as any)?.members) ? (((membersData as any).members as any[]) ?? []) : []
      const m = new Map<string, { displayName?: string | null; avatar?: string | null; email?: string | null; role?: string | null; createdAt?: string | null }>()
      for (const it of list) {
        const id = typeof it?.userId === 'string' ? String(it.userId).trim() : ''
        if (!id) continue
        m.set(id, {
          displayName: typeof it?.displayName === 'string' ? String(it.displayName) : null,
          avatar: typeof it?.avatar === 'string' ? String(it.avatar) : null,
          email: typeof it?.email === 'string' ? String(it.email) : null,
          role: typeof it?.role === 'string' ? String(it.role) : null,
          createdAt: typeof it?.createdAt === 'string' ? String(it.createdAt) : null,
        })
      }
      return m
    }, [membersData])

    const messageUserId = typeof (message as any)?.userId === 'string' ? String((message as any).userId).trim() : ''
    const isAuthedUserMessage = Boolean(messageUserId && authUserId && String(messageUserId) === String(authUserId))
    const fromDirectory = messageUserId ? memberByUserId.get(messageUserId) : null
    const messageUserName = typeof (message as any)?.userName === 'string' && String((message as any).userName).trim().length > 0 ? String((message as any).userName).trim() : undefined
    const messageUserAvatar = typeof (message as any)?.userAvatar === 'string' && String((message as any).userAvatar).trim().length > 0 ? String((message as any).userAvatar).trim() : undefined
    const isDeletedMessage = isDeletedMessageContent(message.content)
    const messageDisplayContent = isDeletedMessage ? getDeletedMessageLabel(isAuthedUserMessage) : message.content
    const showEditedLabel = !isDeletedMessage && isEditedMessage(message)
    const updateMessage = useUpdateMessage()
    const [isEditing, setIsEditing] = useState(false)
    const [editDraft, setEditDraft] = useState(String(message.content ?? ''))
    const trimmedEditDraft = editDraft.trim()
    const canSaveEdit = trimmedEditDraft.length > 0 && trimmedEditDraft !== String(message.content ?? '') && !updateMessage.isPending

    useEffect(() => {
      if (isEditing) return
      setEditDraft(String(message.content ?? ''))
    }, [isEditing, message.content])

    const directoryUserName = fromDirectory?.displayName?.trim() || '' || undefined
    const effectiveUserName = userNameOverride ?? messageUserName ?? directoryUserName ?? (isAuthedUserMessage ? 'You' : undefined)
    const effectiveUserEmail = userEmailOverride ?? undefined
    const effectiveUserAvatar = userAvatarUrlOverride ?? messageUserAvatar ?? (fromDirectory?.avatar?.trim() || '' || undefined) ?? undefined
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

    const isActiveThreadLink = Boolean(linkedConversationId && activeThreadConversationId && linkedConversationId === activeThreadConversationId)

    const avatarSlotPadPx = Boolean(expertMode) ? usageRingPadPx * 2 : 0
    const heroAvatarSlotPx = avatarSize + avatarSlotPadPx
    // In the normal app layout (non-hero), user avatars are rendered at 40px (w-10 h-10).
    // Reserve the same expert-mode padding so user/assistant rows have consistent content widths.
    const appAvatarSlotPx = 40 + avatarSlotPadPx

    const threadActionButton = useMemo(() => {
      if (!enableChannelMessageThreads) return null
      if (isDeletedMessage) return null
      // Only show on real messages (skip tool_result rows; they are not rendered here anyway)
      const label = linkedConversationId ? 'Open thread' : 'Start thread'
      return (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn('h-7 w-7', isActiveThreadLink && 'bg-primary/10 text-primary hover:bg-primary/15')}
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
    }, [enableChannelMessageThreads, isActiveThreadLink, isDeletedMessage, linkedConversationId, message.content, message.id, onThreadAction])

    const reactionActionButton = useMemo(() => {
      const id = typeof message.id === 'string' ? message.id : ''
      if (!id) return null
      if (isDeletedMessage) return null
      // Only for persisted messages in a real conversation.
      if (!cid) return null
      if (id.startsWith('temp-user-') || id.startsWith('stream-') || id.startsWith('ui-action:')) return null
      return <MessageReactionAction conversationId={cid} messageId={id} showQuick={true} />
    }, [cid, isDeletedMessage, message.id])

    const moreActionButton = useMemo(() => {
      const id = typeof message.id === 'string' ? message.id : ''
      if (!id) return null
      if (isDeletedMessage) return null
      const isEphemeral = id.startsWith('temp-user-') || id.startsWith('stream-') || id.startsWith('ui-action:')
      // Allow the menu even for ephemeral IDs (useful during streaming/sending), but disable edit/delete.
      const canEdit = Boolean(isUser && isAuthedUserMessage && !isEphemeral)
      const canDeleteMsg = Boolean(isUser && isAuthedUserMessage && !isEphemeral)
      return (
        <MessageMoreActions
          messageId={id}
          isEditing={isEditing}
          canEdit={canEdit}
          canDelete={canDeleteMsg}
          onStartEdit={() => {
            setEditDraft(String(message.content ?? ''))
            setIsEditing(true)
          }}
          onCancelEdit={() => setIsEditing(false)}
        />
      )
    }, [isAuthedUserMessage, isDeletedMessage, isEditing, isUser, message.content, message.id])

    const messageActionNodesBeforeCopy = useMemo(() => {
      if (!threadActionButton && !reactionActionButton) return null
      return (
        <>
          {reactionActionButton}
          {threadActionButton}
        </>
      )
    }, [reactionActionButton, threadActionButton])

    if (isUser) {
      const isConsecutiveSameUser = Boolean(isConsecutiveUser)
      // When the "user" is being overridden to represent an agent (e.g. Aria in landing demos),
      // prefer an explicitly-provided avatar URL (if any). Otherwise fall back to the seeded agent avatar.
      // Never fall back to the signed-in user's avatar when a seed override is present.
      const explicitUserAvatarUrl = userAvatarUrlOverride
      const shouldUseExplicitUserAvatar = isImageUrl(explicitUserAvatarUrl)
      const shouldUseResolvedUserAvatar = !userAvatarSeedOverride && isImageUrl(effectiveUserAvatar)
      const showUserOnline = Boolean(!userAvatarSeedOverride && messageUserId && isUserOnline?.(messageUserId))
      const showUserPresenceDot = Boolean(!userAvatarSeedOverride && messageUserId && isUserOnline)

      if (isHero || isDelegation) {
        // User message: Neutral bubble on the right (landing demos)
        // Keep spacing similar to assistant hero/delegation rows (avoid large inter-message gaps)
        // IMPORTANT: Avoid `mb-*` here; it creates unwanted gaps even when the next message is consecutive.
      const userRowClass = isDelegation ? cn('gap-2', isConsecutiveSameUser ? 'mt-0' : 'mt-4') : cn('gap-3', isConsecutiveSameUser ? 'mt-0' : 'mt-8')
        // Always use the compact bubble padding (no "normal" padding mode).
        const userBubbleClass = 'px-3 py-2'
        const userTextClass = isHero ? 'text-base' : 'text-sm'
        return (
          <div className="flex justify-end">
            <div className={cn('flex items-end w-full max-w-full', userRowClass)}>
              <div className="flex flex-1 flex-col gap-2 items-end ph-mask-chat-message">
                <div
                  className={cn(
                    'w-full max-w-full sm:max-w-[70%] bg-card text-card-foreground border border-border/60 shadow-sm rounded-2xl rounded-br-md relative',
                    userBubbleClass,
                    message.sending && 'opacity-70'
                  )}
                >
                  {isEditing ? (
                    <div className="space-y-2 mt-2">
                      <Textarea value={editDraft} onChange={e => setEditDraft(e.target.value)} className="min-h-[140px]" />
                      <div className="flex justify-end gap-2">
                        <Button type="button" variant="ghost" onClick={() => setIsEditing(false)} disabled={updateMessage.isPending}>
                          Cancel
                        </Button>
                        <Button
                          type="button"
                          onClick={async () => {
                            if (!canSaveEdit) return
                            try {
                              await updateMessage.mutateAsync({ messageId: message.id, content: trimmedEditDraft })
                              setIsEditing(false)
                            } catch {
                              // Error toast handled in hook
                            }
                          }}
                          disabled={!canSaveEdit}
                        >
                          Save
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className={cn('leading-relaxed whitespace-pre-wrap', userTextClass, isDeletedMessage && 'italic text-muted-foreground')}>
                      {renderTextWithHighlight(messageDisplayContent, highlightTerm)}
                    </div>
                  )}
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
                    isActiveThread={isActiveThreadLink}
                    enableChannelMessageThreads={enableChannelMessageThreads}
                    onThreadAction={onThreadAction}
                    message={message}
                    starshipId={starshipId}
                    isUserOnline={isUserOnline}
                  />
                )}
              </div>
              {isConsecutiveSameUser ? (
                // Only reserve width, not height (prevents "blank gap" under short consecutive messages)
                <div className="flex-shrink-0 mt-1" style={{ width: heroAvatarSlotPx }} aria-hidden="true" />
              ) : (
                <div className="relative flex-shrink-0 mb-1 flex items-center justify-center" style={{ width: heroAvatarSlotPx, height: heroAvatarSlotPx }}>
                  {/* Anchor presence to the actual avatar box, not the padded slot wrapper */}
                  <div className="relative" style={{ width: avatarSize, height: avatarSize }}>
                    <Avatar className={cn('rounded-full ring-1 ring-border/40 bg-primary/10 overflow-hidden', avatarClass)}>
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
                      ) : shouldUseResolvedUserAvatar ? (
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
                    <PresenceIndicator kind={showUserOnline ? 'online' : 'offline'} active={showUserPresenceDot} />
                  </div>
                </div>
              )}
            </div>
          </div>
        )
      }

      // User message: Render using the same engine as assistant messages (no bubble) - app layout
      const userDisplayName = (effectiveUserName || effectiveUserEmail || (messageUserId ? `User ${messageUserId.slice(0, 6)}` : 'User')).trim()
      const userProfileHref = isAuthedUserMessage && typeof starshipSlug === 'string' && starshipSlug.trim().length > 0 ? `/ship/${encodeURIComponent(starshipSlug)}/settings/my-profile` : null
      const authorLabel = (() => {
        if (!isAuthedUserMessage) return userDisplayName
        const detail = (userNameOverride ?? messageUserName ?? directoryUserName ?? '').trim()
        if (detail && detail.toLowerCase() !== 'you') return `You (${detail})`
        return 'You'
      })()
      const userHoverDetail = (userNameOverride ?? messageUserName ?? directoryUserName ?? '').trim()
      const userHoverTitle = isAuthedUserMessage ? 'You' : userDisplayName
      const emailForHover = (effectiveUserEmail || fromDirectory?.email || '').trim()
      const userHoverSub =
        (userHoverDetail && userHoverDetail !== userDisplayName ? userHoverDetail : '') ||
        (emailForHover && emailForHover !== userDisplayName ? emailForHover : '')
      const userIdShort = messageUserId ? `#${messageUserId.slice(0, 6)}` : ''
      const userPresenceLabel = showUserPresenceDot ? (showUserOnline ? 'Online' : 'Offline') : 'Unknown'
      const userRoleRaw = typeof fromDirectory?.role === 'string' ? fromDirectory.role : ''
      const userRoleLabel = userRoleRaw
        ? userRoleRaw === 'owner'
          ? 'Owner'
          : userRoleRaw === 'admin'
            ? 'Admin'
            : userRoleRaw === 'collaborator'
              ? 'Collaborator'
              : userRoleRaw
        : ''
      const userHoverCard = (
        <UserProfileHoverCardContent
          title={userHoverTitle}
          subtitle={userHoverSub || undefined}
          isAuthedUser={isAuthedUserMessage}
          explicitAvatarUrl={shouldUseExplicitUserAvatar ? explicitUserAvatarUrl : undefined}
          resolvedAvatarUrl={shouldUseResolvedUserAvatar ? effectiveUserAvatar : undefined}
          avatarSeed={userAvatarSeedOverride || undefined}
          fallbackInitials={initialsFromName(userHoverTitle || effectiveUserEmail)}
          fallbackVariant={fallbackVariant}
          userIdShort={userIdShort || undefined}
          email={emailForHover || undefined}
          roleLabel={userRoleLabel || undefined}
          memberSince={fromDirectory?.createdAt || undefined}
          statusLabel={userPresenceLabel}
        />
      )
      // When a user run is "compact" (multi-message turn), don't let the avatar height inflate the first row.
      // We keep the avatar visible, but overlay it so the row height is driven only by content.
      const overlayUserAvatar = Boolean(compactUserGroup && !isConsecutiveSameUser)

      return (
        <div className="flex justify-start w-full">
          <div
            className={cn(
              // Match assistant row layout: no outer vertical padding/margins (ConversationMessageContent controls spacing)
              'group relative flex flex-1 min-w-0 items-start gap-3 w-full max-w-full rounded-lg px-2 -mx-2',
              'py-0',
              // Keep a little top spacing when a user message starts a conversation chunk
              // (No negative margins; we handle tight stacking by not reserving avatar height below.)
              isConsecutiveSameUser ? 'mt-0' : 'mt-6'
            )}
          >
            {isConsecutiveSameUser ? (
              // Only reserve width, not height (prevents "inflated" spacing between short consecutive user messages)
              <div className="flex-shrink-0 mt-1" style={{ width: appAvatarSlotPx }} aria-hidden="true" />
            ) : overlayUserAvatar ? (
              // For compact user runs: reserve width only and overlay the avatar so it doesn't inflate row height.
              <>
                <div className="flex-shrink-0 mt-1" style={{ width: appAvatarSlotPx }} aria-hidden="true" />
                <div className="absolute left-2 top-1 flex items-center justify-center" style={{ width: appAvatarSlotPx, height: appAvatarSlotPx }}>
                  {/* Anchor presence to the actual avatar box, not the padded slot wrapper */}
                  <div className="relative w-10 h-10">
                    <Avatar className="w-10 h-10 rounded-full ring-1 ring-border/40 bg-primary/10 overflow-hidden">
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
                      ) : shouldUseResolvedUserAvatar ? (
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
                    <PresenceIndicator kind={showUserOnline ? 'online' : 'offline'} active={showUserPresenceDot} />
                  </div>
                </div>
              </>
            ) : (
              // Normal (non-compact) rows: render avatar in-flow so it reserves height (prevents overlap with next speaker).
              <div className="relative flex-shrink-0 mt-1 flex items-center justify-center" style={{ width: appAvatarSlotPx, height: appAvatarSlotPx }}>
                {/* Anchor presence to the actual avatar box, not the padded slot wrapper */}
                <div className="relative w-10 h-10">
                  <Avatar className="w-10 h-10 rounded-full ring-1 ring-border/40 bg-primary/10 overflow-hidden">
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
                    ) : shouldUseResolvedUserAvatar ? (
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
                  <PresenceIndicator kind={showUserOnline ? 'online' : 'offline'} active={showUserPresenceDot} />
                </div>
              </div>
            )}
            <div className="min-w-0 flex-1 w-full pt-0.5">
              {!isConsecutiveSameUser && (
                <div className="mb-0 flex min-w-0 flex-col items-start gap-0.5 sm:flex-row sm:items-center sm:gap-2">
                  <div className="min-w-0 text-sm font-bold font-mono text-foreground">
                    <HoverProfilePopover
                      trigger={
                        userProfileHref ? (
                          <Link href={userProfileHref} className="block max-w-full truncate hover:underline underline-offset-2">
                            {authorLabel}
                          </Link>
                        ) : (
                          <span className="block max-w-full truncate">{authorLabel}</span>
                        )
                      }
                      content={userHoverCard}
                      side="right"
                    />
                  </div>
                  <MessageTimestamp value={messageTimestamp} isEdited={showEditedLabel} />
                </div>
              )}
              {isEditing ? (
                <div className="space-y-2 mt-2">
                  <Textarea value={editDraft} onChange={e => setEditDraft(e.target.value)} className="min-h-[140px]" />
                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="ghost" onClick={() => setIsEditing(false)} disabled={updateMessage.isPending}>
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      onClick={async () => {
                        if (!canSaveEdit) return
                        try {
                          await updateMessage.mutateAsync({ messageId: message.id, content: trimmedEditDraft })
                          setIsEditing(false)
                        } catch {
                          // Error toast handled in hook
                        }
                      }}
                      disabled={!canSaveEdit}
                    >
                      Save
                    </Button>
                  </div>
                </div>
              ) : (
                <ConversationMessageContent
                  content={messageDisplayContent}
                  messageId={message.id}
                  enableMarkdown={true}
                  enableCopy={!isDeletedMessage}
                  extraActions={messageActionNodesBeforeCopy}
                  extraActionsAfterCopy={moreActionButton}
                  enableLinkPreview={true}
                  isStreaming={false}
                  // Always compact (no "normal" padding mode).
                  compact={true}
                  hasAuthorLine={!isConsecutiveSameUser}
                  className={cn('text-foreground/80', isDeletedMessage && 'italic text-muted-foreground')}
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
              )}
              {typeof starshipId === 'string' && starshipId.trim().length > 0 && !isDeletedMessage && (
                <MessageReactions
                  conversationId={cid}
                  starshipId={starshipId}
                  messageId={message.id}
                  reactions={(message as any)?.reactions}
                  disabled={typeof message.id !== 'string' || !cid || message.id.startsWith('temp-user-') || message.id.startsWith('stream-') || message.id.startsWith('ui-action:')}
                />
              )}
              {!suppressLinkedConversationCard && (
                <LinkedConversationCard
                  linkedConversationId={linkedConversationId}
                  linkedConversationHref={linkedConversationHref}
                  isActiveThread={isActiveThreadLink}
                  enableChannelMessageThreads={enableChannelMessageThreads}
                  onThreadAction={onThreadAction}
                  message={message}
                  starshipId={starshipId}
                  isUserOnline={isUserOnline}
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
      const assistantStatus = isConversationBusy ? 'Busy' : 'Available'
      const assistantUsageSummary = (() => {
        const u = turnUsage?.usage
        if (!u) return ''
        const total = Number(u.totalTokens ?? 0)
        if (!Number.isFinite(total) || total <= 0) return ''
        const cost = typeof u.cost === 'number' && Number.isFinite(u.cost) ? ` • $${u.cost.toFixed(2)}` : ''
        return `${total.toLocaleString()} tokens${cost}`
      })()
      const assistantHoverCard = (
        <AgentProfileHoverCardContent
          name={assistantDisplayName || 'Assistant'}
          avatarUrl={agentAvatarUrl}
          modelId={agentModelId}
          statusLabel={assistantStatus}
          roleLabel={agentRole}
          category={agentCategory}
          version={agentVersion}
          toolsCount={agentAssignedToolCount}
          lastTurnSummary={assistantUsageSummary || undefined}
          createdAt={agentCreatedAt}
          updatedAt={agentUpdatedAt}
        />
      )
      // Keep the avatar "slot" width stable across consecutive assistant messages.
      // When expert mode is on and we have turn usage, `AgentAvatarWithTurnUsageRing` renders an outer ring that adds padding.
      // If we don't reserve the extra width on *subsequent* messages (where the avatar is hidden), the first message in a turn
      // ends up slightly narrower.
      const shouldReserveUsageRing = Boolean(expertMode)
      const assistantAvatarBasePx = isHero || isDelegation ? avatarSize : 40
      const assistantAvatarSlotPx = assistantAvatarBasePx + (shouldReserveUsageRing ? usageRingPadPx * 2 : 0)

      if (isHero || isDelegation) {
        const assistantGap = isDelegation ? 'gap-2' : 'gap-3'
        return (
          <div className={cn('flex justify-start', startsNewGroup ? (isDelegation ? 'mt-2' : 'mt-4') : '')}>
            <div className={cn('relative flex items-start w-full', assistantGap)}>
              {showAssistantAvatar ? (
                compactAssistantGroup ? (
                  <>
                    <div className="flex-shrink-0 mt-1" style={{ width: assistantAvatarSlotPx }} aria-hidden="true" />
                    <div className="absolute left-0 top-1 flex items-center justify-center" style={{ width: assistantAvatarSlotPx, height: assistantAvatarSlotPx }}>
                      <AgentAvatarWithTurnUsageRing
                        seed={agentName || 'AI'}
                        imageUrl={agentAvatarUrl}
                        modelIdOverride={agentModelId ?? null}
                        tokenLimitOverride={typeof agentMaxTokens === 'number' ? agentMaxTokens : null}
                        size={avatarSize}
                        rounded
                        enabled={Boolean(expertMode)}
                        usage={turnUsage}
                        busy={Boolean(isConversationBusy)}
                        className={cn('mx-auto', avatarClass)}
                      />
                    </div>
                  </>
                ) : (
                  <div className="flex-shrink-0 mt-1" style={{ width: assistantAvatarSlotPx, height: assistantAvatarSlotPx }}>
                    <AgentAvatarWithTurnUsageRing
                      seed={agentName || 'AI'}
                      imageUrl={agentAvatarUrl}
                      modelIdOverride={agentModelId ?? null}
                      tokenLimitOverride={typeof agentMaxTokens === 'number' ? agentMaxTokens : null}
                      size={avatarSize}
                      rounded
                      enabled={Boolean(expertMode)}
                      usage={turnUsage}
                      busy={Boolean(isConversationBusy)}
                      className={cn('mx-auto', avatarClass)}
                    />
                  </div>
                )
              ) : (
                // Only reserve width, not height, so short consecutive assistant messages stack tightly.
                <div className="flex-shrink-0 mt-1" style={{ width: assistantAvatarSlotPx }} aria-hidden="true" />
              )}
              <div className="flex-1 w-full pt-0.5">
                <ConversationMessageContent
                  content={messageDisplayContent}
                  messageId={message.id}
                  enableMarkdown={true}
                  enableCopy={!isStreamingActive && !isDeletedMessage}
                  extraActions={messageActionNodesBeforeCopy}
                  extraActionsAfterCopy={moreActionButton}
                  enableLinkPreview={true}
                  isStreaming={!!isStreamingActive}
                  // Always compact (no "normal" padding mode).
                  compact={true}
                  hasAuthorLine={true}
                  className={cn('text-foreground', isDeletedMessage && 'italic text-muted-foreground')}
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
                {typeof starshipId === 'string' && starshipId.trim().length > 0 && !isDeletedMessage && (
                  <MessageReactions
                    conversationId={cid}
                    starshipId={starshipId}
                    messageId={message.id}
                    reactions={(message as any)?.reactions}
                    disabled={typeof message.id !== 'string' || !cid || message.id.startsWith('temp-user-') || message.id.startsWith('stream-') || message.id.startsWith('ui-action:')}
                  />
                )}
                {!suppressLinkedConversationCard && (
                  <LinkedConversationCard
                    linkedConversationId={linkedConversationId}
                    linkedConversationHref={linkedConversationHref}
                    isActiveThread={isActiveThreadLink}
                    enableChannelMessageThreads={enableChannelMessageThreads}
                    onThreadAction={onThreadAction}
                    message={message}
                    starshipId={starshipId}
                    isUserOnline={isUserOnline}
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
              'group relative flex flex-1 min-w-0 items-start gap-3 w-full max-w-full rounded-lg px-2 -mx-2',
              // Remove the outside vertical gap between consecutive message rows.
              'py-0',
              !showAssistantAvatar && '-mt-1'
            )}
          >
            {showAssistantAvatar ? (
              compactAssistantGroup ? (
                <>
                  <div className="flex-shrink-0 mt-1" style={{ width: assistantAvatarSlotPx }} aria-hidden="true" />
                  <div className="absolute left-2 top-1 flex items-center justify-center" style={{ width: assistantAvatarSlotPx, height: assistantAvatarSlotPx }}>
                    <AgentAvatarWithTurnUsageRing
                      seed={agentName || 'AI'}
                      imageUrl={agentAvatarUrl}
                      modelIdOverride={agentModelId ?? null}
                      tokenLimitOverride={typeof agentMaxTokens === 'number' ? agentMaxTokens : null}
                      size={40}
                      rounded
                      enabled={Boolean(expertMode)}
                      usage={turnUsage}
                      busy={Boolean(isConversationBusy)}
                      className="mx-auto"
                    />
                  </div>
                </>
              ) : (
                <div className="flex-shrink-0 mt-1" style={{ width: assistantAvatarSlotPx, height: assistantAvatarSlotPx }}>
                  <AgentAvatarWithTurnUsageRing
                    seed={agentName || 'AI'}
                    imageUrl={agentAvatarUrl}
                    modelIdOverride={agentModelId ?? null}
                    tokenLimitOverride={typeof agentMaxTokens === 'number' ? agentMaxTokens : null}
                    size={40}
                    rounded
                    enabled={Boolean(expertMode)}
                    usage={turnUsage}
                    busy={Boolean(isConversationBusy)}
                    className="mx-auto"
                  />
                </div>
              )
            ) : (
              // Only reserve width, not height, so short consecutive assistant messages stack tightly.
              <div className="flex-shrink-0 mt-1" style={{ width: assistantAvatarSlotPx }} aria-hidden="true" />
            )}
            <div className="min-w-0 flex-1 w-full pt-0.5">
              {showAssistantAvatar && (
                <div className="mb-0 flex min-w-0 flex-col items-start gap-0.5 sm:flex-row sm:items-center sm:gap-2">
                  <div className="min-w-0 text-sm font-bold text-foreground">
                    <HoverProfilePopover
                      trigger={
                        assistantProfileHref ? (
                          <Link href={assistantProfileHref} className="block max-w-full truncate font-mono hover:underline underline-offset-2">
                            {assistantDisplayName}
                          </Link>
                        ) : (
                          <span className="block max-w-full truncate font-mono">{assistantDisplayName}</span>
                        )
                      }
                      content={assistantHoverCard}
                      side="right"
                    />
                  </div>
                  <MessageTimestamp value={messageTimestamp} isEdited={showEditedLabel} />
                </div>
              )}
              <ConversationMessageContent
                content={messageDisplayContent}
                messageId={message.id}
                enableMarkdown={true}
                enableCopy={!isStreamingActive && !isDeletedMessage}
                extraActions={messageActionNodesBeforeCopy}
                extraActionsAfterCopy={moreActionButton}
                enableLinkPreview={true}
                isStreaming={!!isStreamingActive}
                // Always compact (no "normal" padding mode).
                compact={true}
                hasAuthorLine={Boolean(showAssistantAvatar)}
                className={cn('text-foreground/80', isDeletedMessage && 'italic text-muted-foreground')}
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
              {typeof starshipId === 'string' && starshipId.trim().length > 0 && !isDeletedMessage && (
                <MessageReactions
                  conversationId={cid}
                  starshipId={starshipId}
                  messageId={message.id}
                  reactions={(message as any)?.reactions}
                  disabled={typeof message.id !== 'string' || !cid || message.id.startsWith('temp-user-') || message.id.startsWith('stream-') || message.id.startsWith('ui-action:')}
                />
              )}
              {!suppressLinkedConversationCard && (
                <LinkedConversationCard
                  linkedConversationId={linkedConversationId}
                  linkedConversationHref={linkedConversationHref}
                  isActiveThread={isActiveThreadLink}
                  enableChannelMessageThreads={enableChannelMessageThreads}
                  onThreadAction={onThreadAction}
                  message={message}
                  starshipId={starshipId}
                  isUserOnline={isUserOnline}
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
    // Re-render when reactions change (otherwise pills update only when unrelated props change, e.g. presence).
    {
      const prevRx = (prevProps.message as any)?.reactions
      const nextRx = (nextProps.message as any)?.reactions
      if (prevRx !== nextRx) {
        return false
      }
    }
    // Re-render when expert mode toggles, since it affects avatar ring visibility.
    if (Boolean(prevProps.expertMode) !== Boolean(nextProps.expertMode)) return false
    // Presence and busy indicators are independent of message content.
    if (Boolean(prevProps.isConversationBusy) !== Boolean(nextProps.isConversationBusy)) return false
    if (String(prevProps.activeThreadConversationId ?? '') !== String(nextProps.activeThreadConversationId ?? '')) return false
    if (Number(prevProps.presenceRevision ?? 0) !== Number(nextProps.presenceRevision ?? 0)) return false
    {
      const prevAny = prevProps.message as unknown as { linkedConversationId?: unknown; linked_conversation_id?: unknown }
      const nextAny = nextProps.message as unknown as { linkedConversationId?: unknown; linked_conversation_id?: unknown }
      const prevLink = prevAny?.linkedConversationId ?? prevAny?.linked_conversation_id
      const nextLink = nextAny?.linkedConversationId ?? nextAny?.linked_conversation_id
      if (String(prevLink ?? '') !== String(nextLink ?? '')) return false
    }
    if ((prevProps.showAssistantAvatar ?? true) !== (nextProps.showAssistantAvatar ?? true)) return false
    if (Boolean(prevProps.isConsecutiveUser) !== Boolean(nextProps.isConsecutiveUser)) return false
    if (Boolean(prevProps.compactUserGroup) !== Boolean(nextProps.compactUserGroup)) return false
    if (Boolean(prevProps.compactAssistantGroup) !== Boolean(nextProps.compactAssistantGroup)) return false
    if (Boolean(prevProps.startsNewGroup) !== Boolean(nextProps.startsNewGroup)) return false
    if ((prevProps.isFirstMessage ?? false) !== (nextProps.isFirstMessage ?? false)) return false
    if (Boolean(prevProps.suppressLinkedConversationCard) !== Boolean(nextProps.suppressLinkedConversationCard)) return false

    // Re-render when agent label changes (post-reload agent restoration)
    if ((prevProps.agentName || '') !== (nextProps.agentName || '')) return false
    if ((prevProps.agentRole || '') !== (nextProps.agentRole || '')) return false
    if ((prevProps.agentVersion || '') !== (nextProps.agentVersion || '')) return false
    if ((prevProps.agentCategory || '') !== (nextProps.agentCategory || '')) return false
    if (Number(prevProps.agentAssignedToolCount ?? 0) !== Number(nextProps.agentAssignedToolCount ?? 0)) return false
    if ((prevProps.agentCreatedAt || '') !== (nextProps.agentCreatedAt || '')) return false
    if ((prevProps.agentUpdatedAt || '') !== (nextProps.agentUpdatedAt || '')) return false

    // Re-render if the agent avatar URL changes (e.g. after attachments load)
    if ((prevProps.agentAvatarUrl || '') !== (nextProps.agentAvatarUrl || '')) return false

    // Re-render when agent model/maxTokens metadata loads (affects turn-usage ring computation).
    if ((prevProps.agentModelId || '') !== (nextProps.agentModelId || '')) return false
    if (Number(prevProps.agentMaxTokens ?? 0) !== Number(nextProps.agentMaxTokens ?? 0)) return false

    // Re-render when turn usage arrives/updates; otherwise the ring can stay missing until refresh.
    {
      const prevTU = prevProps.turnUsage as any
      const nextTU = nextProps.turnUsage as any
      const prevTurnId = typeof prevTU?.turnId === 'string' ? String(prevTU.turnId) : ''
      const nextTurnId = typeof nextTU?.turnId === 'string' ? String(nextTU.turnId) : ''
      if (prevTurnId !== nextTurnId) return false

      const prevTotal = Number(prevTU?.usage?.totalTokens ?? 0)
      const nextTotal = Number(nextTU?.usage?.totalTokens ?? 0)
      if (prevTotal !== nextTotal) return false

      const prevCost = typeof prevTU?.usage?.cost === 'number' && Number.isFinite(prevTU.usage.cost) ? Number(prevTU.usage.cost) : 0
      const nextCost = typeof nextTU?.usage?.cost === 'number' && Number.isFinite(nextTU.usage.cost) ? Number(nextTU.usage.cost) : 0
      if (prevCost !== nextCost) return false
    }

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

function ChannelHero({ channelName, conversationTitle, bottomAlign }: { channelName?: string | null; conversationTitle: string | null; bottomAlign: boolean }) {
  const displayName =
    (typeof channelName === 'string' && channelName.trim().length > 0 ? channelName.trim() : null) ||
    (typeof conversationTitle === 'string' && conversationTitle.trim().length > 0 ? conversationTitle.trim() : null) ||
    'Channel'
  const displayHashed = `#${displayName.replace(/^#/, '')}`
  // Match DirectMessageHero avatar sizing.
  const sizeClassName = 'h-20 w-20 sm:h-24 sm:w-24'

  return (
    <div className={cn(bottomAlign && 'mt-auto', 'pb-10 pt-10')}>
      <div className="max-w-3xl">
        <div className="flex items-start gap-4">
          <div
            className={cn(
              // Match `MarketplaceAvatar` missing-image styling (DM agent avatar fallback).
              'relative overflow-hidden flex-shrink-0',
              sizeClassName,
              'rounded-2xl ring-1 ring-border/50 bg-muted/40 shadow-lg flex items-center justify-center'
            )}
          >
            {/* Channel-specific tint/pattern (intentionally different from DM avatar). */}
            <div
              className="absolute inset-0 bg-[radial-gradient(circle_at_25%_25%,rgba(59,130,246,0.26),transparent_58%),radial-gradient(circle_at_80%_75%,rgba(16,185,129,0.14),transparent_52%)]"
              aria-hidden="true"
            />
            <Icon name="hash" className="relative z-10 h-8 w-8 sm:h-9 sm:w-9 text-muted-foreground" />
            <div className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-inset ring-white/10" />
          </div>
          <div className="min-w-0">
            <h2 className="text-2xl font-semibold text-foreground truncate">{displayName}</h2>
            <p className="text-muted-foreground mt-1 leading-relaxed">This is the beginning of {displayHashed}. Send a message to start a conversation.</p>
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

function DirectMessageHero({
  title,
  participant,
  avatarUrlByAttachmentId,
  bottomAlign,
}: {
  title: string | null
  participant: { kind: 'agent'; label: string; seed: string; avatarAttachmentId?: string | null } | { kind: 'human'; label: string; avatarUrl?: string | null } | null
  avatarUrlByAttachmentId: Map<string, string | null | undefined>
  bottomAlign: boolean
}) {
  const normalizeDmTitle = (raw: string): string => {
    const t = String(raw || '').trim()
    if (!t) return t
    // Back-compat: older DM conversations were titled like "DM • Alice" (or "DM · Alice").
    const m = t.match(/^DM\s*[•·:\-–—]\s*(.+)$/i)
    if (m?.[1]) return String(m[1]).trim() || t
    return t
  }
  const displayName =
    // Prefer agent label (includes role) when available.
    participant?.kind === 'agent' && participant.label.trim().length > 0 ? normalizeDmTitle(participant.label) : normalizeDmTitle(title ?? '') || 'Direct message'
  return (
    <div className={cn(bottomAlign && 'mt-auto', 'pb-10 pt-10')}>
      <div className="max-w-3xl">
        <div className="flex items-start gap-4">
          <DirectMessageHeroAvatar participant={participant} avatarUrlByAttachmentId={avatarUrlByAttachmentId} />
          <div className="min-w-0">
            <h2 className="text-2xl font-semibold text-foreground truncate">{displayName}</h2>
            <p className="text-muted-foreground mt-1 leading-relaxed">This is the beginning of your conversation. Start with a quick hello.</p>
          </div>
        </div>
      </div>
      <div
        role="separator"
        aria-hidden="true"
        className="mt-8 h-px w-full bg-[linear-gradient(90deg,transparent_0%,hsl(var(--border))_7%,hsl(var(--border))_18%,hsl(var(--border)/0.35)_62%,transparent_100%)]"
      />
    </div>
  )
}

function DirectMessageHeroAvatar({
  participant,
  avatarUrlByAttachmentId,
}: {
  participant: { kind: 'agent'; label: string; seed: string; avatarAttachmentId?: string | null } | { kind: 'human'; label: string; avatarUrl?: string | null } | null
  avatarUrlByAttachmentId: Map<string, string | null | undefined>
}) {
  const p = participant
  // Shared marketplace-style avatar component so DM + marketplace stay in sync.
  const sizeClassName = 'h-20 w-20 sm:h-24 sm:w-24'

  if (!p) {
    return (
      <div className={cn('relative overflow-hidden flex-shrink-0', sizeClassName, 'rounded-2xl ring-1 ring-border/50 bg-muted/40 shadow-lg flex items-center justify-center')}>
        <Icon name="message-square" className="h-7 w-7 text-muted-foreground" />
        <div className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-inset ring-white/10" />
      </div>
    )
  }

  if (p.kind === 'agent') {
    const aid = typeof p.avatarAttachmentId === 'string' ? p.avatarAttachmentId.trim() : ''
    const imageUrl = aid ? avatarUrlByAttachmentId.get(aid) : undefined
    return <MarketplaceAvatar imageUrl={typeof imageUrl === 'string' ? imageUrl : null} label={p.label} seed={p.seed} sizeClassName={sizeClassName} />
  }

  const avatarUrl = typeof p.avatarUrl === 'string' ? p.avatarUrl.trim() : ''
  return (
    <MarketplaceAvatar
      imageUrl={avatarUrl || null}
      label={p.label}
      seed={p.label}
      sizeClassName={sizeClassName}
      tintClassName="bg-[radial-gradient(circle_at_30%_30%,rgba(124,58,237,0.18),transparent_60%)]"
    />
  )
}
