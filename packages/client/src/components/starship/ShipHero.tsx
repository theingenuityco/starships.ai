'use client'

import Icon from '@/components/primitives/Icon'

import React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
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
            <span>Gaia: Agent Creator</span>
          </div>
          <h2 id="ship-hero" className="text-2xl md:text-3xl font-bold tracking-tight">
            Design and deploy Agent instances with Gaia
          </h2>
          <p className="mt-2 text-sm md:text-base text-muted-foreground">
            Gaia designs and scaffolds Agent instances for this starship. Define the system prompt and model, assign tools by slug, add an optional blueprint, and validate with blueprint lint and Test
            Agent before deployment.
          </p>

          {/* Benefits */}
          <ul className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <li className="flex items-start gap-2">
              <Icon name="wand2" className="h-4 w-4 text-primary mt-0.5" />
              <span>Scaffold, edit, and test agents end‑to‑end</span>
            </li>
            <li className="flex items-start gap-2">
              <Icon name="folder-plus" className="h-4 w-4 text-primary mt-0.5" />
              <span>Start from the Gaia template or adapt other templates</span>
            </li>
            <li className="flex items-start gap-2">
              <Icon name="wrench" className="h-4 w-4 text-primary mt-0.5" />
              <span>Assign tools by slug; keep config in env variables</span>
            </li>
            <li className="flex items-start gap-2">
              <Icon name="rocket" className="h-4 w-4 text-primary mt-0.5" />
              <span>Deploy directly to this starship</span>
            </li>
          </ul>

          {/* Ship identity removed per request */}
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
                <span className="ml-1">Browse agent templates</span>
              </Button>
            }
          />
        </div>
      </div>
    </section>
  )
}
