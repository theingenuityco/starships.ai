'use client'

import React from 'react'
import { useParams } from 'next/navigation'
import { PageHeader } from '@/components/ui/PageHeader'
import { useStarshipBySlug } from '@/hooks/useStarships'
import { GoalsColumn } from '@/components/dashboard/GoalsColumn'

export default function DashboardPage(): React.JSX.Element {
  const { slug: slugParam } = useParams<{ slug: string }>()
  const slug = typeof slugParam === 'string' ? slugParam : ''
  const { data: starship } = useStarshipBySlug(slug, Boolean(slug))
  const starshipId = starship?.id

  return (
    <div className="relative flex flex-col h-full min-w-0 bg-background">
      <PageHeader icon="dashboard" title="Dashboard" />
      <div className="flex-1 min-h-0 overflow-hidden p-4">
        <GoalsColumn starshipId={starshipId} />
      </div>
    </div>
  )
}
