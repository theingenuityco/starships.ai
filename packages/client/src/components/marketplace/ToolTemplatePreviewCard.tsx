'use client'

import React from 'react'

import type { ToolTemplateModel } from '@starships/protocol'

import Icon from '@/components/primitives/Icon'
import { cn } from '@/lib/utils'
import { pickToolLeftIcon } from '@/lib/toolTemplateIcon'

export function ToolTemplatePreviewCard({ template, className }: { template: ToolTemplateModel; className?: string }) {
  const displayName = String(template.name || '').trim()
  const displayCategory = String(template.category || '').trim()
  const displayDescription = String((template as any)?.description || '').trim()

  const leftIcon = pickToolLeftIcon(displayName || 'Tool')

  return (
    <div className={cn('relative overflow-hidden rounded-lg bg-transparent', className)}>
      <div className="flex items-start gap-3 pl-0.5 py-0.5">
        {/* Square icon tile (matches agent avatar tile size/shape) */}
        <div
          className={cn(
            'h-[72px] w-[72px] rounded-xl ring-1 ring-border/40 shadow-md',
            'flex items-center justify-center',
            // Keep the tile neutral (no gradient / accent tint).
            'bg-background/40'
          )}
          aria-hidden
        >
          <Icon name={leftIcon.name} className="h-7 w-7 text-foreground" />
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1 flex flex-col pt-0.5">
          <div className="min-w-0">
            {/* Category (small) */}
            {displayCategory ? <div className="min-w-0 text-xs text-muted-foreground truncate">{displayCategory}</div> : null}

            {/* Name (big) */}
            <div className={displayCategory ? 'mt-0.5 text-sm font-semibold leading-tight truncate' : 'text-sm font-semibold leading-tight truncate'}>
              {displayName || 'Unnamed tool'}
            </div>
          </div>

          {displayDescription ? <div className="mt-1.5 text-xs text-muted-foreground leading-relaxed line-clamp-2">{displayDescription}</div> : null}
        </div>
      </div>
    </div>
  )
}

