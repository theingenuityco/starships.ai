'use client'

import React, { useMemo } from 'react'
import { ApprovalCallout } from '@/components/conversation/ApprovalCallout'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { PendingRoomInviteApproval } from '@/hooks/useRooms'

export interface RoomInviteApprovalInlineProps {
  approval: PendingRoomInviteApproval
  isSubmitting?: boolean
  onApprove: () => void
  onDeny: () => void
}

export function RoomInviteApprovalInline({ approval, isSubmitting = false, onApprove, onDeny }: RoomInviteApprovalInlineProps) {
  const count = (approval.users?.length || 0) + (approval.agents?.length || 0)
  const requestedBy = approval.requestedByLabel && String(approval.requestedByLabel).trim() ? String(approval.requestedByLabel).trim() : null

  const details = useMemo(() => {
    const users = Array.isArray(approval.users) ? approval.users : []
    const agents = Array.isArray(approval.agents) ? approval.agents : []
    const lines: React.ReactNode[] = []

    if (users.length > 0) {
      lines.push(
        <div key="users">
          <div className="text-xs font-medium text-foreground/80">Users</div>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {users.map(u => (
              <Badge key={u.id} variant="secondary" className="text-[11px]">
                {u.label || u.id}
              </Badge>
            ))}
          </div>
        </div>
      )
    }

    if (agents.length > 0) {
      lines.push(
        <div key="agents" className={users.length > 0 ? 'mt-2' : ''}>
          <div className="text-xs font-medium text-foreground/80">Agents</div>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {agents.map(a => (
              <Badge key={a.id} variant="secondary" className="text-[11px]">
                {a.label || a.id}
              </Badge>
            ))}
          </div>
        </div>
      )
    }

    return lines.length > 0 ? <div className="mt-1">{lines}</div> : null
  }, [approval.users, approval.agents])

  return (
    <ApprovalCallout
      className="mt-2 mb-2"
      title="Add mentioned members to room?"
      badge={
        <Badge variant="outline" className="text-[11px]">
          {count} pending
        </Badge>
      }
      description={
        requestedBy ? (
          <span>
            This message mentions members not in the room. Invited by <span className="font-medium text-foreground/90">{requestedBy}</span>.
          </span>
        ) : (
          'This message mentions members not in the room.'
        )
      }
      details={details}
      actions={
        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
          <Button variant="outline" size="sm" onClick={onDeny} disabled={isSubmitting}>
            Deny
          </Button>
          <div className="flex-1" />
          <Button variant="default" size="sm" onClick={onApprove} disabled={isSubmitting}>
            Add to room
          </Button>
        </div>
      }
    />
  )
}

