'use client'

import React from 'react'
import { useParams } from 'next/navigation'
import Icon from '@/components/primitives/Icon'
import { MobileNavToggleButton } from '@/components/navigation/MobileNavToggleButton'
import { useStarshipBySlug } from '@/hooks/useStarships'
import { GoalsColumn } from '@/components/dashboard/GoalsColumn'
import { AgentActivityColumn } from '@/components/dashboard/AgentActivityColumn'
import { OutputsApprovalsColumn } from '@/components/dashboard/OutputsApprovalsColumn'

export default function DashboardPage(): React.JSX.Element {
  const { slug: slugParam } = useParams<{ slug: string }>()
  const slug = typeof slugParam === 'string' ? slugParam : ''

  const { data: starship } = useStarshipBySlug(slug, Boolean(slug))
  const starshipId = starship?.id

  return (
    <div className="relative flex flex-col min-h-full min-w-0 bg-background">
      {/* Sticky header */}
      <div className="sticky top-0 z-10 border-b border-border/60 bg-card/80 backdrop-blur-sm">
        <div className="px-4 pt-3.5 pb-2 md:py-2.5">
          <div className="flex items-center gap-2 min-w-0">
            <span className="flex-shrink-0 self-center md:hidden">
              <MobileNavToggleButton className="mx-2" />
            </span>
            <span aria-hidden="true" className="flex-shrink-0 self-center text-foreground leading-none">
              <Icon name="dashboard" weight="bold" className="h-4 w-4" />
            </span>
            <h3 className="text-sm font-semibold text-foreground truncate leading-tight">Dashboard</h3>
            <p className="hidden md:block text-xs text-muted-foreground truncate ml-1">
              Goals · Agent activity · Outputs &amp; approvals
            </p>
          </div>
        </div>
      </div>

      {/* Three-column grid */}
      <div className="flex-1 overflow-auto">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4">
          <div className="flex flex-col rounded-xl border border-border bg-card shadow-sm overflow-hidden min-h-[480px] md:min-h-0 md:h-[calc(100vh-8rem)]">
            <GoalsColumn starshipId={starshipId} />
          </div>
          <div className="flex flex-col rounded-xl border border-border bg-card shadow-sm overflow-hidden min-h-[480px] md:min-h-0 md:h-[calc(100vh-8rem)]">
            <AgentActivityColumn starshipId={starshipId} />
          </div>
          <div className="flex flex-col rounded-xl border border-border bg-card shadow-sm overflow-hidden min-h-[480px] md:min-h-0 md:h-[calc(100vh-8rem)]">
            <OutputsApprovalsColumn starshipId={starshipId} />
          </div>
        </div>
      </div>
    </div>
  )
}
