'use client'

import AgentAvatar from '@/components/animated/AgentAvatar'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { useConversationAgents, useConversationDetail, useStarshipDirectMessages, type DirectMessageListItem } from '@/hooks/useConversations'
import { useMessageAttachments } from '@/hooks/useFileUpload'
import { useConversationUsageTotals } from '@/hooks/useUsage'
import { formatAgentDisplayName } from '@/lib/agentDisplay'
import { cn } from '@/lib/utils'
import { useUserPreferencesStore } from '@/store/user-preferences-store'
import { useAuth } from '@/hooks/useAuth'
import api from '@/lib/api'
import { useQuery } from '@tanstack/react-query'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { motion } from 'motion/react'
import { useMemo, useEffect, useRef, useState, useCallback, type ReactNode } from 'react'
import { useStarshipPresence } from '@/hooks/useStarshipPresence'

export type ConversationParticipantItem = { kind: 'human'; key: string; label: string; avatarUrl?: string } | { kind: 'agent'; key: string; label: string; seed: string; avatarAttachmentId?: string }

interface ConversationSummaryBarProps {
  conversationId: string | null
  starshipId: string
  /** Optional override for the active model id (e.g. selected agent model). */
  modelId?: string | null
  /** Optional override for the max token budget (used as denominator). */
  maxTokens?: number | null
  /** Optional prefix shown before the title (e.g. "#" for channels). */
  titlePrefix?: ReactNode
  /** Optional right-side content aligned to the title row (far right of the title container). */
  titleRightSlot?: ReactNode
  /** Optional right-side content (e.g. controls). */
  rightSlot?: ReactNode
  /** Optional third-line content under the metadata row (e.g. agent selector). */
  thirdLineSlot?: ReactNode
  /** Optional title to show when `conversationId` is null (e.g. draft thread). */
  fallbackTitle?: string
  /** Optional subtitle to show when `conversationId` is null (e.g. "Draft (not saved)"). */
  fallbackSubtitle?: string
  /**
   * Optional participants override (useful for draft headers before a conversation exists).
   * When set, these participants will be used for the header avatars/list.
   */
  participantsOverride?: ConversationParticipantItem[] | null
}

interface ConversationAgent {
  id?: string
  name: string
  role?: string
  slug?: string
  model?: string
  avatarAttachmentId?: string
}

function initialsFromName(name?: string | null): string {
  if (!name || typeof name !== 'string') return 'U'
  const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 2)
  if (parts.length === 0) return 'U'
  return (
    parts
      .map(p => p[0]?.toUpperCase())
      .filter(Boolean)
      .join('') || 'U'
  )
}

function normalizeConversationTitle(raw: string): string {
  const t = String(raw || '').trim()
  if (!t) return t
  // Back-compat: older DM conversations were titled like "DM • Alice".
  // Support common separators: bullet (•), middle dot (·), colon, hyphen/en-dash/em-dash.
  const m = t.match(/^DM\s*[•·:\-–—]\s*(.+)$/i)
  if (m?.[1]) {
    const rest = String(m[1]).trim()
    return rest || t
  }
  return t
}

export function ConversationSummaryBar({
  conversationId,
  starshipId,
  modelId: _modelId,
  maxTokens: _maxTokens,
  titlePrefix,
  titleRightSlot,
  rightSlot,
  thirdLineSlot,
  fallbackTitle,
  fallbackSubtitle,
  participantsOverride,
}: ConversationSummaryBarProps) {
  const expertMode = useUserPreferencesStore(s => s.expertMode)
  const { isInstanceAdmin, userId: authUserId, userName: authUserName, userEmail: authUserEmail, userAvatar: authUserAvatar } = useAuth()
  const showTokens = expertMode
  const showCost = expertMode && isInstanceAdmin
  const { isUserOnline } = useStarshipPresence(starshipId, Boolean(starshipId))

  // Fetch conversation detail directly (avoids pagination gaps in starship conversation lists)
  const { data: currentConversation, isLoading: isLoadingConversation } = useConversationDetail(conversationId)
  const isConversationBusy = !!((currentConversation as any)?.state && typeof (currentConversation as any)?.state === 'object' && ((currentConversation as any).state as any).turnActive === true)

  // Direct message context (lets us display participants even when there are no messages yet)
  const { data: dmListData } = useStarshipDirectMessages(starshipId, Boolean(starshipId && conversationId))
  const dmItem = useMemo<DirectMessageListItem | null>(() => {
    const cid = String(conversationId || '')
    const list = (dmListData?.directMessages || []) as DirectMessageListItem[]
    if (!cid || !Array.isArray(list) || list.length === 0) return null
    return list.find(x => String((x as any)?.dm?.conversationId || '') === cid) || null
  }, [dmListData?.directMessages, conversationId])

  const dmDebug = useMemo(() => {
    const dm: any = dmItem?.dm as any
    const agent: any = (dmItem as any)?.agent
    return {
      conversationId: String(conversationId || ''),
      dmType: typeof dm?.dmType === 'string' ? String(dm.dmType) : null,
      dmAgentId: typeof dm?.agentId === 'string' ? String(dm.agentId) : null,
      hasAgentObj: Boolean(agent),
      agentId: typeof agent?.id === 'string' ? String(agent.id) : null,
      agentName: typeof agent?.name === 'string' ? String(agent.name) : null,
      agentRole: typeof agent?.role === 'string' ? String(agent.role) : null,
      formatted: agent ? formatAgentDisplayName(agent) : null,
    }
  }, [conversationId, dmItem])

  // Derive agents for this conversation (same source as the left navigation list)
  const { data: convAgents = [], isLoading: isLoadingAgents } = useConversationAgents(conversationId)
  const agents = useMemo(() => (Array.isArray(convAgents) ? (convAgents as ConversationAgent[]) : []), [convAgents])
  const overrideAvatarAttachmentIds = useMemo(() => {
    const list = Array.isArray(participantsOverride) ? participantsOverride : []
    return list
      .filter(p => p && p.kind === 'agent')
      .map(p => (typeof p.avatarAttachmentId === 'string' ? p.avatarAttachmentId.trim() : ''))
      .filter(Boolean)
  }, [participantsOverride])
  const avatarAttachmentIds = useMemo(() => {
    const ids = agents.map(a => (a as any).avatarAttachmentId as string | undefined).filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
    return Array.from(new Set([...ids, ...overrideAvatarAttachmentIds]))
  }, [agents, overrideAvatarAttachmentIds])
  const hasAvatarIds = avatarAttachmentIds.length > 0
  const { data: avatarAttachments = [], isLoading: isLoadingAvatars } = useMessageAttachments(avatarAttachmentIds, starshipId)
  const avatarUrlById = useMemo(() => new Map(avatarAttachments.map(a => [a.id, a.previewUrl] as const)), [avatarAttachments])

  // Include human participants by sampling recent message authors (matches thread card behavior).
  // The conversation detail endpoint does not currently include members/users.
  const { data: participantsPreview } = useQuery({
    queryKey: ['conversations', 'participants-preview', conversationId],
    enabled: Boolean(conversationId),
    queryFn: async () => {
      const cid = String(conversationId || '')
      if (!cid) return null
      const resp = await api.get(`/api/v1/conversations/${encodeURIComponent(cid)}/messages`, { params: { limit: 50 } })
      return (resp as any)?.data?.data ?? null
    },
    staleTime: 60_000,
  })

  const participantItemsFromConversation = useMemo<ConversationParticipantItem[]>(() => {
    type ParticipantWithSeen = (ConversationParticipantItem & { lastSeenAt: number }) | null
    const byKey = new Map<string, ConversationParticipantItem & { lastSeenAt: number }>()

    const upsert = (next: ConversationParticipantItem, lastSeenAt: number) => {
      const prev = byKey.get(next.key)
      if (!prev) {
        byKey.set(next.key, { ...(next as any), lastSeenAt })
        return
      }
      const prevSeen = typeof (prev as any).lastSeenAt === 'number' ? (prev as any).lastSeenAt : 0
      const mergedSeen = Math.max(prevSeen, lastSeenAt)
      // Prefer richer metadata (e.g. avatarUrl) as we learn it.
      byKey.set(next.key, { ...(prev as any), ...(next as any), lastSeenAt: mergedSeen })
    }

    const parseSeenAt = (m: any): number => {
      const raw = typeof m?.createdAt === 'string' ? m.createdAt : typeof m?.updatedAt === 'string' ? m.updatedAt : null
      const t = raw ? Date.parse(raw) : NaN
      return Number.isFinite(t) ? t : 0
    }

    // Humans: derive from recent messages' user identity fields.
    const msgs = Array.isArray((participantsPreview as any)?.messages) ? (((participantsPreview as any).messages as any[]) ?? []) : []
    for (const m of msgs) {
      const role = String(m?.role ?? '')
      const seenAt = parseSeenAt(m)

      if (role === 'user') {
        const userId = typeof m?.userId === 'string' ? String(m.userId).trim() : ''
        const userName = typeof m?.userName === 'string' ? String(m.userName).trim() : ''
        const userAvatar = typeof m?.userAvatar === 'string' ? String(m.userAvatar).trim() : ''

        const label = userName || (userId ? `User ${userId.slice(0, 6)}` : 'User')
        const key = userId ? `human:${userId}` : userName ? `human:name:${userName}` : `human:unknown:${label}`
        upsert({ kind: 'human', key, label, ...(userAvatar ? { avatarUrl: userAvatar } : null) }, seenAt)
      }

      if (role === 'assistant') {
        const agentId = typeof m?.agentId === 'string' ? String(m.agentId).trim() : ''
        const agentName = typeof m?.agentName === 'string' ? String(m.agentName).trim() : ''
        const label = agentName || (agentId ? `Agent ${agentId.slice(0, 6)}` : 'Agent')
        const key = `agent:${agentId || label}`
        const seed = agentName || agentId || label
        const fromList = agentId ? (agents as any[]).find(a => String((a as any)?.id || '') === agentId) : null
        const avatarAttachmentId = typeof (fromList as any)?.avatarAttachmentId === 'string' ? String((fromList as any).avatarAttachmentId).trim() : ''
        upsert({ kind: 'agent', key, label, seed, ...(avatarAttachmentId ? { avatarAttachmentId } : null) }, seenAt)
      }
    }

    // Agents: from the agents list.
    for (let idx = 0; idx < agents.length; idx++) {
      const a = agents[idx]
      const id = typeof (a as any)?.id === 'string' ? String((a as any).id).trim() : ''
      const label = String((a as any)?.name || (a as any)?.slug || id || `Agent ${idx + 1}`).trim() || `Agent ${idx + 1}`
      const key = `agent:${id || label}`
      const seed = String((a as any)?.name || (a as any)?.slug || id || `agent-${idx}`).trim() || `agent-${idx}`
      const aid = typeof (a as any)?.avatarAttachmentId === 'string' ? String((a as any).avatarAttachmentId).trim() : ''
      // Keep agents that haven't spoken yet; they sort after active participants.
      upsert({ kind: 'agent', key, label, seed, ...(aid ? { avatarAttachmentId: aid } : null) }, 0)
    }

    const sorted = Array.from(byKey.values()).filter(Boolean) as Array<Exclude<ParticipantWithSeen, null>>

    sorted.sort((a, b) => {
      const da = typeof (a as any).lastSeenAt === 'number' ? (a as any).lastSeenAt : 0
      const db = typeof (b as any).lastSeenAt === 'number' ? (b as any).lastSeenAt : 0
      if (db !== da) return db - da
      return String((a as any).label || '').localeCompare(String((b as any).label || ''))
    })

    return sorted.map(({ lastSeenAt: _lastSeenAt, ...rest }: any) => rest) as ConversationParticipantItem[]
  }, [agents, participantsPreview])

  const effectiveParticipantItems = useMemo(() => {
    // For DMs, always show both participants (even with 0 messages / before either has spoken).
    if (dmItem?.dm) {
      const items: ConversationParticipantItem[] = []
      const seen = new Set<string>()

      const addHuman = (args: { id?: string | null; label?: string | null; avatarUrl?: string | null }) => {
        const id = typeof args.id === 'string' ? args.id.trim() : ''
        const labelRaw = typeof args.label === 'string' ? args.label.trim() : ''
        const avatarUrl = typeof args.avatarUrl === 'string' ? args.avatarUrl.trim() : ''
        const label = labelRaw || (id ? `User ${id.slice(0, 6)}` : 'User')
        const key = id ? `human:${id}` : label ? `human:name:${label}` : `human:unknown:${label}`
        if (seen.has(key)) return
        seen.add(key)
        items.push({ kind: 'human', key, label, ...(avatarUrl ? { avatarUrl } : null) })
      }

      const addAgent = (args: { id?: string | null; label?: string | null; seed?: string | null; avatarAttachmentId?: string | null }) => {
        const id = typeof args.id === 'string' ? args.id.trim() : ''
        const labelRaw = typeof args.label === 'string' ? args.label.trim() : ''
        const avatarAttachmentId = typeof args.avatarAttachmentId === 'string' ? args.avatarAttachmentId.trim() : ''
        const label = labelRaw || (id ? `Agent ${id.slice(0, 6)}` : 'Agent')
        const key = `agent:${id || label}`
        if (seen.has(key)) return
        seen.add(key)
        const seed = (typeof args.seed === 'string' ? args.seed.trim() : '') || label || id || 'agent'
        items.push({ kind: 'agent', key, label, seed, ...(avatarAttachmentId ? { avatarAttachmentId } : null) })
      }

      // Current user
      addHuman({ id: authUserId ?? null, label: authUserName ?? authUserEmail ?? null, avatarUrl: authUserAvatar ?? null })

      // Other participant
      const dm = dmItem.dm as any
      if (dm?.dmType === 'user_agent') {
        const a: any = (dmItem as any)?.agent
        addAgent({
          id: typeof a?.id === 'string' ? String(a.id) : typeof dm?.agentId === 'string' ? String(dm.agentId) : null,
          label: a ? formatAgentDisplayName(a) : null,
          seed: typeof a?.name === 'string' ? String(a.name) : typeof dm?.agentId === 'string' ? String(dm.agentId) : 'agent',
          avatarAttachmentId: typeof a?.avatarAttachmentId === 'string' ? String(a.avatarAttachmentId) : null,
        })
      } else if (dm?.dmType === 'user_user') {
        const peer: any = (dmItem as any)?.peerUser
        const peerId =
          typeof peer?.id === 'string'
            ? String(peer.id)
            : typeof dm?.userAId === 'string' && String(dm.userAId) !== String(authUserId || '')
              ? String(dm.userAId)
              : typeof dm?.userBId === 'string'
                ? String(dm.userBId)
                : null
        const peerLabel =
          (typeof peer?.displayName === 'string' && peer.displayName.trim()) || (typeof peer?.email === 'string' && peer.email.trim()) || (peerId ? `User ${String(peerId).slice(0, 6)}` : 'User')
        const peerAvatar = typeof peer?.avatar === 'string' ? String(peer.avatar) : null
        addHuman({ id: peerId ?? null, label: peerLabel, avatarUrl: peerAvatar })
      }

      return items.length > 0 ? items : participantItemsFromConversation
    }
    if (Array.isArray(participantsOverride) && participantsOverride.length > 0) {
      const seen = new Set<string>()
      return participantsOverride.filter(p => {
        if (seen.has(p.key)) return false
        seen.add(p.key)
        return true
      })
    }
    return participantItemsFromConversation
  }, [authUserAvatar, authUserEmail, authUserId, authUserName, dmItem, participantItemsFromConversation, participantsOverride])

  const participantsLabel = useMemo(() => {
    const labels = effectiveParticipantItems.map(p => p.label).filter(Boolean)
    if (labels.length === 0) return 'No participants'
    if (labels.length <= 3) return labels.join(', ')
    return `${labels.slice(0, 3).join(', ')} +${labels.length - 3}`
  }, [effectiveParticipantItems])

  const [participantsOpen, setParticipantsOpen] = useState(false)
  const participantsHoverCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const participantsTriggerRef = useRef<HTMLButtonElement | null>(null)
  const participantsContentRef = useRef<HTMLDivElement | null>(null)

  const clearParticipantsHoverTimers = useCallback(() => {
    if (participantsHoverCloseTimerRef.current) {
      clearTimeout(participantsHoverCloseTimerRef.current)
      participantsHoverCloseTimerRef.current = null
    }
  }, [])

  const openParticipantsPopover = useCallback(() => {
    clearParticipantsHoverTimers()
    setParticipantsOpen(prev => (prev ? prev : true))
  }, [clearParticipantsHoverTimers])

  const closeParticipantsPopover = useCallback(
    (delayMs = 180) => {
      if (!participantsOpen) return
      if (participantsHoverCloseTimerRef.current) return
      participantsHoverCloseTimerRef.current = setTimeout(() => {
        participantsHoverCloseTimerRef.current = null
        setParticipantsOpen(false)
      }, delayMs)
    },
    [participantsOpen]
  )

  // Avoid redundant open/close triggers:
  // Only close when pointer truly leaves BOTH trigger and content (use relatedTarget across portal boundary).
  const handleParticipantsTriggerPointerLeave = useCallback(
    (e: React.PointerEvent) => {
      const next = e.relatedTarget as Node | null
      const contentEl = participantsContentRef.current
      if (next && contentEl && contentEl.contains(next)) return
      closeParticipantsPopover(220)
    },
    [closeParticipantsPopover]
  )

  const handleParticipantsContentPointerLeave = useCallback(
    (e: React.PointerEvent) => {
      const next = e.relatedTarget as Node | null
      const triggerEl = participantsTriggerRef.current
      if (next && triggerEl && triggerEl.contains(next)) return
      closeParticipantsPopover(220)
    },
    [closeParticipantsPopover]
  )

  useEffect(() => {
    return () => {
      clearParticipantsHoverTimers()
    }
  }, [clearParticipantsHoverTimers])

  const ParticipantsPopup = () => {
    const labels = effectiveParticipantItems.map(p => p.label).filter(Boolean)
    if (labels.length === 0) return null
    return (
      <div className="w-full">
        <div className="px-2 py-2 font-normal">
          <div className="text-sm font-medium leading-tight truncate text-foreground">Participants</div>
        </div>
        <div className="-mx-1 my-1 h-px bg-muted" />
        <div className="max-h-72 overflow-y-auto overflow-x-hidden p-1">
          {effectiveParticipantItems.map(p => (
            <div
              key={p.key}
              className="group relative rounded-lg flex items-center gap-2 w-full h-8 px-2 text-[13px] font-medium border border-transparent cursor-default text-muted-foreground hover:text-foreground hover:bg-muted focus:bg-muted"
            >
              <div className="flex-shrink-0" style={{ width: '1.25rem', height: '1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: 0, pointerEvents: 'none' }}>
                {p.kind === 'agent' ? (
                  <div className="relative">
                    <div className="h-5 w-5 rounded-full ring-1 ring-border/40 bg-muted/30 overflow-hidden">
                      <AgentAvatar seed={p.seed} imageUrl={p.avatarAttachmentId ? avatarUrlById.get(p.avatarAttachmentId) : undefined} size={20} rounded />
                    </div>
                  </div>
                ) : (
                  <div className="relative">
                    <Avatar className="h-5 w-5 rounded-full ring-1 ring-border/40 bg-muted/30 overflow-hidden">
                      {p.avatarUrl ? <AvatarImage src={p.avatarUrl} alt={p.label} referrerPolicy="no-referrer" crossOrigin="anonymous" className="rounded-full object-cover" /> : null}
                      <AvatarFallback className="rounded-full bg-muted/40 text-muted-foreground text-[9px] font-semibold">{initialsFromName(p.label)}</AvatarFallback>
                    </Avatar>
                  </div>
                )}
              </div>
              <span className="min-w-0 truncate">{p.label}</span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // Token indicator: utilization (server totals) vs max (model context window)
  const usageConversationId = showTokens ? conversationId : null
  const { data: totalsData } = useConversationUsageTotals(usageConversationId)
  const totalCost = Number(totalsData?.cost ?? 0)

  // Only render actual header when all data is ready to prevent layout shifts
  // If there are no avatars to load, don't wait for avatar loading
  const isDataReady = !isLoadingConversation && !isLoadingAgents && (hasAvatarIds ? !isLoadingAvatars : true) && !!currentConversation

  const titleDebug = useMemo(() => {
    const rawTitle = typeof (currentConversation as any)?.title === 'string' ? String((currentConversation as any).title) : null
    // We can compute the would-be title even when not ready; it will just use the fallback.
    const normalizedTitle = normalizeConversationTitle(rawTitle || (conversationId ? `Conversation ${String(conversationId).slice(0, 8)}` : ''))
    const dm: any = (dmItem as any)?.dm
    const dmAgent: any = (dmItem as any)?.agent
    const dmType = typeof dm?.dmType === 'string' ? String(dm.dmType) : null
    const dmAgentLabel = dmType === 'user_agent' && dmAgent ? formatAgentDisplayName(dmAgent) : null
    const effectiveTitle = dmAgentLabel || (normalizedTitle || null)
    return {
      conversationId: String(conversationId || ''),
      rawTitle,
      normalizedTitle: normalizedTitle || null,
      dmType,
      dmAgentLabel,
      effectiveTitle,
      hasDmItem: Boolean((dmItem as any)?.dm),
    }
  }, [conversationId, (currentConversation as any)?.title, Boolean((dmItem as any)?.dm)])

  // Use a key based on conversationId to ensure smooth remount animations
  // This helps coordinate the animation when transitioning from starter page
  const animationKey = useMemo(() => conversationId || 'none', [conversationId])

  // Track if this is the initial mount to prevent animation on page reload
  const isInitialMountRef = useRef(true)
  // If we ever rendered the loading header for this conversationId,
  // don't animate the "real" header in from the top when data arrives.
  const renderedPlaceholderForConversationRef = useRef(false)
  useEffect(() => {
    // Mark initial mount as complete after a short delay
    const timer = setTimeout(() => {
      isInitialMountRef.current = false
    }, 100)
    return () => clearTimeout(timer)
  }, [])

  // Reset placeholder tracking when switching conversations.
  useEffect(() => {
    renderedPlaceholderForConversationRef.current = false
  }, [conversationId])

  // Reserve space even when loading to prevent layout shift
  // Show placeholder if: no conversationId, no currentConversation, or data is still loading
  if (!conversationId || !isDataReady) {
    renderedPlaceholderForConversationRef.current = true
    const effectiveFallbackTitle = typeof fallbackTitle === 'string' && fallbackTitle.trim().length > 0 ? fallbackTitle.trim() : !conversationId ? 'Draft' : 'Loading...'
    const effectiveFallbackSubtitle = typeof fallbackSubtitle === 'string' && fallbackSubtitle.trim().length > 0 ? fallbackSubtitle.trim() : null
    const isDraftHeader = !conversationId
    const hasDraftParticipants = isDraftHeader && effectiveParticipantItems.length > 0

    return (
      <div className="sticky top-0 z-10 border-b border-border/60 bg-card">
        <div className="px-4 pt-3.5 pb-3">
          <div className="w-full">
            <div className="flex items-center justify-between gap-4">
              {/* Title and metadata (stacked) - exact structural match */}
              <div className="flex-1 min-w-0 flex flex-col justify-center gap-1.5">
                {/* Title - exact match */}
                <div className="flex items-baseline gap-2 min-w-0 w-full">
                  {titlePrefix ? (
                    <span aria-hidden="true" className="flex-shrink-0 self-center text-foreground leading-none">
                      {titlePrefix}
                    </span>
                  ) : null}
                  <h3 className="flex-1 text-xl font-semibold text-foreground truncate tracking-tight leading-tight min-w-0">
                    <span className="opacity-50">{effectiveFallbackTitle}</span>
                  </h3>
                  {titleRightSlot ? <div className="flex items-center gap-2 flex-shrink-0">{titleRightSlot}</div> : null}
                </div>
                {/* Agents + updated row - exact structural match with same classes */}
                <div className="flex flex-wrap items-center gap-2 text-xs leading-none text-muted-foreground min-h-5">
                  {isDraftHeader ? (
                    <>
                      {hasDraftParticipants ? (
                        <Popover
                          open={participantsOpen}
                          onOpenChange={next => {
                            clearParticipantsHoverTimers()
                            setParticipantsOpen(next)
                          }}
                        >
                          <PopoverTrigger asChild>
                            <button
                              type="button"
                              ref={participantsTriggerRef}
                              className="inline-flex items-center gap-2 rounded-lg px-1 py-0.5 -mx-1 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                              aria-label={`Participants: ${participantsLabel}`}
                              title={participantsLabel}
                              onPointerEnter={openParticipantsPopover}
                              onPointerLeave={handleParticipantsTriggerPointerLeave}
                              onFocus={() => {
                                clearParticipantsHoverTimers()
                                setParticipantsOpen(true)
                              }}
                            >
                              <div className="flex items-center -space-x-1.5">
                                {effectiveParticipantItems.slice(0, 3).map(p => {
                                  if (p.kind === 'agent') {
                                    const imageUrl = p.avatarAttachmentId ? avatarUrlById.get(p.avatarAttachmentId) : undefined
                                    return (
                                      <div key={p.key} className="relative h-5 w-5">
                                        <div className="h-5 w-5 rounded-full ring-1 ring-background bg-muted overflow-hidden">
                                          <AgentAvatar seed={p.seed} imageUrl={imageUrl} size={20} rounded />
                                        </div>
                                      </div>
                                    )
                                  }
                                  return (
                                    <div key={p.key} className="relative h-5 w-5">
                                      <Avatar className="h-5 w-5 rounded-full ring-1 ring-background bg-muted overflow-hidden">
                                        {p.avatarUrl ? <AvatarImage src={p.avatarUrl} alt={p.label} referrerPolicy="no-referrer" crossOrigin="anonymous" className="object-cover" /> : null}
                                        <AvatarFallback className="rounded-full bg-muted text-muted-foreground text-[9px] font-semibold">{initialsFromName(p.label)}</AvatarFallback>
                                      </Avatar>
                                    </div>
                                  )
                                })}
                              </div>
                              {effectiveParticipantItems.length > 3 ? <span className="font-medium leading-none text-muted-foreground">and {effectiveParticipantItems.length - 3} more</span> : null}
                            </button>
                          </PopoverTrigger>
                          <PopoverContent
                            ref={participantsContentRef}
                            side="bottom"
                            align="start"
                            sideOffset={8}
                            className="w-64 !rounded-lg !p-1 bg-card !border-0 ring-1 ring-border/60 dark:ring-border !shadow-md"
                            onOpenAutoFocus={e => e.preventDefault()}
                            onCloseAutoFocus={e => e.preventDefault()}
                            onPointerEnter={openParticipantsPopover}
                            onPointerLeave={handleParticipantsContentPointerLeave}
                          >
                            <ParticipantsPopup />
                          </PopoverContent>
                        </Popover>
                      ) : (
                        <div className="inline-flex items-center gap-2 rounded-lg px-1 py-0.5 -mx-1">
                          <div className="inline-flex items-center gap-1.5 max-w-[14rem]">
                            <Avatar className="h-4 w-4 ring-1 ring-border/40 bg-muted/20 overflow-hidden">
                              <div className="h-4 w-4 rounded-full bg-muted/30" />
                            </Avatar>
                            <span className="truncate font-medium leading-none opacity-70">Draft</span>
                          </div>
                        </div>
                      )}
                      <span className="inline-flex items-center gap-2 whitespace-nowrap">
                        <span aria-hidden="true" className="h-3 w-px bg-border/60" />
                        <span className="font-medium leading-none opacity-70">{effectiveFallbackSubtitle ?? 'Draft (not saved)'}</span>
                      </span>
                      {showTokens ? (
                        <>
                          <span className="inline-flex items-center gap-2 whitespace-nowrap">
                            <span aria-hidden="true" className="h-3 w-px bg-border/60" />
                            <span className="inline-flex h-4 w-4 rounded-full ring-1 ring-border/40 bg-muted/20" aria-hidden="true" />
                          </span>
                        </>
                      ) : null}
                    </>
                  ) : (
                    <>
                      {/* Agent placeholder - matches exact structure */}
                      <div className="inline-flex items-center gap-2 rounded-lg px-1 py-0.5 -mx-1">
                        <div className="inline-flex items-center gap-1.5 max-w-[14rem]">
                          <Avatar className="h-4 w-4 ring-1 ring-border/40">
                            <div className="h-4 w-4 rounded-full bg-muted/30 animate-pulse" />
                          </Avatar>
                          <span className="truncate font-medium leading-none opacity-50">Loading...</span>
                        </div>
                      </div>
                      {/* Separator and updated text - exact match */}
                      <span className="inline-flex items-center gap-2 whitespace-nowrap">
                        <span aria-hidden="true" className="h-3 w-px bg-border/60" />
                        <span className="font-medium leading-none opacity-50">{effectiveFallbackSubtitle ?? 'Updated just now'}</span>
                      </span>
                      {showTokens ? (
                        <>
                          {/* Token indicator placeholder (reserved space) */}
                          <span className="inline-flex items-center gap-2 whitespace-nowrap">
                            <span aria-hidden="true" className="h-3 w-px bg-border/60" />
                            <span className="inline-flex h-4 w-4 rounded-full ring-1 ring-border/40 bg-muted/30 animate-pulse" aria-hidden="true" />
                          </span>
                        </>
                      ) : null}
                    </>
                  )}
                </div>

                {thirdLineSlot ? <div className="pt-2">{thirdLineSlot}</div> : null}
              </div>

              {rightSlot ? <div className="flex items-center gap-2 flex-shrink-0">{rightSlot}</div> : null}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Prefer DM agent label for user↔agent DMs so the header always includes role.
  // Conversation titles are persisted and may be name-only (e.g. "Echo") depending on creation path.
  const title = (() => {
    const dm: any = (dmItem as any)?.dm
    const dmAgent: any = (dmItem as any)?.agent
    if (dm?.dmType === 'user_agent' && dmAgent) {
      const label = formatAgentDisplayName(dmAgent)
      if (label && label.trim().length > 0) return label
    }
    return normalizeConversationTitle(currentConversation?.title || `Conversation ${String(conversationId).slice(0, 8)}`)
  })()
  const updatedAt = new Date(currentConversation?.updatedAt || currentConversation?.createdAt || '')

  // Format dates
  const formatDate = (date: Date) => {
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  const formatUSD2 = (v: number) => {
    if (!(typeof v === 'number') || !Number.isFinite(v)) return '$0.00'
    return `$${v.toFixed(2)}`
  }

  return (
    <motion.div
      key={animationKey}
      initial={isInitialMountRef.current || renderedPlaceholderForConversationRef.current ? { opacity: 1, y: 0 } : { opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={
        isInitialMountRef.current || renderedPlaceholderForConversationRef.current
          ? { duration: 0 }
          : {
              duration: 0.5,
              delay: 0.1,
              ease: [0.25, 0.46, 0.45, 0.94],
            }
      }
      className="sticky top-0 z-10 border-b border-border/60 bg-card"
    >
      <div className="px-4 pt-3.5 pb-3">
        <div className="w-full">
          <div className="flex items-center justify-between gap-4">
            {/* Title and metadata (stacked) */}
            <div className="flex-1 min-w-0 flex flex-col justify-center gap-1.5">
              {/* Title */}
              <div className="flex items-baseline gap-2 min-w-0 w-full">
                {titlePrefix ? (
                  <span aria-hidden="true" className="flex-shrink-0 self-center text-foreground leading-none">
                    {titlePrefix}
                  </span>
                ) : null}
                <h3 className="flex-1 text-xl font-semibold text-foreground truncate tracking-tight leading-tight min-w-0">{title}</h3>
                {titleRightSlot ? <div className="flex items-center gap-2 flex-shrink-0">{titleRightSlot}</div> : null}
              </div>

              {/* Agents + updated row */}
              <div className="flex flex-wrap items-center gap-2 text-xs leading-none text-muted-foreground">
                {effectiveParticipantItems.length > 0 ? (
                  <>
                    {/* Participants (overlapping avatars) + popup list (match navbar user menu popover style) */}
                    <Popover
                      open={participantsOpen}
                      onOpenChange={next => {
                        clearParticipantsHoverTimers()
                        setParticipantsOpen(next)
                      }}
                    >
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          ref={participantsTriggerRef}
                          className="inline-flex items-center gap-2 rounded-lg px-1 py-0.5 -mx-1 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                          aria-label={`Participants: ${participantsLabel}`}
                          title={participantsLabel}
                          onPointerEnter={openParticipantsPopover}
                          onPointerLeave={handleParticipantsTriggerPointerLeave}
                          onFocus={() => {
                            clearParticipantsHoverTimers()
                            setParticipantsOpen(true)
                          }}
                        >
                          <div className="flex items-center -space-x-1.5">
                            {effectiveParticipantItems.slice(0, 3).map(p => {
                              if (p.kind === 'agent') {
                                const imageUrl = p.avatarAttachmentId ? avatarUrlById.get(p.avatarAttachmentId) : undefined
                                return (
                                    <div key={p.key} className="relative h-5 w-5">
                                      <div className="h-5 w-5 rounded-full ring-1 ring-background bg-muted overflow-hidden">
                                        <AgentAvatar seed={p.seed} imageUrl={imageUrl} size={20} rounded />
                                      </div>
                                    </div>
                                )
                              }
                              return (
                                  <div key={p.key} className="relative h-5 w-5">
                                    <Avatar className="h-5 w-5 rounded-full ring-1 ring-background bg-muted overflow-hidden">
                                      {p.avatarUrl ? <AvatarImage src={p.avatarUrl} alt={p.label} referrerPolicy="no-referrer" crossOrigin="anonymous" className="object-cover" /> : null}
                                      <AvatarFallback className="rounded-full bg-muted text-muted-foreground text-[9px] font-semibold">{initialsFromName(p.label)}</AvatarFallback>
                                    </Avatar>
                                  </div>
                              )
                            })}
                          </div>
                          {effectiveParticipantItems.length > 3 ? <span className="font-medium leading-none text-muted-foreground">and {effectiveParticipantItems.length - 3} more</span> : null}
                        </button>
                      </PopoverTrigger>
                      <PopoverContent
                        ref={participantsContentRef}
                        side="bottom"
                        align="start"
                        sideOffset={8}
                        className="w-64 !rounded-lg !p-1 bg-card !border-0 ring-1 ring-border/60 dark:ring-border !shadow-md"
                        onOpenAutoFocus={e => e.preventDefault()}
                        onCloseAutoFocus={e => e.preventDefault()}
                        onPointerEnter={openParticipantsPopover}
                        onPointerLeave={handleParticipantsContentPointerLeave}
                      >
                        <ParticipantsPopup />
                      </PopoverContent>
                    </Popover>

                    <span className="inline-flex items-center gap-2 whitespace-nowrap">
                      <span aria-hidden="true" className="h-3 w-px bg-border/60" />
                      <span className="font-medium leading-none text-muted-foreground">Updated {formatDate(updatedAt)}</span>
                    </span>

                    {/* Usage: keep cost-only in expert mode; context is shown on agent avatar per-turn */}
                    {showTokens && showCost ? (
                      <>
                        <span className="inline-flex items-center gap-2 whitespace-nowrap">
                          <span aria-hidden="true" className="h-3 w-px bg-border/60" />
                          <span
                            className="inline-flex items-center text-[11px] text-muted-foreground"
                            title={showCost ? `${formatUSD2(totalCost)} spent` : undefined}
                            aria-label={showCost ? `${formatUSD2(totalCost)} spent` : undefined}
                          >
                            {showCost ? formatUSD2(totalCost) : null}
                          </span>
                        </span>
                      </>
                    ) : null}
                  </>
                ) : (
                  <>
                    <span className="font-medium leading-none text-muted-foreground">Updated {formatDate(updatedAt)}</span>
                    {showTokens && showCost ? (
                      <>
                        <span className="inline-flex items-center gap-2 whitespace-nowrap">
                          <span aria-hidden="true" className="h-3 w-px bg-border/60" />
                          <span
                            className="inline-flex items-center text-[11px] text-muted-foreground"
                            title={showCost ? `${formatUSD2(totalCost)} spent` : undefined}
                            aria-label={showCost ? `${formatUSD2(totalCost)} spent` : undefined}
                          >
                            {showCost ? formatUSD2(totalCost) : null}
                          </span>
                        </span>
                      </>
                    ) : null}
                  </>
                )}
              </div>

              {thirdLineSlot ? <div className="pt-2">{thirdLineSlot}</div> : null}
            </div>

            {rightSlot ? <div className="flex items-center gap-2 flex-shrink-0">{rightSlot}</div> : null}
          </div>
        </div>
      </div>
    </motion.div>
  )
}
