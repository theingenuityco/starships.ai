'use client'

import Icon from '@/components/primitives/Icon'

import React, { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { PageLayout } from '@/components/layout/PageLayout'
import { AgentSelector } from '@/components/agents/AgentSelector'
import { Breadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbLink, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb'
import { Badge } from '@/components/ui/badge'
import { useStarshipBySlug, useStarshipAgents } from '@/hooks/useStarships'
import { useAuth } from '@/hooks/useAuth'
import { JsonImportExportButtons } from '@/components/importExport/JsonImportExportButtons'

export default function StarshipAgentsPage(): React.JSX.Element {
  const router = useRouter()
  const { slug } = useParams<{ slug: string }>()
  const { data: starship } = useStarshipBySlug(slug, true)
  const starshipId = starship?.id || ''
  const { data: agents = [] } = useStarshipAgents(starshipId, !!starshipId)
  const [selectedAgent, setSelectedAgent] = useState<any>(null)
  const { isInstanceAdmin } = useAuth()

  return (
    <PageLayout>
      <div className="bg-background">
        <div className="flex flex-col items-center px-6 py-8">
          <div className="w-full max-w-6xl mx-auto space-y-8">
            <div className="text-center">
              <div className="flex items-center justify-center gap-2 mb-2">
                <Icon name="head-circuit" className="h-6 w-6 text-primary" />
                <h1 className="text-2xl font-bold">My Agents</h1>
                <Badge variant="outline" className="ml-2 text-base px-3 py-1">
                  {agents.length}
                </Badge>
              </div>
              <p className="text-muted-foreground mt-2">Manage and view all agents in this starship</p>
            </div>

            {isInstanceAdmin && starshipId && (
              <div className="flex items-center justify-center">
                <JsonImportExportButtons
                  kind="agent"
                  starshipId={starshipId}
                  onImported={result => {
                    if (result.kind === 'agent' && result.agent?.slug) {
                      router.push(`/ship/${slug}/agent/${encodeURIComponent(result.agent.slug)}`)
                    }
                  }}
                />
              </div>
            )}

            <section aria-label="Agents list">
              <AgentSelector
                selectedAgent={selectedAgent}
                onAgentSelect={agent => {
                  setSelectedAgent(agent)
                  router.push(`/ship/${slug}/agent/${agent.slug}`)
                }}
                onAgentsCountChange={() => {}}
                showCreateButton={false}
                showFilters={true}
                starshipId={starshipId}
              />
            </section>
          </div>
        </div>
      </div>
    </PageLayout>
  )
}
