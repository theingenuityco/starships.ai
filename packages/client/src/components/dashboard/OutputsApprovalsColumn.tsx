'use client'

import React, { useCallback, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { useRouter } from 'next/navigation'
import { useQueries, useQueryClient } from '@tanstack/react-query'
import Icon from '@/components/primitives/Icon'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import api from '@/lib/api'
import { useStarshipRooms } from '@/hooks/useRooms'
import { usePendingToolApprovalsMulti, useStarshipConversations, CONVERSATION_QUERY_KEYS } from '@/hooks/useConversations'
import { ToolApprovalCallout } from '@/components/conversation/ToolApprovalCallout'
import type { AgentModel, ConversationModel, RoomModel } from '@starships/protocol'
import { relativeTime, avatarColour } from './utils'

interface OutputsApprovalsColumnProps {
  starshipId: string | undefined
}

export function OutputsApprovalsColumn({ starshipId }: OutputsApprovalsColumnProps) {
  const { slug } = useParams<{ slug: string }>()
  const router = useRouter()
  const queryClient = useQueryClient()

  const [submittingId, setSubmittingId] = useState<string | null>(null)
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set())

  const { data: roomsData, isLoading: roomsLoading } = useStarshipRooms(starshipId ?? '', !!starshipId)
  const rooms: RoomModel[] = useMemo(() => roomsData?.rooms ?? [], [roomsData])

  const { roomConvIdToSlug, roomConvIdToName } = useMemo(() => {
    const slugMap: Record<string, string> = {}
    const nameMap: Record<string, string> = {}
    for (const room of rooms) {
      slugMap[room.conversationId] = room.slug
      nameMap[room.conversationId] = room.name
    }
    return { roomConvIdToSlug: slugMap, roomConvIdToName: nameMap }
  }, [rooms])

  const { data: conversationsData, isLoading: convsLoading } = useStarshipConversations(starshipId ?? '', !!starshipId)

  const convParentMap = useMemo(() => {
    const m: Record<string, string> = {}
    for (const c of (conversationsData?.conversations ?? []) as ConversationModel[]) {
      if (c.parentConversationId) m[c.id] = c.parentConversationId
    }
    return m
  }, [conversationsData])

  const resolveRoomConvId = useCallback((convId: string): string | undefined => {
    let current: string | undefined = convId
    const visited = new Set<string>()
    while (current && !visited.has(current)) {
      if (roomConvIdToName[current]) return current
      visited.add(current)
      current = convParentMap[current]
    }
    return undefined
  }, [roomConvIdToName, convParentMap])

  const pendingApprovalSummaryQueries = useQueries({
    queries: rooms.map(room => ({
      queryKey: CONVERSATION_QUERY_KEYS.childrenPendingApprovals(room.conversationId),
      queryFn: async () => {
        const response: any = await api.get(
          `/api/v1/conversations/${room.conversationId}/children/pending-approvals`,
          { params: { limit: 20 } }
        )
        const data = response?.data?.data
        return {
          roomConvId: room.conversationId,
          children: Array.isArray(data?.children) ? (data.children as Array<{ id: string; updatedAt: string; pendingCount: number; agentName: string }>) : [],
        }
      },
      enabled: !!starshipId && !!room.conversationId,
      staleTime: 5_000,
      refetchOnWindowFocus: true,
    })),
  })

  const childConvIds = useMemo(() => {
    const ids: string[] = []
    for (const q of pendingApprovalSummaryQueries) {
      const data = q.data as { roomConvId: string; children: Array<{ id: string; pendingCount: number }> } | undefined
      if (!data) continue
      for (const child of data.children) {
        if (child.pendingCount > 0) ids.push(child.id)
      }
    }
    return ids
  }, [pendingApprovalSummaryQueries])

  const childConvAgentNames = useMemo(() => {
    const m: Record<string, string> = {}
    for (const q of pendingApprovalSummaryQueries) {
      const data = q.data as { roomConvId: string; children: Array<{ id: string; agentName: string; pendingCount: number }> } | undefined
      if (!data) continue
      for (const child of data.children) {
        m[child.id] = child.agentName
      }
    }
    return m
  }, [pendingApprovalSummaryQueries])

  const { byConversationId } = usePendingToolApprovalsMulti(childConvIds, childConvIds.length > 0)

  const allApprovals = useMemo(() => {
    const list: Array<{
      approval: any
      conversationId: string
      parentConvId: string | null
    }> = []
    for (const q of pendingApprovalSummaryQueries) {
      const data = q.data as { roomConvId: string; children: Array<{ id: string; pendingCount: number }> } | undefined
      if (!data) continue
      for (const child of data.children) {
        if (child.pendingCount === 0) continue
        const approvals = byConversationId[child.id] ?? []
        for (const approval of approvals) {
          if (dismissedIds.has(approval.id)) continue
          list.push({ approval, conversationId: child.id, parentConvId: data.roomConvId })
        }
      }
    }
    return list
  }, [pendingApprovalSummaryQueries, byConversationId, dismissedIds])

  const recentOutputs = useMemo(() => {
    const convs = (conversationsData?.conversations ?? []) as Array<ConversationModel & { agents: AgentModel[] }>
    return convs
      .filter(c => c.status === 'completed')
      .sort((a, b) => new Date(b.updatedAt ?? b.createdAt).getTime() - new Date(a.updatedAt ?? a.createdAt).getTime())
      .slice(0, 10)
  }, [conversationsData])

  const handleApproveOnce = async (approval: any, conversationId: string, parentConvId: string | null) => {
    if (submittingId === approval.id) return
    setSubmittingId(approval.id)
    setDismissedIds(prev => new Set(prev).add(approval.id))
    try {
      await api.post(`/api/v1/conversations/${conversationId}/tool-approvals/${approval.id}/approve`)
      toast.success('Tool approved')
      void queryClient.invalidateQueries({ queryKey: CONVERSATION_QUERY_KEYS.toolApprovalsPending(conversationId) })
      if (parentConvId) {
        void queryClient.invalidateQueries({ queryKey: CONVERSATION_QUERY_KEYS.childrenPendingApprovals(parentConvId) })
      }
    } catch {
      setDismissedIds(prev => { const next = new Set(prev); next.delete(approval.id); return next })
      toast.error('Failed to approve')
    } finally {
      setSubmittingId(prev => (prev === approval.id ? null : prev))
    }
  }

  const handleAlwaysAllow = async (approval: any, conversationId: string, parentConvId: string | null) => {
    if (submittingId === approval.id) return
    const agentId = String(approval?.agentId || '')
    const toolSlug = String(approval?.toolSlug || '')
    if (!agentId || !toolSlug) {
      await handleApproveOnce(approval, conversationId, parentConvId)
      return
    }
    setSubmittingId(approval.id)
    setDismissedIds(prev => new Set(prev).add(approval.id))
    try {
      await api.put(`/api/v1/agents/${agentId}/tool-permissions`, { permissions: [{ toolSlug, permission: 'allow' }] })
      await api.post(`/api/v1/conversations/${conversationId}/tool-approvals/${approval.id}/approve`)
      toast.success('Tool always allowed')
      void queryClient.invalidateQueries({ queryKey: CONVERSATION_QUERY_KEYS.toolApprovalsPending(conversationId) })
      if (parentConvId) {
        void queryClient.invalidateQueries({ queryKey: CONVERSATION_QUERY_KEYS.childrenPendingApprovals(parentConvId) })
      }
    } catch {
      setDismissedIds(prev => { const next = new Set(prev); next.delete(approval.id); return next })
      toast.error('Failed to set permission')
    } finally {
      setSubmittingId(prev => (prev === approval.id ? null : prev))
    }
  }

  const handleDeny = async (approval: any, conversationId: string, parentConvId: string | null) => {
    if (submittingId === approval.id) return
    setSubmittingId(approval.id)
    setDismissedIds(prev => new Set(prev).add(approval.id))
    try {
      await api.post(`/api/v1/conversations/${conversationId}/tool-approvals/${approval.id}/deny`)
      toast.message('Tool denied')
      void queryClient.invalidateQueries({ queryKey: CONVERSATION_QUERY_KEYS.toolApprovalsPending(conversationId) })
      if (parentConvId) {
        void queryClient.invalidateQueries({ queryKey: CONVERSATION_QUERY_KEYS.childrenPendingApprovals(parentConvId) })
      }
    } catch {
      setDismissedIds(prev => { const next = new Set(prev); next.delete(approval.id); return next })
      toast.error('Failed to deny')
    } finally {
      setSubmittingId(prev => (prev === approval.id ? null : prev))
    }
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Column header */}
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border/50">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/10 flex-shrink-0">
          <Icon name="check-circle" className="h-3.5 w-3.5 text-amber-500" />
        </div>
        <span className="text-sm font-semibold">Outputs</span>
        {allApprovals.length > 0 && (
          <span className="inline-flex items-center justify-center rounded-full bg-amber-500 text-white text-[10px] font-bold px-1.5 h-[18px] min-w-[18px]">
            {allApprovals.length}
          </span>
        )}
      </div>

      {/* Pending Approvals section */}
      <div className="border-b border-border/50">
        <div className={cn(
          'flex items-center gap-2 px-4 py-2 border-b',
          allApprovals.length > 0
            ? 'bg-amber-500/5 border-amber-500/20'
            : 'border-border/30'
        )}>
          <Icon
            name="alert-circle"
            className={cn('h-3.5 w-3.5 flex-shrink-0', allApprovals.length > 0 ? 'text-amber-500' : 'text-muted-foreground/50')}
          />
          <span className={cn(
            'text-xs font-semibold',
            allApprovals.length > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'
          )}>
            Pending Approvals
          </span>
          {allApprovals.length > 0 && (
            <span className="ml-auto text-[10px] text-amber-500 font-medium">{allApprovals.length} waiting</span>
          )}
        </div>

        <div className="max-h-[220px] overflow-y-auto">
          {roomsLoading ? (
            <div className="p-3 space-y-2">
              <Skeleton className="h-14 w-full rounded-md" />
              <Skeleton className="h-14 w-full rounded-md" />
            </div>
          ) : allApprovals.length === 0 ? (
            <div className="flex items-center gap-2.5 px-4 py-3 text-xs text-muted-foreground">
              <div className="h-6 w-6 rounded-full bg-green-500/10 flex items-center justify-center flex-shrink-0">
                <Icon name="check" className="h-3 w-3 text-green-500" />
              </div>
              All clear — no pending approvals
            </div>
          ) : (
            <div className="p-3 space-y-2">
              {allApprovals.map(({ approval, conversationId, parentConvId }) => (
                <ToolApprovalCallout
                  key={approval.id}
                  approval={{
                    id: approval.id,
                    agentName: approval.agentName ?? childConvAgentNames[conversationId] ?? 'Agent',
                    toolSlug: approval.toolSlug,
                    toolName: approval.toolName,
                    argsJson: approval.argsJson ?? {},
                  }}
                  isSubmitting={submittingId === approval.id}
                  onApproveOnce={() => handleApproveOnce(approval, conversationId, parentConvId)}
                  onAlwaysAllow={() => handleAlwaysAllow(approval, conversationId, parentConvId)}
                  onDeny={() => handleDeny(approval, conversationId, parentConvId)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent Outputs section */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border/30">
        <Icon name="check-circle" className="h-3.5 w-3.5 text-muted-foreground/50 flex-shrink-0" />
        <span className="text-xs font-semibold text-muted-foreground">Recent Outputs</span>
        {recentOutputs.length > 0 && (
          <span className="ml-auto inline-flex items-center justify-center rounded-full bg-muted text-muted-foreground text-[10px] font-bold px-1.5 h-[18px] min-w-[18px]">
            {recentOutputs.length}
          </span>
        )}
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <div className="p-3 space-y-0.5">
          {convsLoading ? (
            <div className="space-y-2 px-1">
              {[1, 2, 3].map(i => (
                <div key={i} className="flex items-center gap-2.5 px-2 py-2">
                  <Skeleton className="h-6 w-6 rounded-full flex-shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-2.5 w-20" />
                  </div>
                </div>
              ))}
            </div>
          ) : recentOutputs.length === 0 ? (
            <div className="py-10 text-center">
              <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-muted/50">
                <Icon name="check-circle" className="h-5 w-5 text-muted-foreground/30" />
              </div>
              <p className="text-xs text-muted-foreground">No completed conversations yet</p>
            </div>
          ) : (
            recentOutputs.map(conv => {
              const agent = conv.agents?.[0]
              const agentName = agent?.name ?? 'Agent'
              const colour = avatarColour(agentName)
              const initial = agentName.charAt(0).toUpperCase()
              const roomConvId = resolveRoomConvId(conv.parentConversationId ?? conv.id)
              const roomSlug = roomConvId ? roomConvIdToSlug[roomConvId] : null
              const href = roomSlug
                ? `/ship/${slug}/rooms/${roomSlug}/conversation/${conv.id}`
                : `/ship/${slug}/rooms`

              return (
                <button
                  key={conv.id}
                  type="button"
                  onClick={() => router.push(href)}
                  className="w-full flex items-center gap-2.5 rounded-lg px-2 py-2 hover:bg-muted/40 transition-colors text-left group"
                >
                  <span className={cn(
                    'flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold text-white flex-shrink-0',
                    colour
                  )}>
                    {initial}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-foreground/80 truncate group-hover:text-foreground transition-colors">
                      {conv.title || 'Untitled conversation'}
                    </p>
                    <p className="text-[10px] text-muted-foreground/70 mt-0.5 truncate">
                      {agentName}
                      <span className="mx-1 opacity-50">·</span>
                      {relativeTime(conv.updatedAt ?? conv.createdAt)}
                    </p>
                  </div>
                  <Icon name="arrow-right" className="h-3 w-3 text-muted-foreground/40 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              )
            })
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
