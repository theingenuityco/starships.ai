'use client'

import { ThreadPane } from '@/components/conversation/ThreadPane'
import { NotificationMenu } from '@/components/conversation/NotificationMenu'
import { ViewPane } from '@/components/views/ViewPane'
import { RoomConversationIndexView } from '@/components/rooms/RoomConversationIndexView'
import { RoomHistoryPane } from '@/components/rooms/RoomHistoryPane'
import { RoomResourcesPane } from '@/components/rooms/RoomResourcesPane'
import { RoomParticipantsButton } from '@/components/rooms/RoomParticipantsButton'
import Icon from '@/components/primitives/Icon'
import { Button } from '@/components/ui/button'
import { useStarshipBySlug } from '@/hooks/useStarships'
import { useMarkConversationRead } from '@/hooks/useNotifications'
import {
  usePinRoomDataset,
  usePinRoomTaskBoard,
  usePinRoomView,
  useRoomTools,
  useJoinRoom,
  useRoomPins,
  useRoomParticipants,
  useRoomParticipation,
  useStarshipRooms,
  useStarshipTaskBoards,
  useUnpinRoomDataset,
  useUnpinRoomTaskBoard,
  useUnpinRoomView,
  useAssignRoomTool,
  useUnassignRoomTool,
} from '@/hooks/useRooms'
import { useStarshipViews } from '@/hooks/useViews'
import { useStarshipDatasets } from '@/hooks/useDatasets'
import { cn } from '@/lib/utils'
import type { AgentModel, MessageModel, RoomModel } from '@starships/protocol'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuthContext } from '@/providers/auth-provider'
import { useStarshipTools } from '@/hooks/useTools'
import api from '@/lib/api'

const RESOURCES_PANE_WIDTH_STORAGE_KEY = 'starships.roomResourcesPaneWidthPx'

function sanitizeThreadTitleSnippetFromMessageContent(input: string): string {
  const s = String(input || '')
    .replace(/<@[^>\n]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return s
}

export default function RoomsLayout({ children }: { children: React.ReactNode }) {
  const params = useParams<{ slug: string; roomSlug?: string; conversationId?: string; threadId?: string }>()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user } = useAuthContext()

  const [conversationAgent, setConversationAgent] = useState<AgentModel | null>(null)
  const [conversationDraftParentConversationId, setConversationDraftParentConversationId] = useState<string | null>(null)
  const [conversationDraftTitle, setConversationDraftTitle] = useState<string | null>(null)

  const [threadAgent, setThreadAgent] = useState<AgentModel | null>(null)
  const [threadPinnedFirstMessage, setThreadPinnedFirstMessage] = useState<MessageModel | null>(null)
  const [threadDraftParentConversationId, setThreadDraftParentConversationId] = useState<string | null>(null)
  const [threadDraftTitle, setThreadDraftTitle] = useState<string | null>(null)
  const lastThreadConversationKeyRef = useRef<string | null>(null)
  const pendingThreadStateRef = useRef<{
    threadKey: string | null
    threadAgent: AgentModel | null
    pinnedFirstMessage: MessageModel | null
    draftParentConversationId: string | null
    draftTitle: string | null
  } | null>(null)

  // Desktop side pane width (draggable resizer) - match Channels thread pane behavior
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
      conversationId: params.conversationId as string | undefined,
      threadId: params.threadId as string | undefined,
    }),
    [params.slug, params.roomSlug, params.conversationId, params.threadId]
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

  const routeConversationKey = useMemo(() => {
    const raw = typeof routeParams.conversationId === 'string' ? routeParams.conversationId : ''
    const v = String(raw || '').trim()
    return v.length > 0 ? v : null
  }, [routeParams.conversationId])

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
  const isHistoryPaneOpen = roomPaneKey === 'history'
  const threadKey = routeThreadKey
  const paneKind = (threadKey ? 'thread' : isResourcesPaneOpen ? 'resources' : isHistoryPaneOpen ? 'history' : null) as 'thread' | 'resources' | 'history' | null
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

  const conversationKey = routeConversationKey
  const isDraftConversationOpen = conversationKey === 'draft'
  const conversationConversationId = useMemo(() => {
    if (!conversationKey) return null
    if (conversationKey === 'draft') return null
    return conversationKey
  }, [conversationKey])

  const isDraftThreadOpen = threadKey === 'draft'
  const threadConversationId = useMemo(() => {
    if (!threadKey) return null
    if (threadKey === 'draft') return null
    return threadKey
  }, [threadKey])

  const isViewPaneOpen = Boolean(viewKey)

  const roomBasePath = useMemo(() => {
    return routeParams.roomSlug && String(routeParams.roomSlug).trim() ? `/ship/${routeParams.slug}/rooms/${encodeURIComponent(String(routeParams.roomSlug))}` : `/ship/${routeParams.slug}/rooms`
  }, [routeParams.roomSlug, routeParams.slug])

  const setConversationKeyInUrl = useCallback(
    (nextConversationKey: string | null) => {
      // Only preserve room-relevant query params; pane/thread/view are mutually exclusive UI states.
      const qs = ''
      if (nextConversationKey) {
        router.push(`${roomBasePath}/conversation/${encodeURIComponent(String(nextConversationKey))}${qs ? `?${qs}` : ''}`)
        return
      }
      router.push(`${roomBasePath}${qs ? `?${qs}` : ''}`)
    },
    [router, roomBasePath]
  )

  const setThreadKeyInUrl = useCallback(
    (nextThreadKey: string | null) => {
      const parentConversationId = typeof conversationConversationId === 'string' ? conversationConversationId.trim() : ''
      if (!parentConversationId) return
      const qs = ''
      if (nextThreadKey) {
        router.push(`${roomBasePath}/conversation/${encodeURIComponent(parentConversationId)}/thread/${encodeURIComponent(String(nextThreadKey))}${qs ? `?${qs}` : ''}`)
        return
      }
      router.push(`${roomBasePath}/conversation/${encodeURIComponent(parentConversationId)}${qs ? `?${qs}` : ''}`)
    },
    [conversationConversationId, router, roomBasePath]
  )

  const setViewKeyInUrl = useCallback(
    (nextViewKey: string | null) => {
      const next = new URLSearchParams(searchParams.toString())
      if (nextViewKey) next.set('view', nextViewKey)
      else next.delete('view')
      next.delete('pane')
      const qs = next.toString()
      const basePath = conversationConversationId ? `${roomBasePath}/conversation/${encodeURIComponent(String(conversationConversationId))}` : roomBasePath
      router.push(qs ? `${basePath}?${qs}` : basePath)
    },
    [conversationConversationId, roomBasePath, router, searchParams]
  )

  const setRoomPaneInUrl = useCallback(
    (nextPaneKey: string | null) => {
      const next = new URLSearchParams(searchParams.toString())
      if (nextPaneKey) next.set('pane', nextPaneKey)
      else next.delete('pane')
      next.delete('view')
      const qs = next.toString()
      // Preserve the open conversation, but always close nested threads when switching panes.
      const basePath = conversationConversationId ? `${roomBasePath}/conversation/${encodeURIComponent(String(conversationConversationId))}` : roomBasePath
      router.push(qs ? `${basePath}?${qs}` : basePath)
    },
    [conversationConversationId, roomBasePath, router, searchParams]
  )

  // Default parent for draft conversations is the active room conversation id.
  useEffect(() => {
    if (!isDraftConversationOpen) return
    if (conversationDraftParentConversationId) return
    const parent = typeof activeConversationId === 'string' ? activeConversationId.trim() : ''
    if (!parent) return
    setConversationDraftParentConversationId(parent)
    setConversationDraftTitle('New conversation')
  }, [activeConversationId, conversationDraftParentConversationId, isDraftConversationOpen])

  useEffect(() => {
    // When opening a draft thread via URL, default its parent to the current conversation.
    if (!isDraftThreadOpen) return
    if (threadDraftParentConversationId) return
    const parent = typeof conversationConversationId === 'string' ? conversationConversationId.trim() : ''
    if (!parent) return
    setThreadDraftParentConversationId(parent)
    setThreadDraftTitle('New thread')
  }, [conversationConversationId, isDraftThreadOpen, threadDraftParentConversationId])

  useEffect(() => {
    // If thread key changes via back/forward / manual URL edits, restore or clear ephemeral thread state.
    const prev = lastThreadConversationKeyRef.current
    if (prev !== threadKey) {
      lastThreadConversationKeyRef.current = threadKey
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
    // Refresh-safe pin hydration for nested threads:
    // derive pinned first message by asking the parent conversation for the linking message.
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

        const pinnedResp = await api.get(`/api/v1/conversations/${encodeURIComponent(parentId)}/linked-message`, {
          params: { linkedConversationId: threadId },
        })
        const payload = (pinnedResp as any)?.data?.data ?? (pinnedResp as any)?.data ?? null
        const pinned = (payload as any)?.message ?? null
        if (cancelled) return
        if (pinned) setThreadPinnedFirstMessage(pinned as any)
      } catch {
        // ignore (best-effort hydration)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [isDraftThreadOpen, threadConversationId, threadPinnedFirstMessage])

  // If slug is present but doesn't match a room, show a not-found UI (hard cutover; no redirects).
  const isInvalidRoomSlug = Boolean(routeParams.roomSlug && !roomsLoading && !activeRoom)

  const roomParticipation = useRoomParticipation(activeConversationId || '', Boolean(activeConversationId))
  const isRoomParticipant = Boolean(roomParticipation.data?.isParticipant)
  const joinRoom = useJoinRoom(activeConversationId || '')
  const roomParticipants = useRoomParticipants(activeConversationId || '', Boolean(activeConversationId && isRoomParticipant))

  const { data: pinsData } = useRoomPins(activeConversationId || '', Boolean(activeConversationId && isRoomParticipant))
  const { data: roomToolsData } = useRoomTools(activeConversationId || '', Boolean(activeConversationId && isRoomParticipant))
  const { data: starshipViews = [] } = useStarshipViews(starshipData?.id ?? '', Boolean(starshipData?.id))
  const { data: datasets = [] } = useStarshipDatasets(starshipData?.id ?? '', Boolean(starshipData?.id))
  const { data: taskBoards = [] } = useStarshipTaskBoards(starshipData?.id ?? '', Boolean(starshipData?.id))
  const { data: tools = [] } = useStarshipTools(starshipData?.id ?? '', Boolean(starshipData?.id))

  const canManagePins = useMemo(() => {
    const uid = typeof user?.id === 'string' ? user.id : ''
    const ownerId = typeof (starshipData as any)?.ownerId === 'string' ? String((starshipData as any).ownerId) : ''
    return Boolean(uid && ownerId && String(uid) === String(ownerId))
  }, [starshipData, user?.id])

  const starshipOwnerId = useMemo(() => {
    const ownerId = (starshipData as any)?.ownerId
    return typeof ownerId === 'string' && ownerId.trim() ? ownerId.trim() : null
  }, [starshipData])

  const hasAnyResources = useMemo(() => {
    const v = pinsData?.views?.length ?? 0
    const d = pinsData?.datasets?.length ?? 0
    const b = pinsData?.taskBoards?.length ?? 0
    const t = roomToolsData?.items?.length ?? 0
    return v + d + b + t > 0
  }, [pinsData?.datasets?.length, pinsData?.taskBoards?.length, pinsData?.views?.length, roomToolsData?.items?.length])

  const pinView = usePinRoomView(activeConversationId || '', starshipData?.id ?? '')
  const unpinView = useUnpinRoomView(activeConversationId || '')
  const pinDataset = usePinRoomDataset(activeConversationId || '')
  const unpinDataset = useUnpinRoomDataset(activeConversationId || '')
  const pinBoard = usePinRoomTaskBoard(activeConversationId || '')
  const unpinBoard = useUnpinRoomTaskBoard(activeConversationId || '')
  const assignTool = useAssignRoomTool(activeConversationId || '')
  const unassignTool = useUnassignRoomTool(activeConversationId || '')

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
      .filter(v => Boolean(v.id))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [starshipViews])

  const availableDatasets = useMemo(() => {
    const list = Array.isArray(datasets) ? datasets : []
    return list
      .map((d: any) => ({ id: String(d?.id || '').trim(), name: String(d?.name || d?.slug || 'Dataset').trim() }))
      .filter(d => Boolean(d.id))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [datasets])

  const availableTaskBoards = useMemo(() => {
    const list = Array.isArray(taskBoards) ? taskBoards : []
    return list
      .map((b: any) => ({ id: String(b?.id || '').trim(), name: String(b?.name || b?.slug || 'Board').trim() }))
      .filter(b => Boolean(b.id))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [taskBoards])

  const availableTools = useMemo(() => {
    const list = Array.isArray(tools) ? tools : []
    return list
      .map((t: any) => ({ id: String(t?.id || '').trim(), name: String(t?.name || t?.slug || 'Tool').trim() }))
      .filter(t => Boolean(t.id))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [tools])

  const handleThreadCreated = useCallback(
    (cid: string) => {
      // Persist pinned message across draft -> real thread transition.
      const nextThreadKey = String(cid)
      pendingThreadStateRef.current = {
        threadKey: nextThreadKey,
        threadAgent: threadAgent ?? null,
        pinnedFirstMessage: threadPinnedFirstMessage ?? null,
        draftParentConversationId: null,
        draftTitle: null,
      }
      setThreadKeyInUrl(nextThreadKey)
    },
    [setThreadKeyInUrl, threadAgent, threadPinnedFirstMessage]
  )

  const handleCloseThread = useCallback(() => {
    setThreadPinnedFirstMessage(null)
    setThreadDraftParentConversationId(null)
    setThreadDraftTitle(null)
    pendingThreadStateRef.current = {
      threadKey: null,
      threadAgent: null,
      pinnedFirstMessage: null,
      draftParentConversationId: null,
      draftTitle: null,
    }
    setThreadKeyInUrl(null)
  }, [setThreadKeyInUrl])

  const handleConversationCreated = useCallback(
    (cid: string) => {
      setConversationDraftParentConversationId(null)
      setConversationDraftTitle(null)
      setConversationKeyInUrl(String(cid))
    },
    [setConversationKeyInUrl]
  )

  const handleCloseConversation = useCallback(() => {
    setConversationDraftParentConversationId(null)
    setConversationDraftTitle(null)
    setConversationKeyInUrl(null)
  }, [setConversationKeyInUrl])

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
            <button type="button" className="text-sm underline underline-offset-2" onClick={() => router.replace(`/ship/${routeParams.slug}`)}>
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

  // Avoid flashing room UI before we know whether the user is joined.
  if (activeConversationId && roomParticipation.isLoading) {
    return null
  }

  if (activeConversationId && !isRoomParticipant) {
    const label = String(activeRoom?.name ?? activeRoom?.slug ?? 'Room').trim() || 'Room'
    const topic = typeof (activeRoom as any)?.topic === 'string' ? String((activeRoom as any).topic).trim() : ''
    const canJoin = Boolean(roomParticipation.data?.canJoin)
    return (
      <div className="h-screen w-full flex items-center justify-center px-6">
        <div className="max-w-md w-full text-center space-y-3">
          <div className="text-lg font-semibold">
            Join <span className="font-mono">#{label}</span>
          </div>
          <div className="text-sm text-muted-foreground">{topic || 'You must join this room to view threads and resources.'}</div>
          <div className="flex items-center justify-center gap-2 pt-2">
            <button type="button" className="text-sm underline underline-offset-2" onClick={() => router.push(`/ship/${routeParams.slug}/rooms`)}>
              Back to rooms
            </button>
            <Button
              type="button"
              onClick={() => joinRoom.mutate()}
              disabled={!canJoin || joinRoom.isPending || !activeConversationId}
              title={!canJoin ? 'This room cannot be joined' : undefined}
            >
              {joinRoom.isPending ? 'Joining…' : 'Join room'}
            </Button>
          </div>
        </div>
      </div>
    )
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
        {activeConversationId && conversationKey ? (
          <ThreadPane
            starshipId={starshipData.id}
            starshipSlug={routeParams.slug}
            conversationId={conversationConversationId}
            roomConversationId={activeConversationId}
            draftParentConversationId={isDraftConversationOpen ? conversationDraftParentConversationId : null}
            draftTitle={isDraftConversationOpen ? conversationDraftTitle : null}
            selectedAgent={conversationAgent}
            onAgentChange={setConversationAgent}
            onThreadCreated={handleConversationCreated}
            onClose={handleCloseConversation}
            allowedMentionUserIds={roomParticipants.data?.userIds ?? []}
            allowedMentionAgentIds={roomParticipants.data?.agentIds ?? []}
            // Do not hard-block agent selection to room participants; server will create invite approvals as needed.
            contentWidth="constrained"
            enableMessageThreads={true}
            onOpenThread={({ conversationId, linkedMessage, parentConversationId }) => {
              const nextThreadKey = conversationId ? String(conversationId) : 'draft'
              const nextPinned = linkedMessage ?? null
              const nextAgent = nextThreadKey === threadKey ? (threadAgent ?? null) : null

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
                setThreadKeyInUrl(conversationId)
                return
              }

              const parent = typeof parentConversationId === 'string' ? parentConversationId.trim() : ''
              setThreadDraftParentConversationId(parent || conversationConversationId || null)
              const rawInput = String((linkedMessage as any)?.content ?? '')
              const raw = sanitizeThreadTitleSnippetFromMessageContent(rawInput)
              const snippet = raw.length > 0 ? raw.slice(0, 64) : ''
              const title = snippet ? snippet : 'New thread'
              setThreadDraftTitle(title)
              pendingThreadStateRef.current = {
                threadKey: 'draft',
                threadAgent: nextAgent,
                pinnedFirstMessage: nextPinned,
                draftParentConversationId: parent || conversationConversationId || null,
                draftTitle: title,
              }
              setThreadKeyInUrl('draft')
            }}
            titlePrefix={
              <button
                type="button"
                className="inline-flex h-4 w-4 items-center justify-center text-foreground hover:text-foreground transition-colors"
                onClick={handleCloseConversation}
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
            rightSlot={
              <div className="flex items-center gap-2">
                <RoomParticipantsButton
                  starshipId={starshipData.id}
                  roomConversationId={activeConversationId}
                  roomIsPrivate={Boolean(activeRoom?.isPrivate)}
                  starshipOwnerId={starshipOwnerId}
                  className="sr-only"
                />
                {canManagePins || hasAnyResources ? (
                  <Button type="button" size="sm" variant="outline" onClick={() => setRoomPaneInUrl('resources')}>
                    <Icon name="pin" className="h-4 w-4 mr-1" />
                    Resources
                  </Button>
                ) : null}
              </div>
            }
            hideCloseButton={true}
            className="h-full"
          />
        ) : activeConversationId ? (
          <RoomConversationIndexView
            starshipId={starshipData.id}
            roomConversationId={activeConversationId}
            roomSlug={activeRoom?.slug ?? null}
            roomName={activeRoom?.name ?? null}
            roomIsPrivate={Boolean(activeRoom?.isPrivate)}
            starshipOwnerId={starshipOwnerId}
            starshipSlug={routeParams.slug}
            allowedMentionUserIds={roomParticipants.data?.userIds ?? []}
            allowedMentionAgentIds={roomParticipants.data?.agentIds ?? []}
            // Do not hard-block agent selection to room participants; server will create invite approvals as needed.
            pinnedViews={pinsData?.views ?? null}
            pinnedDatasets={pinsData?.datasets ?? null}
            pinnedTaskBoards={pinsData?.taskBoards ?? null}
            assignedTools={(roomToolsData?.items || []).map(i => i.assignment)}
            viewLabelById={viewLabelById}
            datasetLabelById={datasetLabelById}
            taskBoardLabelById={taskBoardLabelById}
            toolLabelById={toolLabelById}
            toolSlugById={toolSlugById}
            onOpenPinnedView={onOpenPinnedView}
            canManagePins={canManagePins}
            onOpenHistoryPane={() => setRoomPaneInUrl('history')}
            onOpenResourcesPane={() => setRoomPaneInUrl('resources')}
            availableViews={availableViews}
            availableDatasets={availableDatasets}
            availableTaskBoards={availableTaskBoards}
            availableTools={availableTools}
            onPinView={viewId => pinView.mutate({ viewId })}
            onUnpinView={viewId => unpinView.mutate(viewId)}
            onPinDataset={datasetId => pinDataset.mutate({ datasetId })}
            onUnpinDataset={datasetId => unpinDataset.mutate(datasetId)}
            onPinTaskBoard={boardId => pinBoard.mutate({ boardId })}
            onUnpinTaskBoard={boardId => unpinBoard.mutate(boardId)}
            onAssignTool={toolId => assignTool.mutate({ toolId })}
            onUnassignTool={toolId => unassignTool.mutate(toolId)}
            onCreateDraftConversation={() => {
              setConversationKeyInUrl('draft')
            }}
            onConversationStarted={({ conversationId, selectedAgent }) => {
              setConversationAgent(selectedAgent ?? null)
              setConversationKeyInUrl(String(conversationId))
            }}
            onOpenConversation={(conversationId) => {
              setConversationKeyInUrl(String(conversationId))
            }}
          />
        ) : null}
      </div>

      {/* Right side pane (desktop/tablet): thread or resources */}
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
              paneKind === 'thread' ? (
                <ThreadPane
                  starshipId={starshipData.id}
                  starshipSlug={routeParams.slug}
                  conversationId={threadConversationId}
                  roomConversationId={activeConversationId}
                  pinnedFirstMessage={threadPinnedFirstMessage}
                  draftParentConversationId={isDraftThreadOpen ? threadDraftParentConversationId : null}
                  draftTitle={isDraftThreadOpen ? threadDraftTitle : null}
                  selectedAgent={threadAgent}
                  onAgentChange={setThreadAgent}
                  onThreadCreated={handleThreadCreated}
                  onClose={handleCloseThread}
                  allowedMentionUserIds={roomParticipants.data?.userIds ?? []}
                  allowedMentionAgentIds={roomParticipants.data?.agentIds ?? []}
                  // Do not hard-block agent selection to room participants; server will create invite approvals as needed.
                  contentWidth="constrained"
                  className="w-full min-w-0"
                />
              ) : paneKind === 'resources' ? (
                <RoomResourcesPane
                  starshipId={starshipData.id}
                  starshipSlug={routeParams.slug}
                  roomConversationId={activeConversationId || ''}
                  roomSlug={activeRoom?.slug ?? null}
                  roomName={activeRoom?.name ?? null}
                  pinnedViews={pinsData?.views ?? null}
                  pinnedDatasets={pinsData?.datasets ?? null}
                  pinnedTaskBoards={pinsData?.taskBoards ?? null}
                  assignedTools={(roomToolsData?.items || []).map(i => i.assignment)}
                  viewLabelById={viewLabelById}
                  datasetLabelById={datasetLabelById}
                  taskBoardLabelById={taskBoardLabelById}
                  toolLabelById={toolLabelById}
                  toolSlugById={toolSlugById}
                  onOpenPinnedView={onOpenPinnedView}
                  canManagePins={canManagePins}
                  availableViews={availableViews}
                  availableDatasets={availableDatasets}
                  availableTaskBoards={availableTaskBoards}
                  availableTools={availableTools}
                  onPinView={viewId => pinView.mutate({ viewId })}
                  onUnpinView={viewId => unpinView.mutate(viewId)}
                  onPinDataset={datasetId => pinDataset.mutate({ datasetId })}
                  onUnpinDataset={datasetId => unpinDataset.mutate(datasetId)}
                  onPinTaskBoard={boardId => pinBoard.mutate({ boardId })}
                  onUnpinTaskBoard={boardId => unpinBoard.mutate(boardId)}
                  onAssignTool={toolId => assignTool.mutate({ toolId })}
                  onUnassignTool={toolId => unassignTool.mutate(toolId)}
                  onClose={() => setRoomPaneInUrl(null)}
                />
              ) : paneKind === 'history' ? (
                <RoomHistoryPane
                  starshipId={starshipData.id}
                  roomConversationId={activeConversationId || ''}
                  roomSlug={activeRoom?.slug ?? null}
                  roomName={activeRoom?.name ?? null}
                  onOpenConversation={conversationId => {
                    setConversationKeyInUrl(String(conversationId))
                  }}
                  onClose={() => setRoomPaneInUrl(null)}
                />
              ) : null
            ) : (
              <div className="h-full w-full flex items-center justify-center text-muted-foreground text-sm">
                {paneKind === 'thread' ? 'Loading thread…' : paneKind === 'history' ? 'Loading history…' : 'Loading resources…'}
              </div>
            )}
          </div>
        </aside>
      </>

      {/* Right side pane overlay (mobile) */}
      <aside
        className={cn('md:hidden absolute inset-0 z-[30] bg-background min-w-0 overflow-hidden', isSidePaneOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none')}
        style={{
          transition: 'opacity 200ms ease-out',
          willChange: 'opacity',
        }}
        aria-hidden={!isSidePaneOpen}
      >
        {isSidePaneMounted ? (
          paneKind === 'thread' ? (
            <ThreadPane
              starshipId={starshipData.id}
              starshipSlug={routeParams.slug}
              conversationId={threadConversationId}
              roomConversationId={activeConversationId}
              pinnedFirstMessage={threadPinnedFirstMessage}
              draftParentConversationId={isDraftThreadOpen ? threadDraftParentConversationId : null}
              draftTitle={isDraftThreadOpen ? threadDraftTitle : null}
              selectedAgent={threadAgent}
              onAgentChange={setThreadAgent}
              onThreadCreated={handleThreadCreated}
              onClose={handleCloseThread}
              allowedMentionUserIds={roomParticipants.data?.userIds ?? []}
              allowedMentionAgentIds={roomParticipants.data?.agentIds ?? []}
              // Do not hard-block agent selection to room participants; server will create invite approvals as needed.
              contentWidth="constrained"
              className="h-full w-full"
            />
          ) : paneKind === 'resources' ? (
            <RoomResourcesPane
              starshipId={starshipData.id}
              starshipSlug={routeParams.slug}
              roomConversationId={activeConversationId || ''}
              roomSlug={activeRoom?.slug ?? null}
              roomName={activeRoom?.name ?? null}
              pinnedViews={pinsData?.views ?? null}
              pinnedDatasets={pinsData?.datasets ?? null}
              pinnedTaskBoards={pinsData?.taskBoards ?? null}
              assignedTools={(roomToolsData?.items || []).map(i => i.assignment)}
              viewLabelById={viewLabelById}
              datasetLabelById={datasetLabelById}
              taskBoardLabelById={taskBoardLabelById}
              toolLabelById={toolLabelById}
              toolSlugById={toolSlugById}
              onOpenPinnedView={onOpenPinnedView}
              canManagePins={canManagePins}
              availableViews={availableViews}
              availableDatasets={availableDatasets}
              availableTaskBoards={availableTaskBoards}
              availableTools={availableTools}
              onPinView={viewId => pinView.mutate({ viewId })}
              onUnpinView={viewId => unpinView.mutate(viewId)}
              onPinDataset={datasetId => pinDataset.mutate({ datasetId })}
              onUnpinDataset={datasetId => unpinDataset.mutate(datasetId)}
              onPinTaskBoard={boardId => pinBoard.mutate({ boardId })}
              onUnpinTaskBoard={boardId => unpinBoard.mutate(boardId)}
              onAssignTool={toolId => assignTool.mutate({ toolId })}
              onUnassignTool={toolId => unassignTool.mutate(toolId)}
              onClose={() => setRoomPaneInUrl(null)}
            />
          ) : paneKind === 'history' ? (
            <RoomHistoryPane
              starshipId={starshipData.id}
              roomConversationId={activeConversationId || ''}
              roomSlug={activeRoom?.slug ?? null}
              roomName={activeRoom?.name ?? null}
              onOpenConversation={conversationId => {
                setConversationKeyInUrl(String(conversationId))
              }}
              onClose={() => setRoomPaneInUrl(null)}
            />
          ) : null
        ) : (
          <div className="h-full w-full flex items-center justify-center text-muted-foreground text-sm">
            {paneKind === 'thread' ? 'Loading thread…' : paneKind === 'history' ? 'Loading history…' : 'Loading resources…'}
          </div>
        )}
      </aside>

      {/* Side pane overlays */}
      {isViewPaneOpen ? (
        <div className="absolute inset-0 z-[30] bg-background/80 backdrop-blur-sm">
          <div className="absolute inset-0" onClick={() => setViewKeyInUrl(null)} />
          <div className="absolute inset-y-0 right-0 w-full md:w-[720px] bg-background border-l border-border/60 shadow-xl">
            {viewKey ? <ViewPane starshipId={starshipData.id} viewId={viewKey} onClose={() => setViewKeyInUrl(null)} className="h-full" /> : null}
          </div>
        </div>
      ) : null}

      {/* Hide children since this layout owns the UI */}
      <div style={{ display: 'none' }}>{children}</div>
    </div>
  )
}
