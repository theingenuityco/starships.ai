'use client'

import { ThreadPane } from '@/components/conversation/ThreadPane'
import { NotificationMenu } from '@/components/conversation/NotificationMenu'
import { ViewPane } from '@/components/views/ViewPane'
import { RoomThreadIndexView } from '@/components/rooms/RoomThreadIndexView'
import { RoomResourcesPane } from '@/components/rooms/RoomResourcesPane'
import Icon from '@/components/primitives/Icon'
import { useStarshipBySlug } from '@/hooks/useStarships'
import { useMarkConversationRead } from '@/hooks/useNotifications'
import { usePinRoomAgent, usePinRoomDataset, usePinRoomTaskBoard, usePinRoomTool, usePinRoomView, useRoomPins, useStarshipRooms, useStarshipTaskBoards, useUnpinRoomAgent, useUnpinRoomDataset, useUnpinRoomTaskBoard, useUnpinRoomTool, useUnpinRoomView } from '@/hooks/useRooms'
import { useStarshipViews } from '@/hooks/useViews'
import { useStarshipDatasets } from '@/hooks/useDatasets'
import { cn } from '@/lib/utils'
import type { AgentModel, RoomModel } from '@starships/protocol'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuthContext } from '@/providers/auth-provider'
import { useStarshipAgents } from '@/hooks/useAgents'
import { useStarshipTools } from '@/hooks/useTools'

export default function RoomsLayout({ children }: { children: React.ReactNode }) {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user } = useAuthContext()

  const [threadAgent, setThreadAgent] = useState<AgentModel | null>(null)
  const [threadDraftParentConversationId, setThreadDraftParentConversationId] = useState<string | null>(null)
  const [threadDraftTitle, setThreadDraftTitle] = useState<string | null>(null)

  // Desktop side pane width (draggable resizer) - match Channels thread pane behavior
  const RESOURCES_PANE_WIDTH_STORAGE_KEY = 'starships.roomResourcesPaneWidthPx'
  const [resourcesPaneWidthPx, setResourcesPaneWidthPx] = useState<number>(() => {
    if (typeof window === 'undefined') return 600
    const w = window.innerWidth
    if (w >= 1536) return 720
    if (w >= 1280) return 660
    if (w >= 1024) return 600
    return 480
  })
  const [isResizingResourcesPane, setIsResizingResourcesPane] = useState<boolean>(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const resizeStateRef = useRef<{ startX: number; startWidth: number; prevUserSelect: string } | null>(null)
  const resizeCleanupRef = useRef<null | (() => void)>(null)
  const resizeRafRef = useRef<number | null>(null)
  const pendingResourcesPaneWidthPxRef = useRef<number | null>(null)

  const clampResourcesPaneWidthPx = useCallback((w: number) => {
    const min = 320
    const viewportW = typeof window !== 'undefined' ? window.innerWidth : 1200
    const max = Math.min(900, Math.max(min, viewportW - 360))
    const next = Math.round(w)
    return Math.max(min, Math.min(max, next))
  }, [])

  const clampResourcesPaneWidthPxRef = useRef(clampResourcesPaneWidthPx)
  useEffect(() => {
    clampResourcesPaneWidthPxRef.current = clampResourcesPaneWidthPx
  }, [clampResourcesPaneWidthPx])

  useEffect(() => {
    try {
      const raw = typeof window !== 'undefined' ? window.localStorage.getItem(RESOURCES_PANE_WIDTH_STORAGE_KEY) : null
      const parsed = raw ? Number(raw) : NaN
      const hasStored = Number.isFinite(parsed) && parsed > 0
      const viewportW = typeof window !== 'undefined' ? window.innerWidth : 1200
      const defaultWidth = viewportW >= 1536 ? 720 : viewportW >= 1280 ? 660 : viewportW >= 1024 ? 600 : 480
      setResourcesPaneWidthPx(clampResourcesPaneWidthPx(hasStored ? parsed : defaultWidth))
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    try {
      if (typeof window === 'undefined') return
      window.localStorage.setItem(RESOURCES_PANE_WIDTH_STORAGE_KEY, String(resourcesPaneWidthPx))
    } catch {
      // ignore
    }
  }, [resourcesPaneWidthPx])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const onResize = () => setResourcesPaneWidthPx(prev => clampResourcesPaneWidthPxRef.current(prev))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    return () => {
      try {
        resizeCleanupRef.current?.()
      } catch {
        /* ignore */
      }
    }
  }, [])

  const handleResourcesResizePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return
      if (typeof window === 'undefined') return

      resizeCleanupRef.current?.()

      const startX = e.clientX
      const startWidth = resourcesPaneWidthPx
      setIsResizingResourcesPane(true)

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
        const dx = ev.clientX - state.startX
        const next = clampResourcesPaneWidthPx(state.startWidth - dx)
        pendingResourcesPaneWidthPxRef.current = next
        if (resizeRafRef.current != null) return
        resizeRafRef.current = window.requestAnimationFrame(() => {
          resizeRafRef.current = null
          const w = pendingResourcesPaneWidthPxRef.current
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
        if (state) document.body.style.userSelect = state.prevUserSelect
        resizeStateRef.current = null
        resizeCleanupRef.current = null
        const finalW = pendingResourcesPaneWidthPxRef.current
        pendingResourcesPaneWidthPxRef.current = null
        if (typeof finalW === 'number') {
          applyWidth(finalW)
          setResourcesPaneWidthPx(finalW)
        }
        setIsResizingResourcesPane(false)
      }

      const onUp = () => cleanup()

      resizeCleanupRef.current = cleanup
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
    },
    [clampResourcesPaneWidthPx, resourcesPaneWidthPx]
  )

  const routeParams = useMemo(
    () => ({
      slug: params.slug as string,
      roomSlug: params.roomSlug as string | undefined,
      threadId: (params as any)?.threadId as string | undefined,
    }),
    [params.slug, params.roomSlug, (params as any)?.threadId]
  )
  const isRoomsIndexRoute = useMemo(() => {
    const raw = typeof routeParams.roomSlug === 'string' ? routeParams.roomSlug : ''
    return raw.trim().length === 0
  }, [routeParams.roomSlug])

  const { data: starshipData } = useStarshipBySlug(routeParams.slug)
  const { data: roomsData, isLoading: roomsLoading } = useStarshipRooms(starshipData?.id ?? '', Boolean(starshipData?.id))

  const normalizedRoomSlug = useMemo(
    () =>
      String(routeParams.roomSlug || '')
        .trim()
        .toLowerCase(),
    [routeParams.roomSlug]
  )

  const activeRoom = useMemo(() => {
    const rooms = roomsData?.rooms ?? []
    if (!normalizedRoomSlug) return null
    return (
      rooms.find(
        (r: RoomModel) =>
          String(r.slug || '')
            .trim()
            .toLowerCase() === normalizedRoomSlug
      ) ?? null
    )
  }, [roomsData?.rooms, normalizedRoomSlug])

  const activeConversationId = useMemo(() => {
    const cid = activeRoom?.conversationId
    return cid ? String(cid) : null
  }, [activeRoom?.conversationId])

  const markRead = useMarkConversationRead()
  useEffect(() => {
    const cid = typeof activeConversationId === 'string' ? activeConversationId : ''
    if (!cid) return
    void markRead.mutateAsync(cid).catch(() => undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeConversationId])

  const routeThreadKey = useMemo(() => {
    const raw = typeof routeParams.threadId === 'string' ? routeParams.threadId : ''
    const v = String(raw || '').trim()
    return v.length > 0 ? v : null
  }, [routeParams.threadId])

  // Back-compat: support old `?thread=` URLs by navigating to the new route.
  const legacyThreadKey = useMemo(() => {
    const raw = searchParams.get('thread')
    const v = typeof raw === 'string' ? raw.trim() : ''
    return v.length > 0 ? v : null
  }, [searchParams])

  const viewKey = useMemo(() => {
    const raw = searchParams.get('view')
    const v = typeof raw === 'string' ? raw.trim() : ''
    return v.length > 0 ? v : null
  }, [searchParams])

  const roomPaneKey = useMemo(() => {
    const raw = searchParams.get('pane')
    const v = typeof raw === 'string' ? raw.trim() : ''
    return v.length > 0 ? v : null
  }, [searchParams])
  const isResourcesPaneOpen = roomPaneKey === 'resources'
  const paneKind = (isResourcesPaneOpen ? 'resources' : null) as 'resources' | null
  const isSidePaneOpen = Boolean(paneKind)
  const PANE_ANIM_MS = 300
  const PANE_OPEN_CONTENT_DELAY_MS = 120
  const [isSidePaneMounted, setIsSidePaneMounted] = useState<boolean>(isSidePaneOpen)
  const openMountTimerRef = useRef<number | null>(null)

  useEffect(() => {
    if (isSidePaneOpen) {
      if (openMountTimerRef.current != null) window.clearTimeout(openMountTimerRef.current)
      openMountTimerRef.current = window.setTimeout(() => setIsSidePaneMounted(true), PANE_OPEN_CONTENT_DELAY_MS)
      return () => {
        if (openMountTimerRef.current != null) window.clearTimeout(openMountTimerRef.current)
        openMountTimerRef.current = null
      }
    }
    if (openMountTimerRef.current != null) window.clearTimeout(openMountTimerRef.current)
    openMountTimerRef.current = null
    const t = window.setTimeout(() => setIsSidePaneMounted(false), PANE_ANIM_MS)
    return () => window.clearTimeout(t)
  }, [isSidePaneOpen])

  const threadKey = routeThreadKey
  const isDraftThreadOpen = threadKey === 'draft'
  const threadConversationId = useMemo(() => {
    if (!threadKey) return null
    if (threadKey === 'draft') return null
    return threadKey
  }, [threadKey])

  const isViewPaneOpen = Boolean(viewKey)

  const roomBasePath = useMemo(() => {
    return routeParams.roomSlug && String(routeParams.roomSlug).trim()
      ? `/ship/${routeParams.slug}/rooms/${encodeURIComponent(String(routeParams.roomSlug))}`
      : `/ship/${routeParams.slug}/rooms`
  }, [routeParams.roomSlug, routeParams.slug])

  const setThreadKeyInUrl = useCallback(
    (nextThreadKey: string | null) => {
      if (nextThreadKey) {
        router.push(`${roomBasePath}/thread/${encodeURIComponent(String(nextThreadKey))}`)
        return
      }
      // Clear thread route entirely.
      router.push(roomBasePath)
    },
    [router, roomBasePath]
  )

  const setViewKeyInUrl = useCallback(
    (nextViewKey: string | null) => {
      const next = new URLSearchParams(searchParams.toString())
      if (nextViewKey) next.set('view', nextViewKey)
      else next.delete('view')
      next.delete('pane')
      next.delete('thread')
      const qs = next.toString()
      const basePath =
        routeParams.roomSlug && String(routeParams.roomSlug).trim()
          ? `/ship/${routeParams.slug}/rooms/${encodeURIComponent(String(routeParams.roomSlug))}`
          : `/ship/${routeParams.slug}/rooms`
      router.push(qs ? `${basePath}?${qs}` : basePath)
    },
    [router, routeParams.roomSlug, routeParams.slug, searchParams]
  )

  const setRoomPaneInUrl = useCallback(
    (nextPaneKey: string | null) => {
      const next = new URLSearchParams(searchParams.toString())
      if (nextPaneKey) next.set('pane', nextPaneKey)
      else next.delete('pane')
      next.delete('view')
      next.delete('thread')
      const qs = next.toString()
      const basePath =
        routeParams.roomSlug && String(routeParams.roomSlug).trim()
          ? `/ship/${routeParams.slug}/rooms/${encodeURIComponent(String(routeParams.roomSlug))}`
          : `/ship/${routeParams.slug}/rooms`
      router.push(qs ? `${basePath}?${qs}` : basePath)
    },
    [router, routeParams.roomSlug, routeParams.slug, searchParams]
  )

  useEffect(() => {
    if (!legacyThreadKey) return
    if (routeThreadKey) return
    if (!routeParams.roomSlug || !String(routeParams.roomSlug).trim()) return
    router.replace(`${roomBasePath}/thread/${encodeURIComponent(String(legacyThreadKey))}`)
  }, [legacyThreadKey, roomBasePath, routeParams.roomSlug, routeThreadKey, router])

  // Default parent for draft threads is the active room conversation id.
  useEffect(() => {
    if (!isDraftThreadOpen) return
    if (threadDraftParentConversationId) return
    const parent = typeof activeConversationId === 'string' ? activeConversationId.trim() : ''
    if (!parent) return
    setThreadDraftParentConversationId(parent)
    setThreadDraftTitle('New thread')
  }, [activeConversationId, isDraftThreadOpen, threadDraftParentConversationId])

  // If slug is present but doesn't match a room, show a not-found UI (hard cutover; no redirects).
  const isInvalidRoomSlug = Boolean(routeParams.roomSlug && !roomsLoading && !activeRoom)

  const { data: pinsData } = useRoomPins(activeConversationId || '', Boolean(activeConversationId))
  const { data: starshipViews = [] } = useStarshipViews(starshipData?.id ?? '', Boolean(starshipData?.id))
  const { data: datasets = [] } = useStarshipDatasets(starshipData?.id ?? '', Boolean(starshipData?.id))
  const { data: taskBoards = [] } = useStarshipTaskBoards(starshipData?.id ?? '', Boolean(starshipData?.id))
  const { data: agents = [] } = useStarshipAgents(starshipData?.id ?? '', Boolean(starshipData?.id))
  const { data: tools = [] } = useStarshipTools(starshipData?.id ?? '', Boolean(starshipData?.id))

  const canManagePins = useMemo(() => {
    const uid = typeof user?.id === 'string' ? user.id : ''
    const ownerId = typeof (starshipData as any)?.ownerId === 'string' ? String((starshipData as any).ownerId) : ''
    return Boolean(uid && ownerId && String(uid) === String(ownerId))
  }, [starshipData, user?.id])

  const pinView = usePinRoomView(activeConversationId || '', starshipData?.id ?? '')
  const unpinView = useUnpinRoomView(activeConversationId || '')
  const pinDataset = usePinRoomDataset(activeConversationId || '')
  const unpinDataset = useUnpinRoomDataset(activeConversationId || '')
  const pinBoard = usePinRoomTaskBoard(activeConversationId || '')
  const unpinBoard = useUnpinRoomTaskBoard(activeConversationId || '')
  const pinAgent = usePinRoomAgent(activeConversationId || '')
  const unpinAgent = useUnpinRoomAgent(activeConversationId || '')
  const pinTool = usePinRoomTool(activeConversationId || '')
  const unpinTool = useUnpinRoomTool(activeConversationId || '')

  const viewLabelById = useMemo(() => {
    const m = new Map<string, string>()
    for (const v of Array.isArray(starshipViews) ? starshipViews : []) {
      const id = typeof (v as any)?.id === 'string' ? String((v as any).id).trim() : ''
      if (!id) continue
      const name = String((v as any)?.name || (v as any)?.slug || 'View').trim()
      m.set(id, name)
    }
    return m
  }, [starshipViews])

  const datasetLabelById = useMemo(() => {
    const m = new Map<string, string>()
    for (const d of Array.isArray(datasets) ? datasets : []) {
      const id = typeof (d as any)?.id === 'string' ? String((d as any).id).trim() : ''
      if (!id) continue
      const name = String((d as any)?.name || (d as any)?.slug || 'Dataset').trim()
      m.set(id, name)
    }
    return m
  }, [datasets])

  const taskBoardLabelById = useMemo(() => {
    const m = new Map<string, string>()
    for (const b of Array.isArray(taskBoards) ? taskBoards : []) {
      const id = typeof (b as any)?.id === 'string' ? String((b as any).id).trim() : ''
      if (!id) continue
      const name = String((b as any)?.name || (b as any)?.slug || 'Board').trim()
      m.set(id, name)
    }
    return m
  }, [taskBoards])

  const agentLabelById = useMemo(() => {
    const m = new Map<string, string>()
    for (const a of Array.isArray(agents) ? agents : []) {
      const id = typeof (a as any)?.id === 'string' ? String((a as any).id).trim() : ''
      if (!id) continue
      const name = String((a as any)?.name || (a as any)?.slug || 'Agent').trim()
      m.set(id, name)
    }
    return m
  }, [agents])

  const agentSlugById = useMemo(() => {
    const m = new Map<string, string>()
    for (const a of Array.isArray(agents) ? agents : []) {
      const id = typeof (a as any)?.id === 'string' ? String((a as any).id).trim() : ''
      if (!id) continue
      const slug = String((a as any)?.slug || '').trim()
      if (!slug) continue
      m.set(id, slug)
    }
    return m
  }, [agents])

  const toolLabelById = useMemo(() => {
    const m = new Map<string, string>()
    for (const t of Array.isArray(tools) ? tools : []) {
      const id = typeof (t as any)?.id === 'string' ? String((t as any).id).trim() : ''
      if (!id) continue
      const name = String((t as any)?.name || (t as any)?.slug || 'Tool').trim()
      m.set(id, name)
    }
    return m
  }, [tools])

  const toolSlugById = useMemo(() => {
    const m = new Map<string, string>()
    for (const t of Array.isArray(tools) ? tools : []) {
      const id = typeof (t as any)?.id === 'string' ? String((t as any).id).trim() : ''
      if (!id) continue
      const slug = String((t as any)?.slug || '').trim()
      if (!slug) continue
      m.set(id, slug)
    }
    return m
  }, [tools])

  const availableViews = useMemo(() => {
    const list = Array.isArray(starshipViews) ? starshipViews : []
    return list
      .map((v: any) => ({ id: String(v?.id || '').trim(), name: String(v?.name || v?.slug || 'View').trim() }))
      .filter((v) => Boolean(v.id))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [starshipViews])

  const availableDatasets = useMemo(() => {
    const list = Array.isArray(datasets) ? datasets : []
    return list
      .map((d: any) => ({ id: String(d?.id || '').trim(), name: String(d?.name || d?.slug || 'Dataset').trim() }))
      .filter((d) => Boolean(d.id))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [datasets])

  const availableTaskBoards = useMemo(() => {
    const list = Array.isArray(taskBoards) ? taskBoards : []
    return list
      .map((b: any) => ({ id: String(b?.id || '').trim(), name: String(b?.name || b?.slug || 'Board').trim() }))
      .filter((b) => Boolean(b.id))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [taskBoards])

  const availableAgents = useMemo(() => {
    const list = Array.isArray(agents) ? agents : []
    return list
      .map((a: any) => ({ id: String(a?.id || '').trim(), name: String(a?.name || a?.slug || 'Agent').trim() }))
      .filter((a) => Boolean(a.id))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [agents])

  const availableTools = useMemo(() => {
    const list = Array.isArray(tools) ? tools : []
    return list
      .map((t: any) => ({ id: String(t?.id || '').trim(), name: String(t?.name || t?.slug || 'Tool').trim() }))
      .filter((t) => Boolean(t.id))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [tools])

  const handleThreadCreated = useCallback(
    (cid: string) => {
      setThreadDraftParentConversationId(null)
      setThreadDraftTitle(null)
      setThreadKeyInUrl(String(cid))
    },
    [setThreadKeyInUrl]
  )

  const handleCloseThread = useCallback(() => {
    setThreadDraftParentConversationId(null)
    setThreadDraftTitle(null)
    setThreadKeyInUrl(null)
  }, [setThreadKeyInUrl])

  const onOpenPinnedView = useCallback(
    (viewId: string) => {
      const id = String(viewId || '').trim()
      if (!id) return
      setViewKeyInUrl(id)
    },
    [setViewKeyInUrl]
  )

  if (isRoomsIndexRoute) {
    return <>{children}</>
  }

  if (!starshipData) {
    return null
  }

  if (isInvalidRoomSlug) {
    return (
      <div className="h-screen w-full flex items-center justify-center px-6">
        <div className="max-w-md w-full text-center space-y-3">
          <div className="text-lg font-semibold">Room not found</div>
          <div className="text-sm text-muted-foreground">This room doesn’t exist (or was migrated from forum channels and is now only accessible via `/rooms`).</div>
          <div className="flex items-center justify-center gap-2 pt-2">
            <button
              type="button"
              className="text-sm underline underline-offset-2"
              onClick={() => router.replace(`/ship/${routeParams.slug}`)}
            >
              Go to starship
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Prevent a brief flash when resolving the active room on hard reload.
  const isResolvingActiveRoom = Boolean(normalizedRoomSlug && !activeConversationId && roomsLoading)
  if (isResolvingActiveRoom) {
    return null
  }

  return (
    <div
      ref={rootRef}
      className="relative h-full w-full flex flex-col md:flex-row min-w-0 overflow-x-hidden"
      style={{
        ['--thread-pane-width' as any]: `${resourcesPaneWidthPx}px`,
      }}
    >
      <div className={cn('flex-1 min-w-0 h-full', isSidePaneOpen && 'hidden md:block')}>
        {activeConversationId && threadKey ? (
          <ThreadPane
            starshipId={starshipData.id}
            starshipSlug={routeParams.slug}
            conversationId={threadConversationId}
            draftParentConversationId={isDraftThreadOpen ? threadDraftParentConversationId : null}
            draftTitle={isDraftThreadOpen ? threadDraftTitle : null}
            selectedAgent={threadAgent}
            onAgentChange={setThreadAgent}
            onThreadCreated={handleThreadCreated}
            onClose={handleCloseThread}
            titlePrefix={
              <button
                type="button"
                className="inline-flex h-4 w-4 items-center justify-center text-foreground hover:text-foreground transition-colors"
                onClick={handleCloseThread}
                aria-label="Back to room"
                title="Back to room"
              >
                <Icon name="arrow-left" className="h-4 w-4" />
              </button>
            }
            titlePrepend={
              <span className="inline-flex items-center whitespace-nowrap text-foreground">
                <span>{String(activeRoom?.name ?? activeRoom?.slug ?? 'Room')}</span>
                <span className="mx-1">/</span>
              </span>
            }
            mobileLeftSlot={<span className="mx-2 inline-flex h-8 w-8" aria-hidden="true" />}
            titleRightSlot={<NotificationMenu type="room" roomId={activeConversationId} starshipId={starshipData.id} />}
            hideCloseButton={true}
            className="h-full"
          />
        ) : activeConversationId ? (
          <RoomThreadIndexView
            starshipId={starshipData.id}
            roomConversationId={activeConversationId}
            roomSlug={activeRoom?.slug ?? null}
            roomName={activeRoom?.name ?? null}
            roomIsPrivate={Boolean(activeRoom?.isPrivate)}
            starshipSlug={routeParams.slug}
            pinnedViews={pinsData?.views ?? null}
            pinnedDatasets={pinsData?.datasets ?? null}
            pinnedTaskBoards={pinsData?.taskBoards ?? null}
            pinnedAgents={(pinsData as any)?.agents ?? null}
            pinnedTools={(pinsData as any)?.tools ?? null}
            viewLabelById={viewLabelById}
            datasetLabelById={datasetLabelById}
            taskBoardLabelById={taskBoardLabelById}
            agentLabelById={agentLabelById}
            toolLabelById={toolLabelById}
            agentSlugById={agentSlugById}
            toolSlugById={toolSlugById}
            onOpenPinnedView={onOpenPinnedView}
            canManagePins={canManagePins}
            onOpenResourcesPane={() => setRoomPaneInUrl('resources')}
            availableViews={availableViews}
            availableDatasets={availableDatasets}
            availableTaskBoards={availableTaskBoards}
            availableAgents={availableAgents}
            availableTools={availableTools}
            onPinView={(viewId) => pinView.mutate({ viewId })}
            onUnpinView={(viewId) => unpinView.mutate(viewId)}
            onPinDataset={(datasetId) => pinDataset.mutate({ datasetId })}
            onUnpinDataset={(datasetId) => unpinDataset.mutate(datasetId)}
            onPinTaskBoard={(boardId) => pinBoard.mutate({ boardId })}
            onUnpinTaskBoard={(boardId) => unpinBoard.mutate(boardId)}
            onPinAgent={(agentId) => pinAgent.mutate({ agentId })}
            onUnpinAgent={(agentId) => unpinAgent.mutate(agentId)}
            onPinTool={(toolId) => pinTool.mutate({ toolId })}
            onUnpinTool={(toolId) => unpinTool.mutate(toolId)}
            onCreateDraftThread={() => {
              setThreadKeyInUrl('draft')
            }}
            onThreadConversationStarted={({ conversationId, selectedAgent }) => {
              setThreadAgent(selectedAgent ?? null)
              setThreadKeyInUrl(String(conversationId))
            }}
          />
        ) : null}
      </div>

      {/* Resources split pane (desktop/tablet) - match Channels thread pane behavior */}
      <>
        <div
          className={`hidden md:block h-full flex-shrink-0 ${isResizingResourcesPane ? '' : 'transition-all duration-300 ease-in-out'}`}
          style={{
            width: isSidePaneOpen ? 'var(--thread-pane-width)' : 0,
            willChange: 'width',
          }}
          aria-hidden="true"
        />

        <aside
          className={`hidden md:block absolute inset-y-0 right-0 bg-background min-w-0 overflow-hidden ${isSidePaneOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
          style={{
            width: 'var(--thread-pane-width)',
            transform: isSidePaneOpen ? 'translateX(0px)' : 'translateX(var(--thread-pane-width))',
            transition: isResizingResourcesPane ? 'none' : 'transform 300ms cubic-bezier(0.4, 0, 0.2, 1), opacity 200ms ease-out',
            willChange: 'transform, opacity',
            contain: 'layout style paint',
          }}
          aria-hidden={!isSidePaneOpen}
        >
          <div className="absolute inset-y-0 left-0 w-[1px] bg-border" aria-hidden="true" />
          <div
            className="absolute inset-y-0 -left-3 w-6 cursor-col-resize select-none"
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize side pane"
            onPointerDown={handleResourcesResizePointerDown}
            title="Drag to resize"
          />

          <div className="h-full pl-[1px]">
            {isSidePaneMounted ? (
              paneKind === 'resources' ? (
                <RoomResourcesPane
                  starshipId={starshipData.id}
                  starshipSlug={routeParams.slug}
                  roomConversationId={activeConversationId || ''}
                  roomSlug={activeRoom?.slug ?? null}
                  roomName={activeRoom?.name ?? null}
                  pinnedViews={pinsData?.views ?? null}
                  pinnedDatasets={pinsData?.datasets ?? null}
                  pinnedTaskBoards={pinsData?.taskBoards ?? null}
                  pinnedAgents={(pinsData as any)?.agents ?? null}
                  pinnedTools={(pinsData as any)?.tools ?? null}
                  viewLabelById={viewLabelById}
                  datasetLabelById={datasetLabelById}
                  taskBoardLabelById={taskBoardLabelById}
                  agentLabelById={agentLabelById}
                  toolLabelById={toolLabelById}
                  agentSlugById={agentSlugById}
                  toolSlugById={toolSlugById}
                  onOpenPinnedView={onOpenPinnedView}
                  canManagePins={canManagePins}
                  availableViews={availableViews}
                  availableDatasets={availableDatasets}
                  availableTaskBoards={availableTaskBoards}
                  availableAgents={availableAgents}
                  availableTools={availableTools}
                  onPinView={(viewId) => pinView.mutate({ viewId })}
                  onUnpinView={(viewId) => unpinView.mutate(viewId)}
                  onPinDataset={(datasetId) => pinDataset.mutate({ datasetId })}
                  onUnpinDataset={(datasetId) => unpinDataset.mutate(datasetId)}
                  onPinTaskBoard={(boardId) => pinBoard.mutate({ boardId })}
                  onUnpinTaskBoard={(boardId) => unpinBoard.mutate(boardId)}
                  onPinAgent={(agentId) => pinAgent.mutate({ agentId })}
                  onUnpinAgent={(agentId) => unpinAgent.mutate(agentId)}
                  onPinTool={(toolId) => pinTool.mutate({ toolId })}
                  onUnpinTool={(toolId) => unpinTool.mutate(toolId)}
                  onClose={() => setRoomPaneInUrl(null)}
                />
              ) : null
            ) : (
              <div className="h-full w-full flex items-center justify-center text-muted-foreground text-sm">Loading resources…</div>
            )}
          </div>
        </aside>
      </>

      {/* Resources full-screen overlay (mobile) */}
      <aside
        className={cn(
          'md:hidden absolute inset-0 z-[30] bg-background min-w-0 overflow-hidden',
          isSidePaneOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        )}
        style={{
          transition: 'opacity 200ms ease-out',
          willChange: 'opacity',
        }}
        aria-hidden={!isSidePaneOpen}
      >
        {isSidePaneMounted ? (
          paneKind === 'resources' ? (
            <RoomResourcesPane
              starshipId={starshipData.id}
              starshipSlug={routeParams.slug}
              roomConversationId={activeConversationId || ''}
              roomSlug={activeRoom?.slug ?? null}
              roomName={activeRoom?.name ?? null}
              pinnedViews={pinsData?.views ?? null}
              pinnedDatasets={pinsData?.datasets ?? null}
              pinnedTaskBoards={pinsData?.taskBoards ?? null}
              pinnedAgents={(pinsData as any)?.agents ?? null}
              pinnedTools={(pinsData as any)?.tools ?? null}
              viewLabelById={viewLabelById}
              datasetLabelById={datasetLabelById}
              taskBoardLabelById={taskBoardLabelById}
              agentLabelById={agentLabelById}
              toolLabelById={toolLabelById}
              agentSlugById={agentSlugById}
              toolSlugById={toolSlugById}
              onOpenPinnedView={onOpenPinnedView}
              canManagePins={canManagePins}
              availableViews={availableViews}
              availableDatasets={availableDatasets}
              availableTaskBoards={availableTaskBoards}
              availableAgents={availableAgents}
              availableTools={availableTools}
              onPinView={(viewId) => pinView.mutate({ viewId })}
              onUnpinView={(viewId) => unpinView.mutate(viewId)}
              onPinDataset={(datasetId) => pinDataset.mutate({ datasetId })}
              onUnpinDataset={(datasetId) => unpinDataset.mutate(datasetId)}
              onPinTaskBoard={(boardId) => pinBoard.mutate({ boardId })}
              onUnpinTaskBoard={(boardId) => unpinBoard.mutate(boardId)}
              onPinAgent={(agentId) => pinAgent.mutate({ agentId })}
              onUnpinAgent={(agentId) => unpinAgent.mutate(agentId)}
              onPinTool={(toolId) => pinTool.mutate({ toolId })}
              onUnpinTool={(toolId) => unpinTool.mutate(toolId)}
              onClose={() => setRoomPaneInUrl(null)}
            />
          ) : null
        ) : (
          <div className="h-full w-full flex items-center justify-center text-muted-foreground text-sm">Loading resources…</div>
        )}
      </aside>

      {/* Side pane overlays */}
      {isViewPaneOpen ? (
        <div className="absolute inset-0 z-[30] bg-background/80 backdrop-blur-sm">
          <div className="absolute inset-0" onClick={() => setViewKeyInUrl(null)} />
          <div className="absolute inset-y-0 right-0 w-full md:w-[720px] bg-background border-l border-border/60 shadow-xl">
            {viewKey ? (
              <ViewPane
                starshipId={starshipData.id}
                viewId={viewKey}
                onClose={() => setViewKeyInUrl(null)}
                className="h-full"
              />
            ) : null}
          </div>
        </div>
      ) : null}

      {/* Hide children since this layout owns the UI */}
      <div style={{ display: 'none' }}>{children}</div>
    </div>
  )
}

