'use client'

import { ConversationInterface } from '@/components/conversation/ConversationInterface'
import { ThreadPane } from '@/components/conversation/ThreadPane'
import { useStarshipChannels } from '@/hooks/useConversations'
import { useStarshipBySlug } from '@/hooks/useStarships'
import type { AgentModel, MessageModel } from '@starships/protocol'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigationOnboardingContext } from '@/contexts/NavigationOnboardingContext'

export default function ChannelsLayout({ children }: { children: React.ReactNode }) {
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
  const [threadPaneWidthPx, setThreadPaneWidthPx] = useState<number>(420)
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
      const defaultWidth = typeof window !== 'undefined' && window.innerWidth >= 1024 ? 520 : 420
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

  const routeParams = useMemo(
    () => ({
      slug: params.slug as string,
      channelSlug: params.channelSlug as string | undefined,
    }),
    [params.slug, params.channelSlug, searchParams]
  )

  const { data: starshipData } = useStarshipBySlug(routeParams.slug)
  const { data: channelsData, isLoading: channelsLoading } = useStarshipChannels(starshipData?.id ?? '', Boolean(starshipData?.id))

  const normalizedChannelSlug = useMemo(() => String(routeParams.channelSlug || '').trim().toLowerCase(), [routeParams.channelSlug])

  const activeChannel = useMemo(() => {
    const channels = channelsData?.channels ?? []
    if (!normalizedChannelSlug) return null
    return channels.find((ch: any) => String(ch?.slug || '').trim().toLowerCase() === normalizedChannelSlug) ?? null
  }, [channelsData?.channels, normalizedChannelSlug])

  const activeConversationId = useMemo(() => {
    const cid = activeChannel?.conversationId
    return cid ? String(cid) : null
  }, [activeChannel?.conversationId])

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

  const setThreadConversationIdInUrl = useCallback(
    (conversationId: string | null) => {
      const next = new URLSearchParams(searchParams.toString())
      if (conversationId) next.set('thread', conversationId)
      else next.delete('thread')
      const qs = next.toString()
      const basePath =
        routeParams.channelSlug && String(routeParams.channelSlug).trim()
          ? `/ship/${routeParams.slug}/channels/${encodeURIComponent(String(routeParams.channelSlug))}`
          : `/ship/${routeParams.slug}`
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

  const handleThreadCreated = useCallback(
    (cid: string) => {
      setThreadConversationIdInUrl(cid)
    },
    [setThreadConversationIdInUrl]
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

  // Channels is not part of the navigation onboarding flow.
  useEffect(() => {
    if (shouldShowOnboarding) {
      router.replace('/marketplace')
    }
  }, [shouldShowOnboarding, router])

  const isDraftDm = useMemo(() => {
    const dm = searchParams.get('dm')
    return dm === 'draft'
  }, [searchParams])

  const pickAutoChannelSlug = useMemo(() => {
    const channels = channelsData?.channels ?? []
    const lobby = channels.find((ch: any) => String(ch?.slug || '').trim().toLowerCase() === 'lobby')
    const lobbySlug = lobby?.slug ? String(lobby.slug) : ''
    if (lobbySlug) return lobbySlug

    const firstSlug = channels.length > 0 ? String((channels[0] as any)?.slug || '') : ''
    return firstSlug || null
  }, [channelsData?.channels])

  const hasAutoNavigatedRef = useRef(false)
  useEffect(() => {
    if (hasAutoNavigatedRef.current) return
    if (shouldShowOnboarding) return
    if (!starshipData?.id) return
    if (routeParams.channelSlug) return
    if (isDraftDm) return

    if (channelsLoading) return
    if (pickAutoChannelSlug) {
      hasAutoNavigatedRef.current = true
      // Preserve query params (e.g. thread), but drop agent to prevent "starter" behaviors.
      const sp = new URLSearchParams(searchParams.toString())
      sp.delete('agent')
      const qs = sp.toString()
      router.replace(qs ? `/ship/${routeParams.slug}/channels/${encodeURIComponent(pickAutoChannelSlug)}?${qs}` : `/ship/${routeParams.slug}/channels/${encodeURIComponent(pickAutoChannelSlug)}`)
      return
    }

    hasAutoNavigatedRef.current = true
    router.replace('/marketplace')
  }, [
    shouldShowOnboarding,
    starshipData?.id,
    routeParams.channelSlug,
    routeParams.slug,
    isDraftDm,
    router,
    pickAutoChannelSlug,
    channelsLoading,
    searchParams,
  ])

  // If the channel slug is invalid (no matching channel), redirect to default channel.
  useEffect(() => {
    if (!starshipData?.id) return
    if (channelsLoading) return
    if (!routeParams.channelSlug) return
    if (activeChannel) return
    if (!pickAutoChannelSlug) return
    const sp = new URLSearchParams(searchParams.toString())
    const qs = sp.toString()
    router.replace(qs ? `/ship/${routeParams.slug}/channels/${encodeURIComponent(pickAutoChannelSlug)}?${qs}` : `/ship/${routeParams.slug}/channels/${encodeURIComponent(pickAutoChannelSlug)}`)
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
      const qs = sp.toString()

      if (!newConversationId) {
        router.push(qs ? `/ship/${routeParams.slug}?${qs}` : `/ship/${routeParams.slug}`)
        return
      }

      const cid = String(newConversationId)
      const channels = channelsData?.channels ?? []
      const matchingChannel = channels.find((ch: any) => String(ch?.conversationId || '') === cid) ?? null
      if (matchingChannel?.slug) {
        const channelSlug = String(matchingChannel.slug)
        router.push(qs ? `/ship/${routeParams.slug}/channels/${encodeURIComponent(channelSlug)}?${qs}` : `/ship/${routeParams.slug}/channels/${encodeURIComponent(channelSlug)}`)
        return
      }

      router.push(qs ? `/ship/${routeParams.slug}/conversations/${encodeURIComponent(cid)}?${qs}` : `/ship/${routeParams.slug}/conversations/${encodeURIComponent(cid)}`)
    },
    [channelsData?.channels, router, routeParams.slug, searchParams]
  )

  if (shouldShowOnboarding) {
    return null
  }

  if (!starshipData) {
    return null
  }

  const isThreadPaneOpen = Boolean(threadKey)

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
            const raw = String((linkedMessage as any)?.content ?? '')
              .trim()
              .replace(/\s+/g, ' ')
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
      {isThreadPaneOpen ? (
        <>
          {/* Draggable resize handle (desktop/tablet) */}
          <div className="hidden md:flex relative h-full w-[1px] flex-shrink-0 bg-border">
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

