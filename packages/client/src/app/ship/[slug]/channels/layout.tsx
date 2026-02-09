'use client'

import { ConversationInterface } from '@/components/conversation/ConversationInterface'
import { ThreadPane } from '@/components/conversation/ThreadPane'
import { useStarshipChannels } from '@/hooks/useConversations'
import { useStarshipBySlug } from '@/hooks/useStarships'
import { useMarkConversationRead } from '@/hooks/useNotifications'
import type { AgentModel, MessageModel } from '@starships/protocol'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useStarshipAgents } from '@/hooks/useAgents'
import { useStarshipMembersAndInvites } from '@/hooks/useStarshipMembers'
import { formatAgentDisplayName } from '@/lib/agentDisplay'
import api from '@/lib/api'
import { LoadingSpinner } from '@/components/ui/simple-loading'

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
    // Structured mention tokens emitted by the composer (agents + users).
    // Convert to plain-text @Name (NOT a structured token) so it renders correctly but doesn't "decode" via token parsing.
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
    // Strip any other structured mention tokens defensively.
    .replace(/<@[^>\n]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  return s
}

export default function ChannelsLayout({ children }: { children: React.ReactNode }) {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
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
  const [isResizingThreadPane, setIsResizingThreadPane] = useState<boolean>(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const resizeStateRef = useRef<{ startX: number; startWidth: number; prevUserSelect: string } | null>(null)
  const resizeCleanupRef = useRef<null | (() => void)>(null)
  const resizeRafRef = useRef<number | null>(null)
  const pendingThreadPaneWidthPxRef = useRef<number | null>(null)

  const clampThreadPaneWidthPx = useCallback((w: number) => {
    const min = 320
    // Keep at least ~360px for the main conversation column.
    const viewportW = typeof window !== 'undefined' ? window.innerWidth : 1200
    const max = Math.min(900, Math.max(min, viewportW - 360))
    const next = Math.round(w)
    return Math.max(min, Math.min(max, next))
  }, [])

  const clampThreadPaneWidthPxRef = useRef(clampThreadPaneWidthPx)
  useEffect(() => {
    clampThreadPaneWidthPxRef.current = clampThreadPaneWidthPx
  }, [clampThreadPaneWidthPx])

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
    const onResize = () => setThreadPaneWidthPx(prev => clampThreadPaneWidthPxRef.current(prev))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

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
      setIsResizingThreadPane(true)

      const prevUserSelect = document.body.style.userSelect
      document.body.style.userSelect = 'none'

      resizeStateRef.current = { startX, startWidth, prevUserSelect }

      const applyWidth = (w: number) => {
        try {
          rootRef.current?.style.setProperty('--thread-pane-width', `${w}px`)
        } catch {
          // ignore
        }
      }

      const onMove = (ev: PointerEvent) => {
        const state = resizeStateRef.current
        if (!state) return
        // Pane is on the right; moving pointer right shrinks the pane.
        const dx = ev.clientX - state.startX
        const next = clampThreadPaneWidthPx(state.startWidth - dx)
        pendingThreadPaneWidthPxRef.current = next
        if (resizeRafRef.current != null) return
        resizeRafRef.current = window.requestAnimationFrame(() => {
          resizeRafRef.current = null
          const w = pendingThreadPaneWidthPxRef.current
          if (typeof w === 'number') applyWidth(w)
        })
      }

      const cleanup = () => {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        if (resizeRafRef.current != null) {
          window.cancelAnimationFrame(resizeRafRef.current)
          resizeRafRef.current = null
        }
        const state = resizeStateRef.current
        if (state) {
          document.body.style.userSelect = state.prevUserSelect
        }
        resizeStateRef.current = null
        resizeCleanupRef.current = null
        const finalW = pendingThreadPaneWidthPxRef.current
        pendingThreadPaneWidthPxRef.current = null
        if (typeof finalW === 'number') {
          applyWidth(finalW)
          setThreadPaneWidthPx(finalW)
        }
        setIsResizingThreadPane(false)
      }

      const onUp = () => cleanup()

      resizeCleanupRef.current = cleanup
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
    },
    [clampThreadPaneWidthPx, threadPaneWidthPx]
  )

  const routeParams = useMemo(
    () => ({
      slug: params.slug as string,
      channelSlug: params.channelSlug as string | undefined,
    }),
    [params.slug, params.channelSlug]
  )

  const { data: starshipData } = useStarshipBySlug(routeParams.slug)
  const { data: channelsData, isLoading: channelsLoading } = useStarshipChannels(starshipData?.id ?? '', Boolean(starshipData?.id))
  const { data: agentsData } = useStarshipAgents(starshipData?.id ?? '', Boolean(starshipData?.id))
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

  const normalizedChannelSlug = useMemo(
    () =>
      String(routeParams.channelSlug || '')
        .trim()
        .toLowerCase(),
    [routeParams.channelSlug]
  )

  const activeChannel = useMemo(() => {
    const channels = channelsData?.channels ?? []
    if (!normalizedChannelSlug) return null
    return (
      channels.find(
        (ch: any) =>
          String(ch?.slug || '')
            .trim()
            .toLowerCase() === normalizedChannelSlug
      ) ?? null
    )
  }, [channelsData?.channels, normalizedChannelSlug])

  const activeConversationId = useMemo(() => {
    const cid = activeChannel?.conversationId
    return cid ? String(cid) : null
  }, [activeChannel?.conversationId])

  const markRead = useMarkConversationRead()
  useEffect(() => {
    const cid = typeof activeConversationId === 'string' ? activeConversationId : ''
    if (!cid) return
    // Best-effort: mark the open channel as read to clear unread styling/badges.
    // (Server is authoritative and will resolve latest message.)
    void markRead.mutateAsync(cid).catch(() => undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeConversationId])

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

  const isThreadPaneOpen = Boolean(threadKey)
  const THREAD_PANE_ANIM_MS = 300
  const THREAD_PANE_OPEN_CONTENT_DELAY_MS = 120
  const [isThreadPaneMounted, setIsThreadPaneMounted] = useState<boolean>(isThreadPaneOpen)
  const openMountTimerRef = useRef<number | null>(null)

  useEffect(() => {
    if (isThreadPaneOpen) {
      // Let the pane animate open immediately; mount heavy content shortly after.
      if (openMountTimerRef.current != null) window.clearTimeout(openMountTimerRef.current)
      openMountTimerRef.current = window.setTimeout(() => setIsThreadPaneMounted(true), THREAD_PANE_OPEN_CONTENT_DELAY_MS)
      return () => {
        if (openMountTimerRef.current != null) window.clearTimeout(openMountTimerRef.current)
        openMountTimerRef.current = null
      }
    }
    if (openMountTimerRef.current != null) window.clearTimeout(openMountTimerRef.current)
    openMountTimerRef.current = null
    const t = window.setTimeout(() => setIsThreadPaneMounted(false), THREAD_PANE_ANIM_MS)
    return () => window.clearTimeout(t)
  }, [isThreadPaneOpen])

  useEffect(() => {
    const cid = typeof threadConversationId === 'string' ? threadConversationId : ''
    if (!cid) return
    void markRead.mutateAsync(cid).catch(() => undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadConversationId])

  const setThreadConversationIdInUrl = useCallback(
    (conversationId: string | null) => {
      // Only persist channel-relevant query params.
      const next = new URLSearchParams()
      if (conversationId) next.set('thread', conversationId)
      const qs = next.toString()
      const basePath =
        routeParams.channelSlug && String(routeParams.channelSlug).trim() ? `/ship/${routeParams.slug}/channels/${encodeURIComponent(String(routeParams.channelSlug))}` : `/ship/${routeParams.slug}`
      router.push(qs ? `${basePath}?${qs}` : basePath)
    },
    [router, routeParams.channelSlug, routeParams.slug, searchParams]
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
    // Refresh-safe pin hydration:
    // The thread pane's "pinned first message" is normally passed via ephemeral state when the user clicks
    // a message. On refresh, that state is lost, so re-derive it by:
    // - loading the thread conversation to get its parentConversationId
    // - scanning the parent conversation messages for the message whose linkedConversationId points to this thread
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

  // When opening a draft thread purely via URL (e.g. forum "New thread"), default parent to the current channel conversation.
  useEffect(() => {
    if (!isDraftThreadOpen) return
    if (threadDraftParentConversationId) return
    const parent = typeof activeConversationId === 'string' ? activeConversationId.trim() : ''
    if (!parent) return
    setThreadDraftParentConversationId(parent)
    setThreadDraftTitle('New thread')
  }, [activeConversationId, isDraftThreadOpen, threadDraftParentConversationId])

  const isDraftDm = useMemo(() => {
    const dm = searchParams.get('dm')
    return dm === 'draft'
  }, [searchParams])

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

  const hasAutoNavigatedRef = useRef(false)
  const pendingAutoNavigateHrefRef = useRef<string | null>(null)
  useEffect(() => {
    if (!starshipData?.id) return
    if (routeParams.channelSlug) return
    if (isDraftDm) return

    if (channelsLoading) return
    if (hasAutoNavigatedRef.current) return

    // When redirecting to a channel, only carry channel-relevant query params.
    // (Do not forward arbitrary params like `agent`.)
    const next = new URLSearchParams()
    const thread = (searchParams.get('thread') || '').trim()
    if (thread) next.set('thread', thread)
    const qs = next.toString()

    const href = pickAutoChannelSlug
      ? qs
        ? `/ship/${routeParams.slug}/channels/${encodeURIComponent(pickAutoChannelSlug)}?${qs}`
        : `/ship/${routeParams.slug}/channels/${encodeURIComponent(pickAutoChannelSlug)}`
      : '/marketplace'

    // StrictMode/concurrent safety: schedule navigation and cancel it if this effect is cleaned up
    // before it gets to run (e.g. dev double-invocation).
    if (pendingAutoNavigateHrefRef.current === href) return
    pendingAutoNavigateHrefRef.current = href
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      if (pendingAutoNavigateHrefRef.current !== href) return
      hasAutoNavigatedRef.current = true
      router.replace(href)
    })
    return () => {
      cancelled = true
      if (pendingAutoNavigateHrefRef.current === href) pendingAutoNavigateHrefRef.current = null
    }
  }, [starshipData?.id, routeParams.channelSlug, routeParams.slug, isDraftDm, router, pickAutoChannelSlug, channelsLoading, searchParams])

  // If the channel slug is invalid (no matching channel), redirect to default channel.
  useEffect(() => {
    if (!starshipData?.id) return
    if (channelsLoading) return
    if (!routeParams.channelSlug) return
    if (activeChannel) return
    if (!pickAutoChannelSlug) return
    // When redirecting to a channel, only carry channel-relevant query params.
    const next = new URLSearchParams()
    const thread = (searchParams.get('thread') || '').trim()
    if (thread) next.set('thread', thread)
    const qs = next.toString()
    const href = qs ? `/ship/${routeParams.slug}/channels/${encodeURIComponent(pickAutoChannelSlug)}?${qs}` : `/ship/${routeParams.slug}/channels/${encodeURIComponent(pickAutoChannelSlug)}`
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      router.replace(href)
    })
    return () => {
      cancelled = true
    }
  }, [activeChannel, channelsLoading, pickAutoChannelSlug, routeParams.channelSlug, routeParams.slug, router, searchParams, starshipData?.id])

  // Handle conversation change from ConversationInterface:
  // - If it maps to a channel, stay in /channels/:channelSlug
  // - Otherwise (DM or non-channel conversation), go to /conversations/:conversationId
  const handleConversationChange = useCallback(
    (newConversationId: string | null) => {
      const sp = new URLSearchParams(searchParams.toString())
      sp.delete('dm')
      sp.delete('dmType')
      sp.delete('agentId')
      sp.delete('peerUserId')
      sp.delete('peerLabel')
      sp.delete('peerAvatar')

      if (!newConversationId) {
        const qs = sp.toString()
        router.push(qs ? `/ship/${routeParams.slug}?${qs}` : `/ship/${routeParams.slug}`)
        return
      }

      const cid = String(newConversationId)
      const channels = channelsData?.channels ?? []
      const matchingChannel = channels.find((ch: any) => String(ch?.conversationId || '') === cid) ?? null
      if (matchingChannel?.slug) {
        // When routing into channels, only carry channel-relevant query params.
        const next = new URLSearchParams()
        const thread = (sp.get('thread') || '').trim()
        if (thread) next.set('thread', thread)
        const qs = next.toString()
        const channelSlug = String(matchingChannel.slug)
        router.push(qs ? `/ship/${routeParams.slug}/channels/${encodeURIComponent(channelSlug)}?${qs}` : `/ship/${routeParams.slug}/channels/${encodeURIComponent(channelSlug)}`)
        return
      }

      const qs = sp.toString()
      router.push(qs ? `/ship/${routeParams.slug}/conversations/${encodeURIComponent(cid)}?${qs}` : `/ship/${routeParams.slug}/conversations/${encodeURIComponent(cid)}`)
    },
    [channelsData?.channels, router, routeParams.slug, searchParams]
  )

  if (!starshipData) {
    return null
  }

  // Prevent a brief "starter screen" flash on hard reloads inside a channel:
  // `activeConversationId` is derived from `channelsData`, which can be loading on first paint.
  // If we render `ConversationInterface` with `conversationId=null`, it correctly shows the starter UI,
  // but that's incorrect UX for an existing channel route.
  const isResolvingActiveChannelConversationId = Boolean(normalizedChannelSlug && !activeConversationId && channelsLoading)
  if (isResolvingActiveChannelConversationId) {
    return (
      <div className="h-screen w-full flex items-center justify-center">
        <LoadingSpinner size="lg">Loading channel…</LoadingSpinner>
      </div>
    )
  }

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
    <div
      ref={rootRef}
      className="relative h-screen w-full flex flex-col md:flex-row min-w-0 overflow-x-hidden"
      style={{
        ['--thread-pane-width' as any]: `${threadPaneWidthPx}px`,
      }}
    >
      <div
        className="flex-1 min-w-0 h-full"
        style={{
          ['--conversation-right-gutter' as any]: isThreadPaneOpen ? '16px' : '52px',
        }}
      >
        <ConversationInterface
          starshipId={starshipData.id}
          conversationId={activeConversationId || null}
          onConversationChange={handleConversationChange}
          onOpenThread={({ conversationId, defaultAgent, linkedMessage, parentConversationId }) => {
            const nextThreadKey = conversationId ? String(conversationId) : 'draft'
            const nextPinned = linkedMessage ?? null

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

            if (conversationId) {
              setThreadConversationIdInUrl(conversationId)
              return
            }

            const parent = typeof parentConversationId === 'string' ? parentConversationId.trim() : ''
            setThreadDraftParentConversationId(parent || activeConversationId || null)
            const rawInput = String((linkedMessage as any)?.content ?? '')
            const raw = sanitizeThreadTitleSnippetFromMessageContent(rawInput, { agentLabelById, userLabelById })
            const snippet = raw.length > 0 ? raw.slice(0, 64) : ''
            const title = snippet ? `Thread: ${snippet}` : 'New thread'
            setThreadDraftTitle(title)
            pendingThreadStateRef.current = {
              threadKey: 'draft',
              threadAgent: nextAgent,
              pinnedFirstMessage: nextPinned,
              draftParentConversationId: parent || activeConversationId || null,
              draftTitle: title,
            }
            setThreadConversationIdInUrl('draft')
          }}
          initialAgentId={undefined}
          starshipSlug={routeParams.slug}
        />
      </div>

      {/* Thread split pane (desktop/tablet) */}
      <>
        {/* Spacer (in flow): animates the main column width smoothly. */}
        <div
          className={`hidden md:block h-full flex-shrink-0 ${isResizingThreadPane ? '' : 'transition-all duration-300 ease-in-out'}`}
          style={{
            width: isThreadPaneOpen ? 'var(--thread-pane-width)' : 0,
            willChange: 'width',
          }}
          aria-hidden="true"
        />

        {/* Thread pane (overlay): slide using transform for smoothness. */}
        <aside
          className={`hidden md:block absolute inset-y-0 right-0 bg-background min-w-0 overflow-hidden ${isThreadPaneOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
          style={{
            width: 'var(--thread-pane-width)',
            transform: isThreadPaneOpen ? 'translateX(0px)' : 'translateX(var(--thread-pane-width))',
            transition: isResizingThreadPane ? 'none' : 'transform 300ms cubic-bezier(0.4, 0, 0.2, 1), opacity 200ms ease-out',
            willChange: 'transform, opacity',
            contain: 'layout style paint',
          }}
          aria-hidden={!isThreadPaneOpen}
        >
          {/* Divider + resize hit-area */}
          <div className="absolute inset-y-0 left-0 w-[1px] bg-border" aria-hidden="true" />
          <div
            className="absolute inset-y-0 -left-3 w-6 cursor-col-resize select-none"
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize thread pane"
            onPointerDown={handleThreadResizePointerDown}
            title="Drag to resize"
          />

          <div className="h-full pl-[1px]">
            {isThreadPaneMounted ? (
              <ThreadPane {...threadPaneSharedProps} className="w-full min-w-0" />
            ) : (
              <div className="h-full w-full flex items-center justify-center text-muted-foreground text-sm">Loading thread…</div>
            )}
          </div>
        </aside>
      </>

      {/* Thread in-flow pane (mobile) */}
      <aside
        className={`md:hidden flex-shrink-0 bg-background min-w-0 overflow-hidden transition-all duration-300 ease-in-out ${isThreadPaneOpen ? 'border-t border-border opacity-100 pointer-events-auto' : 'border-t-0 opacity-0 pointer-events-none'}`}
        style={{
          height: isThreadPaneOpen ? '45vh' : '0px',
          willChange: 'height, opacity',
        }}
        aria-hidden={!isThreadPaneOpen}
      >
        {isThreadPaneMounted ? <ThreadPane {...threadPaneSharedProps} /> : <div className="h-full w-full flex items-center justify-center text-muted-foreground text-sm">Loading thread…</div>}
      </aside>

      {/* Hide children since ConversationInterface now handles everything */}
      <div style={{ display: 'none' }}>{children}</div>
    </div>
  )
}
