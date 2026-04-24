'use client'

import React, { useMemo, useState } from 'react'
import { useQueries, useQueryClient } from '@tanstack/react-query'
import Icon from '@/components/primitives/Icon'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import api from '@/lib/api'
import { useStarshipRooms } from '@/hooks/useRooms'
import { usePendingToolApprovalsMulti, CONVERSATION_QUERY_KEYS } from '@/hooks/useConversations'
import { ToolApprovalCallout } from '@/components/conversation/ToolApprovalCallout'
import type { RoomModel } from '@starships/protocol'

interface ApprovalsPanelProps {
  starshipId: string | undefined
}

export function ApprovalsPanel({ starshipId }: ApprovalsPanelProps) {
  const queryClient = useQueryClient()

  const [submittingId, setSubmittingId] = useState<string | null>(null)
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set())

  const { data: roomsData, isLoading: roomsLoading } = useStarshipRooms(starshipId ?? '', !!starshipId)
  const rooms: RoomModel[] = useMemo(() => roomsData?.rooms ?? [], [roomsData])

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
          children: Array.isArray(data?.children)
            ? (data.children as Array<{ id: string; updatedAt: string; pendingCount: number; agentName: string }>)
            : [],
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
    const list: Array<{ approval: any; conversationId: string; parentConvId: string | null }> = []
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

  const handleApproveOnce = async (approval: any, conversationId: string, parentConvId: string | null) => {
    if (submittingId === approval.id) return
    setSubmittingId(approval.id)
    setDismissedIds(prev => new Set(prev).add(approval.id))
    try {
      await api.post(`/api/v1/conversations/${conversationId}/tool-approvals/${approval.id}/approve`)
      toast.success('Tool approved')
      void queryClient.invalidateQueries({ queryKey: CONVERSATION_QUERY_KEYS.toolApprovalsPending(conversationId) })
      if (parentConvId) void queryClient.invalidateQueries({ queryKey: CONVERSATION_QUERY_KEYS.childrenPendingApprovals(parentConvId) })
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
      if (parentConvId) void queryClient.invalidateQueries({ queryKey: CONVERSATION_QUERY_KEYS.childrenPendingApprovals(parentConvId) })
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
      if (parentConvId) void queryClient.invalidateQueries({ queryKey: CONVERSATION_QUERY_KEYS.childrenPendingApprovals(parentConvId) })
    } catch {
      setDismissedIds(prev => { const next = new Set(prev); next.delete(approval.id); return next })
      toast.error('Failed to deny')
    } finally {
      setSubmittingId(prev => (prev === approval.id ? null : prev))
    }
  }

  return (
    <div className="flex flex-col min-h-0">
      {/* Header */}
      <div className="flex items-center gap-2 px-5 py-3.5">
        <Icon name="alert-circle" className="h-3.5 w-3.5 text-amber-500 flex-shrink-0" />
        <span className="text-sm font-semibold tracking-tight">Approvals</span>
        {allApprovals.length > 0 && (
          <span className="inline-flex items-center justify-center rounded-full bg-amber-500 text-white text-[10px] font-bold px-1.5 h-[18px] min-w-[18px] tabular-nums">
            {allApprovals.length}
          </span>
        )}
      </div>

      {/* Content — scrollable */}
      <div className="overflow-y-auto flex-1">
        {roomsLoading ? (
          <div className="p-4 space-y-2.5">
            <Skeleton className="h-16 w-full rounded-lg" />
            <Skeleton className="h-16 w-full rounded-lg" />
          </div>
        ) : allApprovals.length === 0 ? (
          <div className="flex items-center gap-3 px-5 py-4">
            <div className="h-6 w-6 rounded-full bg-green-500/15 flex items-center justify-center flex-shrink-0">
              <Icon name="check" className="h-3 w-3 text-green-500" />
            </div>
            <span className="text-xs text-muted-foreground/50">All clear — no pending approvals</span>
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
  )
}
