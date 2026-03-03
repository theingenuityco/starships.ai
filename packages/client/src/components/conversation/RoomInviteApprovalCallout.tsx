'use client'

import React from 'react'
import { ApprovalCallout } from '@/components/conversation/ApprovalCallout'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

export type RoomInviteApprovalItem = { id: string; label: string }

export interface RoomInviteApprovalCalloutProps {
  users: RoomInviteApprovalItem[]
  agents: RoomInviteApprovalItem[]
  isSubmitting?: boolean
  onDeny: () => void
  onAllowOnceAndSend: () => void
}

export function RoomInviteApprovalCallout({
  users,
  agents,
  isSubmitting = false,
  onDeny,
  onAllowOnceAndSend,
}: RoomInviteApprovalCalloutProps) {
  return (
    <ApprovalCallout
      title="Approval required"
      badge={
        <Badge variant="outline" className="font-mono text-[11px]">
          room
        </Badge>
      }
      description="This message mentions people who aren’t in this room yet. Add them to the room before sending?"
      details={
        <div className="flex flex-wrap gap-2">
          {users.map(u => (
            <Badge key={`u:${u.id}`} variant="outline" className="text-[11px]">
              @{u.label}
            </Badge>
          ))}
          {agents.map(a => (
            <Badge key={`a:${a.id}`} variant="outline" className="text-[11px]">
              {a.label}
            </Badge>
          ))}
        </div>
      }
      actions={
        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
          <Button variant="outline" size="sm" disabled={isSubmitting} onClick={onDeny}>
            Deny
          </Button>
          <div className="flex-1" />
          <Button variant="default" size="sm" disabled={isSubmitting} onClick={onAllowOnceAndSend}>
            Allow once &amp; send
          </Button>
        </div>
      }
    />
  )
}

