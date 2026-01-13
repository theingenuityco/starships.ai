'use client'

import Icon from '@/components/primitives/Icon'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import React from 'react'

export interface ChildConversationApprovalCalloutProps {
  title: string
  pendingCount: number
  onOpenChildConversation: () => void
  disabled?: boolean
}

export function ChildConversationApprovalCallout({ title, pendingCount, onOpenChildConversation, disabled }: ChildConversationApprovalCalloutProps) {
  const label = pendingCount === 1 ? 'approval' : 'approvals'

  return (
    <div
      className={cn(
        'mb-3 rounded-2xl border shadow-sm',
        'border-amber-200/60 bg-amber-50/70 dark:border-amber-900/40 dark:bg-amber-950/10'
      )}
    >
      <div className="p-3 sm:p-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center flex-shrink-0">
            <Icon name="shield" className="w-5 h-5 text-amber-700 dark:text-amber-400" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-foreground truncate">{title} is waiting for your approval</p>
              <Badge variant="outline" className="font-mono text-[11px] border-amber-300/70 text-amber-800 dark:border-amber-800/60 dark:text-amber-200">
                {pendingCount} {label}
              </Badge>
            </div>

            <p className="mt-1 text-xs text-muted-foreground leading-relaxed">A child conversation needs your tool approval to continue.</p>

            <div className="mt-3 flex items-center gap-2">
              <div className="flex-1" />
              <Button variant="outline" size="sm" onClick={onOpenChildConversation} disabled={disabled}>
                Go to child conversation
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

