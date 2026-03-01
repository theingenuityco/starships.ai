'use client'

import { ThreadPane } from '@/components/conversation/ThreadPane'
import { NotificationMenu } from '@/components/conversation/NotificationMenu'
import { ViewPane } from '@/components/views/ViewPane'
import { RoomThreadIndexView } from '@/components/rooms/RoomThreadIndexView'
import { useStarshipBySlug } from '@/hooks/useStarships'
import { useMarkConversationRead } from '@/hooks/useNotifications'
import { usePinRoomAgent, usePinRoomDataset, usePinRoomTaskBoard, usePinRoomTool, usePinRoomView, useRoomPins, useStarshipRooms, useStarshipTaskBoards, useUnpinRoomAgent, useUnpinRoomDataset, useUnpinRoomTaskBoard, useUnpinRoomTool, useUnpinRoomView } from '@/hooks/useRooms'
import { useStarshipViews } from '@/hooks/useViews'
import { useStarshipDatasets } from '@/hooks/useDatasets'
import type { AgentModel, RoomModel } from '@starships/protocol'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'
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

  const routeParams = useMemo(
    () => ({
      slug: params.slug as string,
      roomSlug: params.roomSlug as string | undefined,
    }),
    [params.slug, params.roomSlug]
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

  const threadKey = useMemo(() => {
    const raw = searchParams.get('thread')
    const v = typeof raw === 'string' ? raw.trim() : ''
    return v.length > 0 ? v : null
  }, [searchParams])

  const viewKey = useMemo(() => {
    const raw = searchParams.get('view')
    const v = typeof raw === 'string' ? raw.trim() : ''
    return v.length > 0 ? v : null
  }, [searchParams])

  const isDraftThreadOpen = threadKey === 'draft'
  const threadConversationId = useMemo(() => {
    if (!threadKey) return null
    if (threadKey === 'draft') return null
    return threadKey
  }, [threadKey])

  const isViewPaneOpen = Boolean(viewKey)

  const setThreadKeyInUrl = useCallback(
    (nextThreadKey: string | null) => {
      const next = new URLSearchParams(searchParams.toString())
      if (nextThreadKey) next.set('thread', nextThreadKey)
      else next.delete('thread')
      next.delete('view')
      const qs = next.toString()
      const basePath =
        routeParams.roomSlug && String(routeParams.roomSlug).trim()
          ? `/ship/${routeParams.slug}/rooms/${encodeURIComponent(String(routeParams.roomSlug))}`
          : `/ship/${routeParams.slug}/rooms`
      router.push(qs ? `${basePath}?${qs}` : basePath)
    },
    [router, routeParams.roomSlug, routeParams.slug, searchParams]
  )

  const setViewKeyInUrl = useCallback(
    (nextViewKey: string | null) => {
      const next = new URLSearchParams(searchParams.toString())
      if (nextViewKey) next.set('view', nextViewKey)
      else next.delete('view')
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
    <div className="relative h-full w-full flex flex-col min-w-0">
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
          titleRightSlot={<NotificationMenu type="room" roomId={activeConversationId} starshipId={starshipData.id} />}
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

