'use client'

import Icon from '@/components/primitives/Icon'

import React, { useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { PageLayout } from '@/components/layout/PageLayout'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { useQuery } from '@tanstack/react-query'
import api from '@/lib/api'
import type { ApiResponse } from '@starships/protocol'
import type { FetchResponse } from '@/lib/types'
import type { ToolModel } from '@starships/protocol'
import { useStarshipBySlug } from '@/hooks/useStarships'
import { Breadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbLink, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb'

export default function StarshipToolsPage(): React.JSX.Element {
  const router = useRouter()
  const { slug } = useParams<{ slug: string }>()
  const { data: starship } = useStarshipBySlug(slug, true)
  const starshipId = starship?.id || ''
  const [search, setSearch] = useState('')

  const { data: starshipTools = [], isLoading: starshipToolsLoading } = useQuery({
    queryKey: ['starship-tools', starshipId] as const,
    queryFn: async (): Promise<ToolModel[]> => {
      if (!starshipId) return []
      const response: FetchResponse<ApiResponse<ToolModel[]>> = await api.get(`/api/v1/starships/${starshipId}/tools`)
      return response.data.data || []
    },
    enabled: !!starshipId,
    staleTime: 30 * 1000,
  })

  const filteredTools = useMemo(() => {
    const q = (search || '').trim().toLowerCase()
    if (!q) return starshipTools
    return starshipTools.filter(t => {
      const name = (t.name || '').toLowerCase()
      const slugv = (t.slug || '').toLowerCase()
      const desc = (t.description || '').toLowerCase()
      return name.includes(q) || slugv.includes(q) || desc.includes(q)
    })
  }, [starshipTools, search])

  return (
    <PageLayout>
      <div className="bg-background">
        <div className="flex flex-col items-center px-6 py-8">
          <div className="w-full max-w-6xl mx-auto space-y-8">
            <div className="text-center">
              <div className="flex items-center justify-center gap-2 mb-2">
                <Icon name="wrench" className="h-6 w-6 text-primary" />
                <h1 className="text-2xl font-bold">Tools</h1>
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
                          Tools
                        </Badge>
                      </BreadcrumbPage>
                    </BreadcrumbItem>
                  </BreadcrumbList>
                </Breadcrumb>
              </div>
              <p className="text-muted-foreground mt-2">Installed tools available to your agents</p>
            </div>

            {/* Tabs header mirrors overview page, but routes per tab */}
            <Tabs
              value="tools"
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
                    <Icon name="head-circuit" className="h-4 w-4" />
                    <span>Agents</span>
                  </TabsTrigger>
                  <TabsTrigger value="tools" className="gap-2 rounded-xl px-3 py-1">
                    <Icon name="wrench" className="h-4 w-4" />
                    <span>Tools</span>
                  </TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="tools">
                <section aria-labelledby="tools-list">
                  {starshipToolsLoading ? (
                    <div className="space-y-2">
                      {[1, 2, 3].map(i => (
                        <Skeleton key={i} className="h-16 w-full" />
                      ))}
                    </div>
                  ) : starshipTools.length === 0 ? (
                    <div className="text-center py-10 bg-muted/5 border border-dashed border-muted rounded-lg">
                      <div className="w-16 h-16 bg-muted/20 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Icon name="wrench" className="w-8 h-8 text-muted-foreground" />
                      </div>
                      <p className="text-base text-muted-foreground mb-3">No tools installed</p>
                      <p className="text-sm text-muted-foreground">Install tools from the Marketplace to get started.</p>
                    </div>
                  ) : (
                    <>
                      <div className="mb-8 sticky top-6 z-30">
                        <div className="relative max-w-md mb-6 mx-auto">
                          <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4 z-10 pointer-events-none" />
                          <Input
                            type="text"
                            placeholder="Search tools..."
                            value={search}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
                            className="pl-10 pr-3 w-full frosted-glass-card shadow-frosted-lg rounded-2xl border border-border/40 bg-transparent"
                          />
                        </div>
                      </div>

                      {filteredTools.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                          {filteredTools.map(tool => (
                            <Card
                              key={tool.id}
                              className="frosted-glass-card shadow-frosted-lg hover:shadow-frosted-lg group relative overflow-hidden transition-shadow duration-300 cursor-pointer"
                              onClick={() => router.push(`/ship/${slug}/tool/${tool.slug}`)}
                            >
                              <CardHeader className="pb-3">
                                <div className="mb-1">
                                  <CardTitle className="text-base font-semibold truncate">{tool.name}</CardTitle>
                                </div>
                                <div className="mb-1">
                                  <Badge variant="outline" className="text-xs">
                                    {tool.slug}
                                  </Badge>
                                </div>
                                {tool.description && <CardDescription className="text-xs line-clamp-2">{tool.description}</CardDescription>}
                              </CardHeader>
                            </Card>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-10 bg-muted/5 border border-dashed border-muted rounded-lg">
                          <div className="w-16 h-16 bg-muted/20 rounded-full flex items-center justify-center mx-auto mb-4">
                            <Icon name="search" className="w-8 h-8 text-muted-foreground" />
                          </div>
                          <p className="text-base text-muted-foreground mb-3">No tools match your search</p>
                          <p className="text-sm text-muted-foreground">Try a different keyword.</p>
                        </div>
                      )}
                    </>
                  )}
                </section>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
    </PageLayout>
  )
}
