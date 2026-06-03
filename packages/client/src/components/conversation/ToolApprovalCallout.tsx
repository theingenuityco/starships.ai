'use client'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import React, { useMemo } from 'react'
import { ApprovalCallout } from '@/components/conversation/ApprovalCallout'

export type ToolApprovalCalloutApproval = {
  id: string
  agentName?: string
  toolSlug?: string
  toolName?: string
  argsJson?: Record<string, unknown>
}

export interface ToolApprovalCalloutProps {
  approval: ToolApprovalCalloutApproval
  isSubmitting?: boolean
  onApproveOnce: () => void
  onAlwaysAllow: () => void
  onDeny: () => void
}

// PR-class tools render the callout as a PR review (Approve / Request changes) rather
// than a generic tool gate. The "Always allow" path doesn't fit per-PR review semantics.
const REVIEW_CLASS_TOOL_SLUGS = new Set(['open-pr-with-changes', 'post-pr-review', 'merge-pr', 'deploy'])

export function ToolApprovalCallout({ approval, isSubmitting = false, onApproveOnce, onAlwaysAllow, onDeny }: ToolApprovalCalloutProps) {
  const toolLabel = useMemo(() => {
    const slug = approval.toolSlug && String(approval.toolSlug).trim() ? String(approval.toolSlug).trim() : ''
    const name = approval.toolName && String(approval.toolName).trim() ? String(approval.toolName).trim() : ''
    // Prefer human-friendly name; fall back to slug when name is unavailable.
    return name || slug || 'a tool'
  }, [approval.toolSlug, approval.toolName])

  const canAlwaysAllow = Boolean(approval.toolSlug && String(approval.toolSlug).trim().length > 0)
  const isReviewClass = useMemo(() => {
    const slug = String(approval.toolSlug || '').trim()
    return REVIEW_CLASS_TOOL_SLUGS.has(slug)
  }, [approval.toolSlug])

  const prettyArgs = useMemo(() => {
    try {
      return JSON.stringify(approval.argsJson ?? {}, null, 2)
    } catch {
      return String(approval.argsJson ?? '{}')
    }
  }, [approval.argsJson])

  return (
    <ApprovalCallout
      title={isReviewClass ? 'Review required' : 'Approval required'}
      badge={
        <Badge variant="outline" className="font-mono text-[11px]">
          {toolLabel}
        </Badge>
      }
      description={
        isReviewClass
          ? (approval.agentName || 'An agent') + ' is waiting on your review.'
          : (approval.agentName || 'An agent') + ' wants to run this tool.'
      }
      details={
        <details>
          <summary className="cursor-pointer select-none text-xs text-muted-foreground hover:text-foreground">View arguments</summary>
          <pre className="mt-2 text-[11px] whitespace-pre-wrap rounded-md border border-border/60 bg-muted/30 p-2 overflow-auto max-h-40">{prettyArgs}</pre>
        </details>
      }
      actions={
        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
          <Button variant="outline" size="sm" onClick={onDeny} disabled={isSubmitting}>
            {isReviewClass ? 'Request changes' : 'Deny'}
          </Button>

          <div className="flex-1" />

          <div className="flex flex-col sm:flex-row gap-2">
            {!isReviewClass ? (
              <Button
                variant="outline"
                size="sm"
                onClick={onAlwaysAllow}
                disabled={isSubmitting || !canAlwaysAllow}
                className={cn(!canAlwaysAllow && 'opacity-60')}
                title={!canAlwaysAllow ? 'Tool slug unavailable; cannot set always-allow.' : undefined}
              >
                Always allow
              </Button>
            ) : null}
            <Button variant="default" size="sm" onClick={onApproveOnce} disabled={isSubmitting}>
              {isReviewClass ? 'Approve' : 'Allow once'}
            </Button>
          </div>
        </div>
      }
    />
  )
}

