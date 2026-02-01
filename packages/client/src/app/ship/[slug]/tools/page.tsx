'use client'

import Icon from '@/components/primitives/Icon'

import React, { useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { PageLayout } from '@/components/layout/PageLayout'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { useQuery } from '@tanstack/react-query'
import api from '@/lib/api'
import type { ApiResponse } from '@starships/protocol'
import type { FetchResponse } from '@/lib/types'
import type { ToolModel } from '@starships/protocol'
import { useStarshipBySlug } from '@/hooks/useStarships'
import { useAuth } from '@/hooks/useAuth'

export default function StarshipToolsPage(): React.JSX.Element {
  const router = useRouter()
  const { slug } = useParams<{ slug: string }>()
  const { isAuthenticated, isInstanceAdmin } = useAuth()
  const { data: starship } = useStarshipBySlug(slug, isAuthenticated)
  const starshipId = starship?.id || ''
  const [search, setSearch] = useState('')

  // Tools management is admin-only; non-admins see access denied
  if (isAuthenticated && !isInstanceAdmin) {
    return (
      <PageLayout title="Tools" description="Manage tools for this starship." showHeader>
        <div className="flex items-center justify-center h-full">
          <Card className="max-w-md w-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Icon name="shield-alert" className="h-5 w-5 text-amber-500" />
                Instance admin access required
              </CardTitle>
              <CardDescription>Only instance admins can view and manage tools. Use Admin &gt; Tools to manage tools.</CardDescription>
            </CardHeader>
          </Card>
        </div>
      </PageLayout>
    )
  }

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
              <p className="text-muted-foreground mt-2">Installed tools available to your agents</p>
              {starshipId && (
                <p className="text-sm mt-2">
                  <a href="/admin/tools" className="text-primary hover:underline">
                    Manage all tools (import/export) →
                  </a>
                </p>
              )}
            </div>

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
                    <div className="rounded-2xl border border-border/40 frosted-glass-card shadow-frosted-lg overflow-hidden">
                      <div className="divide-y divide-border/30">
                        {filteredTools.map(tool => (
                          <div key={tool.id} className="flex items-start justify-between gap-4 px-4 py-4">
                            <div className="min-w-0 flex-1">
                              <button
                                type="button"
                                className="text-sm font-semibold text-foreground text-left hover:underline truncate"
                                onClick={() => router.push(`/ship/${slug}/tool/${tool.slug}`)}
                                title={`Open tool: ${tool.name}`}
                              >
                                {tool.name}
                              </button>
                              <div className="mt-1 text-xs font-mono text-muted-foreground truncate">{tool.slug}</div>
                              {tool.description ? <div className="mt-2 text-xs text-muted-foreground line-clamp-2">{tool.description}</div> : null}
                            </div>
                          </div>
                        ))}
                      </div>
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
          </div>
        </div>
      </div>
    </PageLayout>
  )
}
