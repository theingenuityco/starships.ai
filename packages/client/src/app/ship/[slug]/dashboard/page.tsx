'use client'

import React from 'react'
import { useParams } from 'next/navigation'
import Icon from '@/components/primitives/Icon'
import { MobileNavToggleButton } from '@/components/navigation/MobileNavToggleButton'
import { useStarshipBySlug } from '@/hooks/useStarships'
import { GoalsColumn } from '@/components/dashboard/GoalsColumn'
import { AgentActivityColumn } from '@/components/dashboard/AgentActivityColumn'
import { ApprovalsPanel } from '@/components/dashboard/ApprovalsPanel'

export default function DashboardPage(): React.JSX.Element {
  const { slug: slugParam } = useParams<{ slug: string }>()
  const slug = typeof slugParam === 'string' ? slugParam : ''

  const { data: starship } = useStarshipBySlug(slug, Boolean(slug))
  const starshipId = starship?.id

  return (
    <div className="relative flex flex-col h-full min-w-0 bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 border-b border-border/60 bg-background/95 backdrop-blur-sm">
        <div className="px-4 py-2.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="flex-shrink-0 md:hidden">
              <MobileNavToggleButton className="mx-1" />
            </span>
            <Icon name="dashboard" weight="bold" className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
            <h3 className="text-sm font-semibold text-foreground">Dashboard</h3>
          </div>
        </div>
      </div>

      {/* Desktop: main + two-panel aside */}
      <div className="hidden md:flex flex-1 min-h-0 overflow-hidden">
        {/* Main — agent activity, dominant width */}
        <main className="flex-1 min-w-0 overflow-hidden flex flex-col">
          <AgentActivityColumn starshipId={starshipId} />
        </main>

        {/* Aside — approvals (top) stacked above goals (bottom) */}
        <aside className="w-[360px] shrink-0 flex flex-col overflow-hidden">
          {/* Top panel: approvals — shrinks when empty, scrolls when many items */}
          <div className="flex-shrink-0 max-h-[45%] flex flex-col overflow-hidden">
            <ApprovalsPanel starshipId={starshipId} />
          </div>

          {/* Bottom panel: goals — fills remaining height */}
          <div className="flex-1 min-h-0 overflow-hidden flex flex-col pt-4">
            <GoalsColumn starshipId={starshipId} />
          </div>
        </aside>
      </div>

      {/* Mobile: stacked sections */}
      <div className="md:hidden flex-1">
        <div className="min-h-[420px]">
          <AgentActivityColumn starshipId={starshipId} />
        </div>
        <div className="min-h-[280px]">
          <ApprovalsPanel starshipId={starshipId} />
        </div>
        <div className="min-h-[420px]">
          <GoalsColumn starshipId={starshipId} />
        </div>
      </div>
    </div>
  )
}
