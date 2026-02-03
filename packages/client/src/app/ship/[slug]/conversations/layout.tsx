'use client'

import { ConversationInterface } from '@/components/conversation/ConversationInterface'
import { ThreadPane } from '@/components/conversation/ThreadPane'
import { useStarshipChannels, useStarshipDirectMessages, type DirectMessageListItem } from '@/hooks/useConversations'
import { useStarshipBySlug } from '@/hooks/useStarships'
import { useMarkConversationRead } from '@/hooks/useNotifications'
import type { AgentModel, MessageModel } from '@starships/protocol'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useMemo, useEffect, useRef, useState } from 'react'
import { useNavigationOnboardingContext } from '@/contexts/NavigationOnboardingContext'
import { useStarshipAgents } from '@/hooks/useAgents'
import { useStarshipMembersAndInvites } from '@/hooks/useStarshipMembers'
import { formatAgentDisplayName } from '@/lib/agentDisplay'
import api from '@/lib/api'

function sanitizeThreadTitleSnippetFromMessageContent(
  input: string,
  maps?: { agentLabelById?: Map<string, string>; userLabelById?: Map<string, string> }
): string {
  // Thread titles are plain text snippets. Do not carry mention tokens into the title:
  // - Avoid decoding `<@a:...>` / `<@u:...>` to names in the header/nav.
  // - Avoid accidental notifications/UX confusion from `@mentions` in titles.
  const agentLabelById = maps?.agentLabelById
  const userLabelById = maps?.userLabelById

  const s = String(input || '')
    // Convert structured mention tokens into plain-text @Name (no tokens).
    .replace(/<@a:([^>\s]+)>/gi, (_m, idRaw) => {
      const id = String(idRaw || '').trim()
      const label = id && agentLabelById ? agentLabelById.get(id) : null
      return `@${label || 'Agent'}`
    })
    .replace(/<@u:([^>\s]+)>/gi, (_m, idRaw) => {
      const id = String(idRaw || '').trim()
      const label = id && userLabelById ? userLabelById.get(id) : null
      return `@${label || 'User'}`
    })
    .replace(/<@[^>\n]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  return s
}

export default function ConversationsLayout({ children }: { children: React.ReactNode }) {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { shouldShowOnboarding } = useNavigationOnboardingContext()
  const [threadAgent, setThreadAgent] = useState<AgentModel | null>(null)
  const [threadPinnedFirstMessage, setThreadPinnedFirstMessage] = useState<MessageModel | null>(null)
  const [threadDraftParentConversationId, setThreadDraftParentConversationId] = useState<string | null>(null)
  const [threadDraftTitle, setThreadDraftTitle] = useState<string | null>(null)
  const lastThreadConversationIdRef = useRef<string | null>(null)
  const pendingThreadStateRef = useRef<{
    threadKey: string | null
    threadAgent: AgentModel | null
    pinnedFirstMessage: MessageModel | null
    draftParentConversationId: string | null
    draftTitle: string | null
  } | null>(null)

  // Desktop thread pane width (draggable resizer)
  const THREAD_PANE_WIDTH_STORAGE_KEY = 'starships.threadPaneWidthPx'
  const [threadPaneWidthPx, setThreadPaneWidthPx] = useState<number>(() => {
    if (typeof window === 'undefined') return 600
    const w = window.innerWidth
    // Slightly wider by default; clamped to keep the main column usable.
    if (w >= 1536) return 720
    if (w >= 1280) return 660
    if (w >= 1024) return 600
    return 480
  })
  const resizeStateRef = useRef<{ startX: number; startWidth: number; prevUserSelect: string } | null>(null)
  const resizeCleanupRef = useRef<null | (() => void)>(null)

  const clampThreadPaneWidthPx = useCallback((w: number) => {
    const min = 320
    // Keep at least ~360px for the main conversation column.
    const viewportW = typeof window !== 'undefined' ? window.innerWidth : 1200
    const max = Math.min(900, Math.max(min, viewportW - 360))
    const next = Math.round(w)
    return Math.max(min, Math.min(max, next))
  }, [])

  useEffect(() => {
    // Initialize from localStorage (or sensible defaults per breakpoint).
    try {
      const raw = typeof window !== 'undefined' ? window.localStorage.getItem(THREAD_PANE_WIDTH_STORAGE_KEY) : null
      const parsed = raw ? Number(raw) : NaN
      const hasStored = Number.isFinite(parsed) && parsed > 0
      const viewportW = typeof window !== 'undefined' ? window.innerWidth : 1200
      const defaultWidth = viewportW >= 1536 ? 720 : viewportW >= 1280 ? 660 : viewportW >= 1024 ? 600 : 480
      setThreadPaneWidthPx(clampThreadPaneWidthPx(hasStored ? parsed : defaultWidth))
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    try {
      if (typeof window === 'undefined') return
      window.localStorage.setItem(THREAD_PANE_WIDTH_STORAGE_KEY, String(threadPaneWidthPx))
    } catch {
      // ignore
    }
  }, [threadPaneWidthPx])

  useEffect(() => {
    // Clamp on viewport resize so the handle can't push content offscreen.
    if (typeof window === 'undefined') return
    const onResize = () => setThreadPaneWidthPx(prev => clampThreadPaneWidthPx(prev))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [clampThreadPaneWidthPx])

  useEffect(() => {
    // Safety: if the user navigates away mid-drag, ensure we clean up listeners and restore user-select.
    return () => {
      try {
        resizeCleanupRef.current?.()
      } catch {
        /* ignore */
      }
    }
  }, [])

  const handleThreadResizePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return
      if (typeof window === 'undefined') return

      // If somehow still resizing, cleanup first.
      resizeCleanupRef.current?.()

      const startX = e.clientX
      const startWidth = threadPaneWidthPx

      const prevUserSelect = document.body.style.userSelect
      document.body.style.userSelect = 'none'

      resizeStateRef.current = { startX, startWidth, prevUserSelect }

      const onMove = (ev: PointerEvent) => {
        const state = resizeStateRef.current
        if (!state) return
        // Pane is on the right; moving pointer right shrinks the pane.
        const dx = ev.clientX - state.startX
        setThreadPaneWidthPx(clampThreadPaneWidthPx(state.startWidth - dx))
      }

      const cleanup = () => {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        const state = resizeStateRef.current
        if (state) {
          document.body.style.userSelect = state.prevUserSelect
        }
        resizeStateRef.current = null
        resizeCleanupRef.current = null
      }

      const onUp = () => cleanup()

      resizeCleanupRef.current = cleanup
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
    },
    [clampThreadPaneWidthPx, threadPaneWidthPx]
  )

  // Memoize params to prevent unnecessary rerenders
  const routeParams = useMemo(
    () => ({
      slug: params.slug as string,
      conversationId: params.conversationId as string | undefined,
    }),
    [params.slug, params.conversationId, searchParams]
  )

  const { data: starshipData } = useStarshipBySlug(routeParams.slug)
  const { data: channelsData, isLoading: channelsLoading } = useStarshipChannels(starshipData?.id ?? '', Boolean(starshipData?.id))
  const { data: directMessagesData, isLoading: directMessagesLoading } = useStarshipDirectMessages(starshipData?.id ?? '', Boolean(starshipData?.id))
  const { data: agentsData, isLoading: agentsLoading } = useStarshipAgents(starshipData?.id ?? '', Boolean(starshipData?.id))
  const { data: membersAndInvites } = useStarshipMembersAndInvites(starshipData?.id ?? '', Boolean(starshipData?.id))

  const agentLabelById = useMemo(() => {
    const m = new Map<string, string>()
    const list = Array.isArray(agentsData) ? (agentsData as any[]) : []
    for (const a of list) {
      const id = typeof (a as any)?.id === 'string' ? String((a as any).id).trim() : ''
      if (!id) continue
      const label = formatAgentDisplayName(a as any)
      m.set(id, String(label || '').trim() || String((a as any)?.name || (a as any)?.slug || 'Agent'))
    }
    return m
  }, [agentsData])

  const userLabelById = useMemo(() => {
    const m = new Map<string, string>()
    const list = Array.isArray((membersAndInvites as any)?.members) ? (((membersAndInvites as any).members as any[]) ?? []) : []
    for (const it of list) {
      const id = typeof it?.userId === 'string' ? String(it.userId).trim() : ''
      if (!id) continue
      const label = String(it?.displayName || it?.email || '').trim()
      if (!label) continue
      m.set(id, label)
    }
    return m
  }, [membersAndInvites])

  const markRead = useMarkConversationRead()
  useEffect(() => {
    const cid = typeof routeParams.conversationId === 'string' ? routeParams.conversationId : ''
    if (!cid) return
    void markRead.mutateAsync(cid).catch(() => undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeParams.conversationId])

  const threadKey = useMemo(() => {
    const raw = searchParams.get('thread')
    const v = typeof raw === 'string' ? raw.trim() : ''
    return v.length > 0 ? v : null
  }, [searchParams])

  const isDraftThreadOpen = threadKey === 'draft'
  const threadConversationId = useMemo(() => {
    if (!threadKey) return null
    if (threadKey === 'draft') return null
    return threadKey
  }, [threadKey])

  useEffect(() => {
    const cid = typeof threadConversationId === 'string' ? threadConversationId : ''
    if (!cid) return
    void markRead.mutateAsync(cid).catch(() => undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadConversationId])

  const setThreadConversationIdInUrl = useCallback(
    (conversationId: string | null) => {
      const next = new URLSearchParams(searchParams.toString())
      if (conversationId) next.set('thread', conversationId)
      else next.delete('thread')
      const qs = next.toString()
      // Preserve the current route (including /conversations/:conversationId) and other query params.
      const basePath = routeParams.conversationId ? `/ship/${routeParams.slug}/conversations/${routeParams.conversationId}` : `/ship/${routeParams.slug}`
      router.push(qs ? `${basePath}?${qs}` : basePath)
    },
    [router, routeParams.conversationId, routeParams.slug, searchParams]
  )

  useEffect(() => {
    // If thread id changes via back/forward / manual URL edits, clear per-thread ephemeral state.
    const prev = lastThreadConversationIdRef.current
    if (prev !== threadKey) {
      lastThreadConversationIdRef.current = threadKey
      const pending = pendingThreadStateRef.current
      if (pending && pending.threadKey === threadKey) {
        pendingThreadStateRef.current = null
        setThreadPinnedFirstMessage(pending.pinnedFirstMessage)
        setThreadAgent(pending.threadAgent)
        setThreadDraftParentConversationId(pending.draftParentConversationId)
        setThreadDraftTitle(pending.draftTitle)
      } else {
        setThreadPinnedFirstMessage(null)
        setThreadAgent(null)
        setThreadDraftParentConversationId(null)
        setThreadDraftTitle(null)
      }
    }
  }, [threadKey])

  useEffect(() => {
    // Refresh-safe pin hydration (see ChannelsLayout for rationale).
    const threadId = typeof threadConversationId === 'string' ? threadConversationId.trim() : ''
    if (!threadId) return
    if (isDraftThreadOpen) return
    if (threadPinnedFirstMessage) return

    let cancelled = false
    ;(async () => {
      try {
        const convoResp = await api.get(`/api/v1/conversations/${encodeURIComponent(threadId)}`)
        const convo = (convoResp as any)?.data?.data ?? (convoResp as any)?.data ?? null
        const parentId = typeof convo?.parentConversationId === 'string' ? convo.parentConversationId.trim() : ''
        if (!parentId) return

        const msgsResp = await api.get(`/api/v1/conversations/${encodeURIComponent(parentId)}/messages`, { params: { limit: 200 } })
        const payload = (msgsResp as any)?.data?.data ?? (msgsResp as any)?.data ?? null
        const msgs = Array.isArray(payload?.messages) ? (payload.messages as any[]) : []
        const pinned = msgs.find(m => String((m as any)?.linkedConversationId ?? '').trim() === threadId) ?? null
        if (cancelled) return
        if (pinned) setThreadPinnedFirstMessage(pinned as any)
      } catch {
        // ignore (best-effort hydration)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [threadConversationId, isDraftThreadOpen, threadPinnedFirstMessage])

  const handleThreadCreated = useCallback(
    (cid: string) => {
      // Persist the "pinned first message" across the draft -> real thread transition.
      // Otherwise, when the `thread` query param updates from `draft` -> `<cid>`, the
      // `threadKey` effect will clear the pinned message and it disappears.
      const nextThreadKey = String(cid)
      pendingThreadStateRef.current = {
        threadKey: nextThreadKey,
        threadAgent: threadAgent ?? null,
        pinnedFirstMessage: threadPinnedFirstMessage ?? null,
        draftParentConversationId: null,
        draftTitle: null,
      }
      setThreadConversationIdInUrl(nextThreadKey)
    },
    [setThreadConversationIdInUrl, threadAgent, threadPinnedFirstMessage]
  )

  const handleCloseThread = useCallback(() => {
    setThreadPinnedFirstMessage(null)
    setThreadAgent(null)
    setThreadDraftParentConversationId(null)
    setThreadDraftTitle(null)
    pendingThreadStateRef.current = {
      threadKey: null,
      threadAgent: null,
      pinnedFirstMessage: null,
      draftParentConversationId: null,
      draftTitle: null,
    }
    setThreadConversationIdInUrl(null)
  }, [setThreadConversationIdInUrl])

  // When opening a draft thread purely via URL (e.g. forum "New thread"), default parent to the current conversation.
  useEffect(() => {
    if (!isDraftThreadOpen) return
    if (threadDraftParentConversationId) return
    const parent = typeof routeParams.conversationId === 'string' ? routeParams.conversationId.trim() : ''
    if (!parent) return
    setThreadDraftParentConversationId(parent)
    setThreadDraftTitle('New thread')
  }, [isDraftThreadOpen, routeParams.conversationId, threadDraftParentConversationId])

  // Conversations is not part of the navigation onboarding flow.
  useEffect(() => {
    if (shouldShowOnboarding) {
      router.replace('/marketplace')
    }
  }, [shouldShowOnboarding, router])

  const isDraftDm = useMemo(() => {
    const dm = searchParams.get('dm')
    return dm === 'draft'
  }, [searchParams])

  const agentFromUrl = useMemo(() => {
    const raw = searchParams.get('agent')
    const v = typeof raw === 'string' ? raw.trim() : ''
    return v.length > 0 ? v : null
  }, [searchParams])

  // DM landing: `?agent=<slug|id>` should open a DM with that agent (existing if present, otherwise draft).
  useEffect(() => {
    if (!starshipData?.id) return
    if (shouldShowOnboarding) return
    if (routeParams.conversationId) return
    if (!agentFromUrl) return
    if (agentsLoading || directMessagesLoading) return

    const agents = Array.isArray(agentsData) ? (agentsData as any[]) : []
    const agent =
      agents.find(
        a =>
          String((a as any)?.slug || '')
            .trim()
            .toLowerCase() === agentFromUrl.toLowerCase()
      ) ??
      agents.find(a => String((a as any)?.id || '').trim() === agentFromUrl) ??
      null
    if (!agent?.id) return

    const list = ((directMessagesData as any)?.directMessages || []) as DirectMessageListItem[]
    const existingCid =
      list
        .map((item: any) => (item as any)?.dm)
        .filter((dm: any) => dm && dm.dmType === 'user_agent')
        .find((dm: any) => String(dm.agentId || '') === String(agent.id))?.conversationId ?? null

    if (existingCid) {
      router.replace(`/ship/${routeParams.slug}/conversations/${encodeURIComponent(String(existingCid))}`)
      return
    }

    // Open draft DM view targeted at this agent.
    router.replace(`/ship/${routeParams.slug}/dm?dm=draft&dmType=user_agent&agentId=${encodeURIComponent(String(agent.id))}`)
  }, [agentFromUrl, agentsData, agentsLoading, directMessagesData, directMessagesLoading, routeParams.conversationId, routeParams.slug, router, shouldShowOnboarding, starshipData?.id])

  const pickAutoChannelSlug = useMemo(() => {
    const channels = channelsData?.channels ?? []
    const lobby = channels.find(
      (ch: any) =>
        String(ch?.slug || '')
          .trim()
          .toLowerCase() === 'lobby'
    )
    const lobbySlug = lobby?.slug ? String(lobby.slug) : ''
    if (lobbySlug) return lobbySlug

    const firstSlug = channels.length > 0 ? String((channels[0] as any)?.slug || '') : ''
    return firstSlug || null
  }, [channelsData?.channels])

  const channelSlugForCurrentConversationId = useMemo(() => {
    const cid = typeof routeParams.conversationId === 'string' ? String(routeParams.conversationId) : ''
    if (!cid) return null
    const channels = channelsData?.channels ?? []
    const match = channels.find((ch: any) => String(ch?.conversationId || '') === cid) ?? null
    const slug = match?.slug ? String(match.slug) : ''
    return slug || null
  }, [channelsData?.channels, routeParams.conversationId])

  const hasAutoNavigatedRef = useRef(false)
  useEffect(() => {
    if (hasAutoNavigatedRef.current) return
    if (shouldShowOnboarding) return
    if (!starshipData?.id) return
    if (routeParams.conversationId) return
    if (isDraftDm) return
    // If `agent` is present, DM landing logic will handle navigation.
    if (agentFromUrl) return

    // Always open the default channel (lobby), falling back to first channel.
    if (channelsLoading) return
    if (pickAutoChannelSlug) {
      hasAutoNavigatedRef.current = true
      // When redirecting to a channel, only carry channel-relevant query params.
      const next = new URLSearchParams()
      const thread = (searchParams.get('thread') || '').trim()
      if (thread) next.set('thread', thread)
      const qs = next.toString()
      router.replace(qs ? `/ship/${routeParams.slug}/channels/${encodeURIComponent(pickAutoChannelSlug)}?${qs}` : `/ship/${routeParams.slug}/channels/${encodeURIComponent(pickAutoChannelSlug)}`)
      return
    }
    // Nothing to open (should be rare now that starships have default channels) → send to marketplace.
    hasAutoNavigatedRef.current = true
    router.replace('/marketplace')
  }, [agentFromUrl, shouldShowOnboarding, starshipData?.id, routeParams.conversationId, routeParams.slug, isDraftDm, router, pickAutoChannelSlug, channelsLoading, searchParams])

  // If the user is on /conversations/:id but that id is a channel-backed conversation, redirect to /channels/:channelSlug.
  useEffect(() => {
    if (!starshipData?.id) return
    if (channelsLoading) return
    if (!routeParams.conversationId) return
    if (!channelSlugForCurrentConversationId) return
    // When redirecting to a channel, only carry channel-relevant query params.
    const next = new URLSearchParams()
    const thread = (searchParams.get('thread') || '').trim()
    if (thread) next.set('thread', thread)
    const qs = next.toString()
    router.replace(
      qs
        ? `/ship/${routeParams.slug}/channels/${encodeURIComponent(channelSlugForCurrentConversationId)}?${qs}`
        : `/ship/${routeParams.slug}/channels/${encodeURIComponent(channelSlugForCurrentConversationId)}`
    )
  }, [channelSlugForCurrentConversationId, channelsLoading, routeParams.conversationId, routeParams.slug, router, searchParams, starshipData?.id])

  // Handle conversation change from ConversationInterface
  // Must be called before any early returns to satisfy React Hooks rules
  const handleConversationChange = useCallback(
    (newConversationId: string | null) => {
      // If we're transitioning out of a "draft DM" view, drop the draft-only query params.
      const sp = new URLSearchParams(searchParams.toString())
      sp.delete('dm')
      sp.delete('dmType')
      sp.delete('agentId')
      sp.delete('peerUserId')
      sp.delete('peerLabel')
      sp.delete('peerAvatar')
      if (newConversationId) {
        const cid = String(newConversationId)
        const channels = channelsData?.channels ?? []
        const match = channels.find((ch: any) => String(ch?.conversationId || '') === cid) ?? null
        const channelSlug = match?.slug ? String(match.slug) : ''
        if (channelSlug) {
          // When routing into channels, only carry channel-relevant query params.
          const next = new URLSearchParams()
          const thread = (sp.get('thread') || '').trim()
          if (thread) next.set('thread', thread)
          const qs = next.toString()
          router.push(qs ? `/ship/${routeParams.slug}/channels/${encodeURIComponent(channelSlug)}?${qs}` : `/ship/${routeParams.slug}/channels/${encodeURIComponent(channelSlug)}`)
          return
        }
        const qs = sp.toString()
        router.push(qs ? `/ship/${routeParams.slug}/conversations/${cid}?${qs}` : `/ship/${routeParams.slug}/conversations/${cid}`)
      } else {
        const qs = sp.toString()
        router.push(qs ? `/ship/${routeParams.slug}?${qs}` : `/ship/${routeParams.slug}`)
      }
    },
    [channelsData?.channels, router, routeParams.slug, searchParams]
  )

  // Don't render conversations interface if we're redirecting to onboarding
  if (shouldShowOnboarding) {
    return null
  }

  if (!starshipData) {
    return null // Layout handles loading/error states
  }

  const isThreadPaneOpen = Boolean(threadKey)

  // IMPORTANT: do not add hooks below conditional early-returns (starshipData loading, onboarding, etc.).
  // A plain object avoids violating Rules of Hooks when starshipData appears/disappears between renders.
  const threadPaneSharedProps = {
    starshipId: starshipData.id,
    starshipSlug: routeParams.slug,
    conversationId: threadConversationId,
    pinnedFirstMessage: threadPinnedFirstMessage,
    draftParentConversationId: isDraftThreadOpen ? threadDraftParentConversationId : null,
    draftTitle: isDraftThreadOpen ? threadDraftTitle : null,
    selectedAgent: threadAgent,
    onAgentChange: setThreadAgent,
    onThreadCreated: handleThreadCreated,
    onClose: handleCloseThread,
  } as const

  return (
    <div className="h-screen w-full flex flex-col md:flex-row min-w-0">
      <div
        className="flex-1 min-w-0 h-full"
        style={{
          ['--conversation-right-gutter' as any]: isThreadPaneOpen ? '16px' : '52px',
        }}
      >
        <ConversationInterface
          starshipId={starshipData.id}
          conversationId={routeParams.conversationId || null}
          onConversationChange={handleConversationChange}
          onOpenThread={({ conversationId, defaultAgent, linkedMessage, parentConversationId }) => {
            const nextThreadKey = conversationId ? String(conversationId) : 'draft'
            const nextPinned = linkedMessage ?? null

            // Preserve the existing selection ONLY when re-opening the same thread; otherwise reset.
            const nextAgent = nextThreadKey === threadKey ? (threadAgent ?? defaultAgent ?? null) : (defaultAgent ?? null)

            pendingThreadStateRef.current = {
              threadKey: nextThreadKey,
              threadAgent: nextAgent,
              pinnedFirstMessage: nextPinned,
              draftParentConversationId: null,
              draftTitle: null,
            }

            setThreadAgent(nextAgent)
            setThreadPinnedFirstMessage(nextPinned)

            // If we already have a thread conversation id, open it via URL param.
            if (conversationId) {
              setThreadConversationIdInUrl(conversationId)
              return
            }

            // Draft thread opening (no conversationId yet): open the pane without persisting anything.
            // The thread conversation (and link to the parent message) is created on the first reply.
            const parent = typeof parentConversationId === 'string' ? parentConversationId.trim() : ''
            setThreadDraftParentConversationId(parent || null)
            const rawInput = String((linkedMessage as any)?.content ?? '')
            const raw = sanitizeThreadTitleSnippetFromMessageContent(rawInput, { agentLabelById, userLabelById })
            const snippet = raw.length > 0 ? raw.slice(0, 64) : ''
            const title = snippet ? `Thread: ${snippet}` : 'New thread'
            setThreadDraftTitle(title)
            pendingThreadStateRef.current = {
              threadKey: 'draft',
              threadAgent: nextAgent,
              pinnedFirstMessage: nextPinned,
              draftParentConversationId: parent || null,
              draftTitle: title,
            }
            setThreadConversationIdInUrl('draft')
          }}
          initialAgentId={undefined}
          starshipSlug={routeParams.slug}
        />
      </div>

      {/* Thread split pane (desktop/tablet) */}
      {isThreadPaneOpen ? (
        <>
          {/* Draggable resize handle (desktop/tablet) */}
          <div className="hidden md:flex relative h-full w-[1px] flex-shrink-0 bg-border">
            {/* Invisible drag hit-area (keep resizing easy without a thick visual divider) */}
            <div
              className="absolute inset-y-0 -left-3 w-6 cursor-col-resize select-none"
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize thread pane"
              onPointerDown={handleThreadResizePointerDown}
              title="Drag to resize"
            />
          </div>

          <aside
            className="hidden md:block h-full flex-shrink-0 bg-background min-w-0"
            style={{
              width: threadPaneWidthPx,
            }}
          >
            <ThreadPane {...threadPaneSharedProps} className="w-full min-w-0" />
          </aside>
        </>
      ) : null}

      {/* Thread in-flow pane (mobile) */}
      {isThreadPaneOpen ? (
        <aside className="md:hidden h-[45vh] flex-shrink-0 border-t border-border bg-background min-w-0">
          <ThreadPane {...threadPaneSharedProps} />
        </aside>
      ) : null}

      {/* Hide children since ConversationInterface now handles everything */}
      <div style={{ display: 'none' }}>{children}</div>
    </div>
  )
}
