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
    <div className={cn('relative overflow-hidden rounded-lg border border-border/60 bg-card backdrop-blur-sm shadow-sm', className)}>
      <div className="flex min-h-[116px]">
        {/* Left avatar */}
        <div className="relative w-24 shrink-0 overflow-hidden bg-muted/30">
          <div className="absolute inset-0 h-full w-full flex items-center justify-center bg-[radial-gradient(circle_at_center,rgba(124,58,237,0.14),transparent_55%)]">
            <MarketplaceAvatar
              imageUrl={avatarUrl || null}
              label={displayName || 'Agent'}
              seed={displayName || template.slug || 'AI'}
              sizeClassName="h-14 w-14"
              shapeClassName="rounded-xl"
              ringClassName="ring-1 ring-border/40"
              shadowClassName="shadow-sm"
              showInsetRing={false}
              showTintWhenMissing={true}
              fallbackTextClassName="text-base font-semibold text-muted-foreground"
              tintClassName="bg-[radial-gradient(circle_at_center,rgba(124,58,237,0.14),transparent_55%)]"
            />
          </div>
        </div>

        {/* Right content */}
        <div className="min-w-0 flex-1 flex flex-col p-4">
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

