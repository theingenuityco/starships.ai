'use client'

import Icon from '@/components/primitives/Icon'

import React, { useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { PageLayout } from '@/components/layout/PageLayout'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import type { AgentModel, ApiResponse, StarshipAgentToolPermissionModel, UpdateAgentToolPermissionsRequest } from '@starships/protocol'
import type { FetchResponse } from '@/lib/types'
import type { ToolModel } from '@starships/protocol'
import { useStarshipBySlug } from '@/hooks/useStarships'
import { useStarshipAgents } from '@/hooks/useAgents'
import { Breadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbLink, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb'
import { cn } from '@/lib/utils'

export default function StarshipToolsPage(): React.JSX.Element {
  const router = useRouter()
  const { slug } = useParams<{ slug: string }>()
  const { data: starship } = useStarshipBySlug(slug, true)
  const starshipId = starship?.id || ''
  const [search, setSearch] = useState('')
  const queryClient = useQueryClient()

  const { data: starshipAgents = [], isLoading: agentsLoading } = useStarshipAgents(starshipId, !!starshipId)

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

  const { data: permissionRows = [], isLoading: permissionsLoading } = useQuery({
    queryKey: ['starship-agent-tool-permissions', starshipId] as const,
    queryFn: async (): Promise<StarshipAgentToolPermissionModel[]> => {
      if (!starshipId) return []
      const response: FetchResponse<ApiResponse<StarshipAgentToolPermissionModel[]>> = await api.get(
        `/api/v1/starships/${starshipId}/agent-tool-permissions`
      )
      return response.data.data || []
    },
    enabled: !!starshipId,
    staleTime: 10 * 1000,
  })

  const setPermissionMutation = useMutation({
    mutationFn: async (input: { agentId: string; toolSlug: string; permission: StarshipAgentToolPermissionModel['permission'] }) => {
      const body: UpdateAgentToolPermissionsRequest = { permissions: [{ toolSlug: input.toolSlug, permission: input.permission }] }
      await api.put(`/api/v1/agents/${input.agentId}/tool-permissions`, body)
      return input
    },
    onMutate: async input => {
      await queryClient.cancelQueries({ queryKey: ['starship-agent-tool-permissions', starshipId] as const })

      const prev = queryClient.getQueryData<StarshipAgentToolPermissionModel[]>(['starship-agent-tool-permissions', starshipId] as const)
      queryClient.setQueryData<StarshipAgentToolPermissionModel[]>(['starship-agent-tool-permissions', starshipId] as const, old => {
        const next = Array.isArray(old) ? [...old] : []
        const idx = next.findIndex(r => r.agentId === input.agentId && r.toolSlug === input.toolSlug)
        if (idx >= 0) {
          next[idx] = { ...next[idx], permission: input.permission }
        } else {
          // toolId isn't required for the UI map; keep it empty for optimistic row
          next.push({ agentId: input.agentId, toolId: '', toolSlug: input.toolSlug, permission: input.permission })
        }
        return next
      })

      return { prev }
    },
    onError: (_err, _input, ctx) => {
      if (ctx?.prev) {
        queryClient.setQueryData(['starship-agent-tool-permissions', starshipId] as const, ctx.prev)
      }
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ['starship-agent-tool-permissions', starshipId] as const })
      await queryClient.invalidateQueries({ queryKey: ['starship-tools', starshipId] as const })
    },
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

  const permissionByAgentId = useMemo(() => {
    const map = new Map<string, Map<string, StarshipAgentToolPermissionModel['permission']>>()
    for (const row of permissionRows) {
      if (!row?.agentId || !row?.toolSlug) continue
      const inner = map.get(row.agentId) ?? new Map<string, StarshipAgentToolPermissionModel['permission']>()
      inner.set(row.toolSlug, row.permission)
      map.set(row.agentId, inner)
    }
    return map
  }, [permissionRows])

  const PERMISSION_ORDER = ['allow', 'ask', 'deny'] as const
  const permissionLabel = (p: StarshipAgentToolPermissionModel['permission']): string => {
    if (p === 'allow') return 'Allow'
    if (p === 'ask') return 'Ask first'
    return 'Deny'
  }
  const permissionVariant = (p: StarshipAgentToolPermissionModel['permission']): React.ComponentProps<typeof Badge>['variant'] => {
    if (p === 'allow') return 'connected'
    if (p === 'ask') return 'secondary'
    return 'destructive'
  }
  const nextPermission = (p: StarshipAgentToolPermissionModel['permission']): StarshipAgentToolPermissionModel['permission'] => {
    const idx = PERMISSION_ORDER.indexOf(p as any)
    const nextIdx = idx >= 0 ? (idx + 1) % PERMISSION_ORDER.length : 0
    return PERMISSION_ORDER[nextIdx]
  }

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
                      <BreadcrumbLink href={`/ship/${slug}/conversations`} className="font-mono">
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

            <section aria-labelledby="tools-list">
              {starshipToolsLoading || agentsLoading || permissionsLoading ? (
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
              ) : starshipAgents.length === 0 ? (
                <div className="text-center py-10 bg-muted/5 border border-dashed border-muted rounded-lg">
                  <div className="w-16 h-16 bg-muted/20 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Icon name="bot" className="w-8 h-8 text-muted-foreground" />
                  </div>
                  <p className="text-base text-muted-foreground mb-3">No agents deployed</p>
                  <p className="text-sm text-muted-foreground">Create an agent to configure tool permissions.</p>
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
                      <div className="overflow-x-auto">
                        <table className="min-w-max w-full border-separate border-spacing-0">
                          <thead>
                            <tr>
                              <th
                                scope="col"
                                className={cn(
                                  'sticky top-0 left-0 z-30 bg-background/90 backdrop-blur',
                                  'text-left text-xs font-semibold text-muted-foreground',
                                  'px-4 py-3 border-b border-border/40 w-[260px] min-w-[260px]'
                                )}
                              >
                                Tools
                              </th>
                              {starshipAgents.map((agent: AgentModel) => (
                                <th
                                  key={agent.id}
                                  scope="col"
                                  className={cn(
                                    'sticky top-0 z-20 bg-background/90 backdrop-blur',
                                    'text-left text-xs font-semibold text-muted-foreground',
                                    'px-4 py-3 border-b border-border/40 w-[170px] min-w-[170px]'
                                  )}
                                >
                                  <button
                                    type="button"
                                    className="hover:text-foreground transition-colors"
                                    onClick={() => router.push(`/ship/${slug}/agent/${agent.slug}`)}
                                    title={`Open agent: ${agent.name}`}
                                  >
                                    {agent.name}
                                  </button>
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {filteredTools.map(tool => {
                              return (
                                <tr key={tool.id} className="group">
                                  <td
                                    className={cn(
                                      'sticky left-0 z-10 bg-background/70 backdrop-blur',
                                      'px-4 py-3 border-b border-border/30 align-middle w-[260px] min-w-[260px]'
                                    )}
                                  >
                                    <div className="flex flex-col gap-1">
                                      <button
                                        type="button"
                                        className="text-sm font-semibold text-foreground text-left hover:underline"
                                        onClick={() => router.push(`/ship/${slug}/tool/${tool.slug}`)}
                                        title={`Open tool: ${tool.name}`}
                                      >
                                        {tool.name}
                                      </button>
                                      <div className="text-xs text-muted-foreground font-mono">{tool.slug}</div>
                                    </div>
                                  </td>
                                  {starshipAgents.map(agent => {
                                    const p =
                                      permissionByAgentId.get(agent.id)?.get(tool.slug) ??
                                      ('deny' as StarshipAgentToolPermissionModel['permission'])
                                    const isUpdating = setPermissionMutation.isPending
                                    return (
                                      <td key={`${tool.id}:${agent.id}`} className="px-4 py-3 border-b border-border/30 align-middle">
                                        <button
                                          type="button"
                                          disabled={isUpdating}
                                          onClick={() => {
                                            const next = nextPermission(p)
                                            setPermissionMutation.mutate({ agentId: agent.id, toolSlug: tool.slug, permission: next })
                                          }}
                                          className={cn('w-full flex items-center justify-start', isUpdating && 'opacity-60 cursor-not-allowed')}
                                          aria-label={`Set permission for agent ${agent.name} on tool ${tool.name}. Current: ${permissionLabel(p)}`}
                                          title="Click to cycle: Allow → Ask first → Deny"
                                        >
                                          <Badge variant={permissionVariant(p)} className="whitespace-nowrap">
                                            {permissionLabel(p)}
                                          </Badge>
                                        </button>
                                      </td>
                                    )
                                  })}
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
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
