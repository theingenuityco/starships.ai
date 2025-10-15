'use client'

import Icon from '@/components/primitives/Icon'

import React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { AgentTemplateSelector } from '@/components/agents/AgentTemplateSelector'
import type { WalletModel } from '@starships/protocol'
import { cn } from '@/lib/utils'

export interface ShipHeroProps {
  starshipName?: string | null
  slug: string
  starshipId?: string
  wallet?: WalletModel | null
  walletLoading?: boolean
  className?: string
}

export function ShipHero({ starshipName, slug, starshipId, className }: ShipHeroProps): React.JSX.Element {
  const router = useRouter()

  const handleCreateFromTemplate = async (templateId: string) => {
    if (!starshipId) return
    try {
      const { templateAPI } = await import('@/lib/api')
      const newAgent = await templateAPI.createAgentFromTemplate(templateId, starshipId)
      router.push(`/ship/${slug}/conversations?agent=${newAgent.id}`)
    } catch (err) {
      // Swallow error; AgentTemplateSelector already logs, and toast is handled in hooks
    }
  }
  return (
    <section
      aria-labelledby="ship-hero"
      className={cn('relative overflow-hidden rounded-2xl border border-border/80 bg-gradient-to-br from-primary/10 via-background to-background p-6', 'shadow-sm', className)}
    >
      {/* Decorative gradient overlay */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(59,130,246,0.15),transparent_40%),radial-gradient(circle_at_80%_0%,rgba(168,85,247,0.12),transparent_35%)]" />

      <div className="relative z-10 flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
        {/* Gaia marketing content */}
        <div className="max-w-2xl">
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
            <Icon name="sparkles" className="h-3.5 w-3.5" />
            <span>Gaia Agent Builder</span>
          </div>
          <h2 id="ship-hero" className="text-2xl md:text-3xl font-bold tracking-tight">
            Ship-grade AI agents in minutes
          </h2>
          <p className="mt-2 text-sm md:text-base text-muted-foreground">
            Gaia turns natural language into production-ready agents. Start from proven templates, customize behavior, connect tools, and deploy to your starship—without the busywork.
          </p>

          {/* Benefits */}
          <ul className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <li className="flex items-start gap-2">
              <Icon name="wand2" className="h-4 w-4 text-primary mt-0.5" />
              <span>No-code to powerful: describe, generate, refine</span>
            </li>
            <li className="flex items-start gap-2">
              <Icon name="folder-plus" className="h-4 w-4 text-primary mt-0.5" />
              <span>Template library for common workflows</span>
            </li>
            <li className="flex items-start gap-2">
              <Icon name="wrench" className="h-4 w-4 text-primary mt-0.5" />
              <span>Plug in tools and data securely</span>
            </li>
            <li className="flex items-start gap-2">
              <Icon name="rocket" className="h-4 w-4 text-primary mt-0.5" />
              <span>Deploy instantly to this ship</span>
            </li>
          </ul>

          {/* Ship identity (subtle) */}
          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
            <Badge variant="outline">/{slug}</Badge>
            {starshipId && <Badge variant="secondary">ID: {starshipId.slice(0, 8)}…</Badge>}
          </div>
        </div>

        {/* Gaia-focused actions */}
        <div className="flex flex-col items-stretch gap-2 sm:w-64">
          <AgentTemplateSelector
            onSelectTemplate={() => {}}
            onCreateFromTemplate={handleCreateFromTemplate}
            trigger={
              <Button size="sm" disabled={!starshipId} className="whitespace-nowrap">
                <Icon name="sparkles" className="h-4 w-4" />
                <span className="ml-1">Create with Gaia</span>
              </Button>
            }
          />
          <AgentTemplateSelector
            onSelectTemplate={() => {}}
            onCreateFromTemplate={handleCreateFromTemplate}
            trigger={
              <Button size="sm" variant="outline" disabled={!starshipId} className="whitespace-nowrap">
                <Icon name="library" className="h-4 w-4" />
                <span className="ml-1">Browse Gaia templates</span>
              </Button>
            }
          />
        </div>
      </div>
    </section>
  )
}
