import React from 'react'
import Icon from '@/components/primitives/Icon'
import { cn } from '@/lib/utils'

export interface ApprovalCalloutProps {
  title: React.ReactNode
  badge?: React.ReactNode
  description?: React.ReactNode
  details?: React.ReactNode
  actions?: React.ReactNode
  className?: string
}

export function ApprovalCallout({ title, badge, description, details, actions, className }: ApprovalCalloutProps) {
  return (
    <div className={cn('mb-4 rounded-2xl border border-border/60 bg-card shadow-sm', className)}>
      <div className="p-3 sm:p-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Icon name="shield" className="w-5 h-5 text-primary" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-foreground">{title}</p>
              {badge}
            </div>

            {description ? <div className="mt-1 text-xs text-muted-foreground leading-relaxed">{description}</div> : null}
            {details ? <div className="mt-2">{details}</div> : null}
            {actions ? <div className="mt-3">{actions}</div> : null}
          </div>
        </div>
      </div>
    </div>
  )
}

