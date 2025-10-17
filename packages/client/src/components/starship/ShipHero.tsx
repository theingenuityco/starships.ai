'use client'

import Icon from '@/components/primitives/Icon'

import React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { AgentTemplateSelector } from '@/components/agents/AgentTemplateSelector'
import { cn } from '@/lib/utils'
import { Outfit } from 'next/font/google'

export interface ShipHeroProps {
  slug: string
  starshipId?: string
  className?: string
}

const heroHeadingFont = Outfit({ subsets: ['latin'], weight: ['600', '700'] })

export function ShipHero({ slug, starshipId, className }: ShipHeroProps): React.JSX.Element {
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
    <section aria-labelledby="ship-hero" className={cn('relative overflow-hidden rounded-2xl frosted-glass-card shadow-frosted-lg border border-border/80 p-7 md:p-8', className)}>
      {/* Decorative gradient overlay */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(59,130,246,0.15),transparent_40%),radial-gradient(circle_at_80%_0%,rgba(168,85,247,0.12),transparent_35%)]" />

      <div className="relative z-10 flex flex-col gap-8 md:flex-row md:items-center md:justify-between md:gap-10">
        {/* Gaia marketing content */}
        <div className="max-w-2xl">
          <h2 id="ship-hero" className={cn(heroHeadingFont.className, 'text-3xl md:text-4xl lg:text-4xl font-bold tracking-tight')}>
            Create agents with Gaia
          </h2>
          <p className="mt-3 md:mt-4 text-sm md:text-base text-muted-foreground">
            Tell Gaia what you want your agent to do. It helps you set it up, choose a model, connect the right tools, and get it ready to use on this ship.
          </p>

          <div className="mt-4 mb-3 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
            <Icon name="sparkles" className="h-3.5 w-3.5" />
            <span>Gaia: Agent Creator</span>
          </div>

          {/* Benefits */}
          <ul className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <li className="flex items-start gap-2">
              <Icon name="store" className="h-4 w-4 text-primary mt-0.5" />
              <span>Start fast with ready‑made templates</span>
            </li>
            <li className="flex items-start gap-2">
              <Icon name="user-cog" className="h-4 w-4 text-primary mt-0.5" />
              <span>Shape the agent’s behavior in plain language</span>
            </li>
            <li className="flex items-start gap-2">
              <Icon name="wrench" className="h-4 w-4 text-primary mt-0.5" />
              <span>Connect the tools your agent needs</span>
            </li>
            <li className="flex items-start gap-2">
              <Icon name="rocket" className="h-4 w-4 text-primary mt-0.5" />
              <span>Launch to your ship in one click</span>
            </li>
          </ul>

          {/* Ship identity removed per request */}
        </div>

        {/* Gaia-focused actions */}
        <div className="flex flex-col items-stretch gap-3 sm:w-64">
          <AgentTemplateSelector
            onSelectTemplate={() => {}}
            onCreateFromTemplate={handleCreateFromTemplate}
            trigger={
              <Button size="lg" disabled={!starshipId} className="whitespace-nowrap">
                <Icon name="sparkles" className="h-5 w-5" />
                <span className="ml-1">Create with Gaia</span>
              </Button>
            }
          />
          <Button asChild size="lg" variant="outline" className="whitespace-nowrap">
            <Link href="/marketplace">
              <Icon name="store" className="h-5 w-5" />
              <span className="ml-1">Browse Marketplace</span>
            </Link>
          </Button>
        </div>
      </div>
    </section>
  )
}
