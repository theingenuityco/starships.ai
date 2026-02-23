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
      <div className="flex items-start gap-3 pl-0.5 py-0.5">
        {/* Square avatar tile */}
        <MarketplaceAvatar
          imageUrl={avatarUrl || null}
          label={displayName || 'Agent'}
          seed={displayName || template.slug || 'AI'}
          sizeClassName="h-[144px] w-[144px]"
          shapeClassName="rounded-xl"
          ringClassName="ring-1 ring-border/40"
          shadowClassName="shadow-md"
          showInsetRing={false}
          showTintWhenMissing={true}
          fallbackTextClassName="text-sm font-semibold text-muted-foreground"
          tintClassName="bg-[radial-gradient(circle_at_center,rgba(124,58,237,0.14),transparent_55%)]"
        />

        {/* Content: name (primary), role (subtitle), description (body) */}
        <div className="min-w-0 flex-1 flex flex-col justify-center gap-1 pt-0.5">
          <div className="min-w-0 space-y-0.5">
            <h3 className="text-base font-semibold leading-tight truncate text-foreground">
              {displayName || 'Unnamed agent'}
            </h3>
            {displayRole ? (
              <p className="text-sm text-muted-foreground truncate">{displayRole}</p>
            ) : null}
          </div>
          {displayDescription ? (
            <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed line-clamp-3">{displayDescription}</p>
          ) : null}
        </div>
      </div>
    </div>
  )
}

