'use client'

import Icon from '@/components/primitives/Icon'

import React, { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { PageLayout } from '@/components/layout/PageLayout'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AgentSelector } from '@/components/agents/AgentSelector'
import { Breadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbLink, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb'
import { Badge } from '@/components/ui/badge'
import { useStarshipBySlug } from '@/hooks/useStarships'

export default function StarshipAgentsPage(): React.JSX.Element {
  const router = useRouter()
  const { slug } = useParams<{ slug: string }>()
  const { data: starship } = useStarshipBySlug(slug, true)
  const starshipId = starship?.id || ''
  const [selectedAgent, setSelectedAgent] = useState<any>(null)

  return (
    <PageLayout>
      <div className="bg-background">
        <div className="flex flex-col items-center px-6 py-8">
          <div className="w-full max-w-6xl mx-auto space-y-8">
            <div className="text-center">
              <div className="flex items-center justify-center gap-2 mb-2">
                <Icon name="rocket" className="h-6 w-6 text-primary" />
                <h1 className="text-2xl font-bold">Agents</h1>
              </div>
              <div className="flex items-center justify-center gap-2">
                <Breadcrumb>
                  <BreadcrumbList>
                    <BreadcrumbItem>
                      <BreadcrumbLink href={`/ship/${slug}`} className="font-mono">
                        <Badge variant="outline" className="font-mono text-muted-foreground border-muted-foreground/30 hover:text-foreground">
                          {slug}
                        </Badge>
                      </BreadcrumbLink>
                    </BreadcrumbItem>
                    <BreadcrumbSeparator />
                    <BreadcrumbItem>
                      <BreadcrumbPage>
                        <Badge variant="outline" className="text-foreground">
                          Agents
                        </Badge>
                      </BreadcrumbPage>
                    </BreadcrumbItem>
                  </BreadcrumbList>
                </Breadcrumb>
              </div>
              <p className="text-muted-foreground mt-2">Manage and view all agents in this starship</p>
            </div>

            {/* Tabs header mirrors overview page, but routes per tab */}
            <Tabs
              value="agents"
              onValueChange={value => {
                if (value === 'ship') router.push(`/ship/${slug}`)
                else if (value === 'agents') router.push(`/ship/${slug}/agents`)
                else if (value === 'tools') router.push(`/ship/${slug}/tools`)
              }}
              className="space-y-6"
            >
              <div className="flex justify-center">
                <TabsList className="mx-auto w-full sm:w-auto flex-wrap justify-center gap-1 rounded-2xl border border-border/40 bg-background/70 p-1 shadow-sm">
                  <TabsTrigger value="ship" className="gap-2 rounded-xl px-3 py-1">
                    <Icon name="rocket" className="h-4 w-4" />
                    <span>Ship</span>
                  </TabsTrigger>
                  <TabsTrigger value="agents" className="gap-2 rounded-xl px-3 py-1">
                    <Icon name="user-cog" className="h-4 w-4" />
                    <span>Agents</span>
                  </TabsTrigger>
                  <TabsTrigger value="tools" className="gap-2 rounded-xl px-3 py-1">
                    <Icon name="wrench" className="h-4 w-4" />
                    <span>Tools</span>
                  </TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="agents">
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
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
    </PageLayout>
  )
}
