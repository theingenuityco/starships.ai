'use client'

import React from 'react'

import type { AgentTemplateModel } from '@starships/protocol'

import { MarketplaceAvatar } from '@/components/marketplace/MarketplaceAvatar'
import { cn } from '@/lib/utils'

export function AgentTemplatePreviewCard({ template, className }: { template: AgentTemplateModel; className?: string }) {
  const avatarUrl = template.avatarUrl
  const displayName = String(template.name || '').trim()
  const displayRole = String(template.role || '').trim()
  const displayDescription = String(template.description || '').trim()

  return (
    <div className={cn('relative overflow-hidden rounded-lg bg-transparent', className)}>
      <div className="flex items-start gap-4">
        {/* Square avatar tile */}
        <MarketplaceAvatar
          imageUrl={avatarUrl || null}
          label={displayName || 'Agent'}
          seed={displayName || template.slug || 'AI'}
          sizeClassName="h-24 w-24"
          shapeClassName="rounded-xl"
          ringClassName="ring-1 ring-border/40"
          shadowClassName="shadow-sm"
          showInsetRing={false}
          showTintWhenMissing={true}
          fallbackTextClassName="text-base font-semibold text-muted-foreground"
          tintClassName="bg-[radial-gradient(circle_at_center,rgba(124,58,237,0.14),transparent_55%)]"
        />

        {/* Content */}
        <div className="min-w-0 flex-1 flex flex-col pt-0.5">
          <div className="min-w-0">
            {/* Name (small) */}
            {displayRole ? <div className="min-w-0 text-xs text-muted-foreground truncate">{displayName || 'Unnamed agent'}</div> : null}

            {/* Role (big) */}
            <div className={displayRole ? 'mt-0.5 text-base font-semibold leading-tight truncate' : 'text-base font-semibold leading-tight truncate'}>
              {displayRole || displayName || 'Unnamed agent'}
            </div>
          </div>

          {displayDescription ? <div className="mt-2 text-xs text-muted-foreground leading-relaxed line-clamp-2">{displayDescription}</div> : null}
        </div>
      </div>
    </div>
  )
}

