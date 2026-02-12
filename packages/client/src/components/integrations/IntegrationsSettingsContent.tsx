'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'

import api from '@/lib/api'
import type { ApiResponse, AgentModel, ToolModel } from '@starships/protocol'
import type { FetchResponse } from '@/lib/types'

import Icon from '@/components/primitives/Icon'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { StarshipConnectorsPanel } from '@/components/connectors/StarshipConnectorsPanel'

import { useAuth } from '@/hooks/useAuth'
import { useStarshipBySlug } from '@/hooks/useStarships'
import { useStarshipAgents } from '@/hooks/useAgents'
import { cn } from '@/lib/utils'
import { formatAgentDisplayName } from '@/lib/agentDisplay'

interface IntegrationsSettingsContentProps {
  slug: string
}

type IntegrationsTab = 'all' | 'agents' | 'tools' | 'connectors'

function toIntegrationsTab(raw: string | null | undefined): IntegrationsTab {
  const v = String(raw || '').trim()
  if (v === 'agents' || v === 'tools' || v === 'connectors' || v === 'all') return v
  return 'all'
}

function safeLower(s: unknown): string {
  return typeof s === 'string' ? s.toLowerCase() : ''
}

export function IntegrationsSettingsContent({ slug }: IntegrationsSettingsContentProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, isInstanceAdmin, isLoading: authLoading } = useAuth()

  const { data: starship, isLoading: starshipLoading } = useStarshipBySlug(slug)
  const starshipId = starship?.id ? String(starship.id) : ''

  const canManageConnectors = useMemo(() => {
    if (!user?.id) return false
    if (!starship?.id) return false
    return Boolean(isInstanceAdmin === true || String(starship.ownerId) === String(user.id))
  }, [isInstanceAdmin, starship?.id, starship?.ownerId, user?.id])

  const tabFromUrl = useMemo<IntegrationsTab>(() => toIntegrationsTab(searchParams?.get('tab')), [searchParams])
  const qFromUrl = useMemo(() => (searchParams?.get('q') || '').trim(), [searchParams])

  const [searchValue, setSearchValue] = useState(qFromUrl)
  const [debouncedQuery, setDebouncedQuery] = useState(qFromUrl)

  useEffect(() => {
    setSearchValue(qFromUrl)
    setDebouncedQuery(qFromUrl)
  }, [qFromUrl])

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(searchValue.trim()), 250)
    return () => clearTimeout(t)
  }, [searchValue])

  // Sync search to URL (matches Connectors page behavior)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const q = debouncedQuery.trim()
    if (q) params.set('q', q)
    else params.delete('q')
    const next = params.toString() ? `${window.location.pathname}?${params.toString()}` : window.location.pathname
    router.replace(next)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQuery])

  const setTab = useCallback(
    (nextTab: IntegrationsTab) => {
      if (typeof window === 'undefined') return
      const params = new URLSearchParams(window.location.search)
      if (nextTab === 'all') params.delete('tab')
      else params.set('tab', nextTab)
      const next = params.toString() ? `${window.location.pathname}?${params.toString()}` : window.location.pathname
      router.replace(next)
    },
    [router]
  )

  // Agents (starship-scoped)
  const { data: agents = [], isLoading: agentsLoading } = useStarshipAgents(starshipId, Boolean(starshipId))

  const filteredAgents = useMemo(() => {
    const q = safeLower(debouncedQuery).trim()
    if (!q) return agents
    return (agents || []).filter(a => {
      const name = safeLower(a?.name)
      const role = safeLower((a as any)?.role)
      const agentSlug = safeLower((a as any)?.slug)
      const desc = safeLower((a as any)?.description)
      return name.includes(q) || role.includes(q) || agentSlug.includes(q) || desc.includes(q)
    })
  }, [agents, debouncedQuery])

  // Tools (starship-scoped)
  const { data: tools = [], isLoading: toolsLoading } = useQuery({
    queryKey: ['starship-tools', starshipId] as const,
    queryFn: async (): Promise<ToolModel[]> => {
      if (!starshipId) return []
      const response: FetchResponse<ApiResponse<ToolModel[]>> = await api.get(`/api/v1/starships/${starshipId}/tools`)
      return response.data.data || []
    },
    enabled: Boolean(starshipId),
    staleTime: 30 * 1000,
  })

  const filteredTools = useMemo(() => {
    const q = safeLower(debouncedQuery).trim()
    if (!q) return tools
    return (tools || []).filter(t => {
      const name = safeLower(t?.name)
      const toolSlug = safeLower((t as any)?.slug)
      const desc = safeLower((t as any)?.description)
      return name.includes(q) || toolSlug.includes(q) || desc.includes(q)
    })
  }, [debouncedQuery, tools])

  const [connectorStats, setConnectorStats] = useState<{ total: number; connected: number } | null>(null)
  const handleConnectorStatsChange = useCallback((stats: { total: number; connected: number }) => {
    setConnectorStats(prev => (prev && prev.total === stats.total && prev.connected === stats.connected ? prev : stats))
  }, [])

  const totalConnectors = typeof connectorStats?.total === 'number' ? connectorStats.total : null

  const showAgents = tabFromUrl === 'all' || tabFromUrl === 'agents'
  const showTools = tabFromUrl === 'all' || tabFromUrl === 'tools'
  const showConnectors = (tabFromUrl === 'all' || tabFromUrl === 'connectors') && canManageConnectors

  const renderAgentsList = () => {
    if (agentsLoading) {
      return <div className="text-sm text-muted-foreground">Loading agents…</div>
    }
    if (!Array.isArray(filteredAgents) || filteredAgents.length === 0) {
      return (
        <div className="flex items-center justify-center py-10">
          <p className="text-sm text-muted-foreground text-center">{debouncedQuery ? `No agents match “${debouncedQuery}”.` : 'No agents in this starship yet.'}</p>
        </div>
      )
    }

    return (
      <div className="space-y-2">
        {filteredAgents.map((a: AgentModel) => {
          const agentSlug = String((a as any)?.slug || '')
          return (
            <div key={String(a.id)} className="rounded-lg border border-border/60 bg-card px-4 py-3 flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full ring-1 ring-border/50 bg-muted/10">
                    <Icon name="bot" className="h-4 w-4 text-muted-foreground" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <button
                      type="button"
                      className="text-sm font-medium text-foreground truncate hover:underline text-left"
                      onClick={() => {
                        if (!agentSlug) return
                        router.push(`/ship/${slug}/agent/${encodeURIComponent(agentSlug)}`)
                      }}
                      title={formatAgentDisplayName(a)}
                      disabled={!agentSlug}
                    >
                      {formatAgentDisplayName(a) || 'Untitled agent'}
                    </button>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                      {agentSlug ? <span className="font-mono truncate">{agentSlug}</span> : null}
                      {(a as any)?.description ? <span className="truncate">{String((a as any).description)}</span> : null}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1 self-center">
                <button
                  type="button"
                  className="h-8 min-w-[130px] inline-flex items-center justify-center rounded-2xl border border-border/60 bg-background/40 text-xs font-medium text-muted-foreground hover:bg-muted/30 hover:text-foreground transition-colors disabled:opacity-60 disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
                  onClick={() => {
                    if (!agentSlug) return
                    router.push(`/ship/${slug}/agent/${encodeURIComponent(agentSlug)}`)
                  }}
                  disabled={!agentSlug}
                >
                  Open
                  <Icon name="chevron-right" className="ml-1 h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  const renderToolsList = () => {
    if (toolsLoading) {
      return <div className="text-sm text-muted-foreground">Loading tools…</div>
    }
    if (!Array.isArray(filteredTools) || filteredTools.length === 0) {
      return (
        <div className="flex items-center justify-center py-10">
          <p className="text-sm text-muted-foreground text-center">{debouncedQuery ? `No tools match “${debouncedQuery}”.` : 'No tools installed in this starship yet.'}</p>
        </div>
      )
    }

    return (
      <div className="space-y-2">
        {filteredTools.map((t: ToolModel) => {
          const toolSlug = String((t as any)?.slug || '')
          return (
            <div key={String(t.id)} className="rounded-lg border border-border/60 bg-card px-4 py-3 flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full ring-1 ring-border/50 bg-muted/10">
                    <Icon name="magic-wand" className="h-4 w-4 text-muted-foreground" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <button
                      type="button"
                      className="text-sm font-medium text-foreground truncate hover:underline text-left"
                      onClick={() => {
                        if (!toolSlug) return
                        router.push(`/ship/${slug}/tool/${encodeURIComponent(toolSlug)}`)
                      }}
                      title={t.name || toolSlug}
                      disabled={!toolSlug}
                    >
                      {t.name || 'Untitled tool'}
                    </button>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                      {toolSlug ? <span className="font-mono truncate">{toolSlug}</span> : null}
                      {(t as any)?.description ? <span className="truncate">{String((t as any).description)}</span> : null}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1 self-center">
                <button
                  type="button"
                  className="h-8 min-w-[130px] inline-flex items-center justify-center rounded-2xl border border-border/60 bg-background/40 text-xs font-medium text-muted-foreground hover:bg-muted/30 hover:text-foreground transition-colors disabled:opacity-60 disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
                  onClick={() => {
                    if (!toolSlug) return
                    router.push(`/ship/${slug}/tool/${encodeURIComponent(toolSlug)}`)
                  }}
                  disabled={!toolSlug}
                >
                  Open
                  <Icon name="chevron-right" className="ml-1 h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className="relative flex flex-col h-full min-w-0">
      <div className="sticky top-0 z-10 border-b border-border/60 bg-card">
        <div className="px-4 pt-3.5 pb-3">
          <div className="w-full">
            <div className="flex items-center justify-between gap-4">
              <div className="flex-1 min-w-0 flex flex-col justify-center gap-1.5">
                <div className="flex items-baseline gap-2 min-w-0 w-full">
                  <span aria-hidden="true" className="flex-shrink-0 self-center text-foreground leading-none">
                    <Icon name="link" weight="bold" className="h-5 w-5" />
                  </span>
                  <h3 className="flex-1 text-xl font-semibold text-foreground truncate tracking-tight leading-tight min-w-0">Integrations</h3>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-xs leading-none text-muted-foreground min-h-6">
                  <span className="font-medium leading-none text-muted-foreground">Agents, tools, and connectors installed in this starship.</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 pt-6" style={{ paddingBottom: 32 }}>
        <div className={cn('w-full bg-transparent max-w-4xl mx-auto min-h-full flex flex-col')}>
          <div className="pt-4 pb-8">
            <Tabs value={tabFromUrl} onValueChange={value => setTab(toIntegrationsTab(value))}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex justify-start">
                  <TabsList className="w-full sm:w-auto flex-nowrap justify-start gap-1 overflow-x-auto custom-scrollbar">
                    <TabsTrigger value="all">
                      <span className="inline-flex items-center gap-1.5">
                        <span>All</span>
                      </span>
                    </TabsTrigger>
                    <TabsTrigger value="agents">
                      <span className="inline-flex items-center gap-1.5">
                        <span>Agents</span>
                        {Array.isArray(agents) ? (
                          <Badge variant={tabFromUrl === 'agents' ? 'default' : 'secondary'} className="h-4 px-1.5 py-0 text-[10px] font-medium leading-none tabular-nums">
                            {agents.length}
                          </Badge>
                        ) : null}
                      </span>
                    </TabsTrigger>
                    <TabsTrigger value="tools">
                      <span className="inline-flex items-center gap-1.5">
                        <span>Tools</span>
                        {Array.isArray(tools) ? (
                          <Badge variant={tabFromUrl === 'tools' ? 'default' : 'secondary'} className="h-4 px-1.5 py-0 text-[10px] font-medium leading-none tabular-nums">
                            {tools.length}
                          </Badge>
                        ) : null}
                      </span>
                    </TabsTrigger>
                    {canManageConnectors ? (
                      <TabsTrigger value="connectors">
                        <span className="inline-flex items-center gap-1.5">
                          <span>Connectors</span>
                          {typeof totalConnectors === 'number' ? (
                            <Badge variant={tabFromUrl === 'connectors' ? 'default' : 'secondary'} className="h-4 px-1.5 py-0 text-[10px] font-medium leading-none tabular-nums">
                              {totalConnectors}
                            </Badge>
                          ) : null}
                        </span>
                      </TabsTrigger>
                    ) : null}
                  </TabsList>
                </div>

                <div className="w-full sm:w-64">
                  <div className="relative">
                    <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4 z-10 pointer-events-none" />
                    <Input
                      value={searchValue}
                      onChange={e => setSearchValue(e.target.value)}
                      placeholder="Search integrations"
                      className="pl-9 h-9 py-1.5 text-[13px] rounded-2xl border-border/60 bg-card shadow-sm"
                      aria-label="Search integrations"
                    />
                  </div>
                </div>
              </div>
            </Tabs>
          </div>

          {starshipLoading ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : !starship ? (
            <Alert>
              <Icon name="info" className="h-4 w-4" />
              <AlertDescription>Starship not found. Please check the URL and try again.</AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-10">
              {showAgents ? (
                <section>
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="min-w-0 flex items-baseline gap-3">
                      <h3 className="text-lg font-semibold leading-tight text-foreground">Agents</h3>
                      {Array.isArray(filteredAgents) ? (
                        <span className="text-xs text-muted-foreground tabular-nums">{filteredAgents.length}</span>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      className={cn(
                        'text-xs font-medium text-muted-foreground hover:text-foreground transition-colors',
                        tabFromUrl === 'agents' ? 'opacity-0 pointer-events-none' : ''
                      )}
                      onClick={() => setTab('agents')}
                      aria-label="View agents only"
                    >
                      View
                    </button>
                  </div>
                  {renderAgentsList()}
                </section>
              ) : null}

              {showTools ? (
                <section>
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="min-w-0 flex items-baseline gap-3">
                      <h3 className="text-lg font-semibold leading-tight text-foreground">Tools</h3>
                      {Array.isArray(filteredTools) ? <span className="text-xs text-muted-foreground tabular-nums">{filteredTools.length}</span> : null}
                    </div>
                    <button
                      type="button"
                      className={cn(
                        'text-xs font-medium text-muted-foreground hover:text-foreground transition-colors',
                        tabFromUrl === 'tools' ? 'opacity-0 pointer-events-none' : ''
                      )}
                      onClick={() => setTab('tools')}
                      aria-label="View tools only"
                    >
                      View
                    </button>
                  </div>
                  {renderToolsList()}
                </section>
              ) : null}

              {tabFromUrl === 'connectors' && !canManageConnectors ? (
                <Alert>
                  <Icon name="lock" className="h-4 w-4" />
                  <AlertDescription>Only the starship owner (or instance admin) can manage connectors.</AlertDescription>
                </Alert>
              ) : null}

              {showConnectors ? (
                <section>
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="min-w-0 flex items-baseline gap-3">
                      <h3 className="text-lg font-semibold leading-tight text-foreground">Connectors</h3>
                    </div>
                    <button
                      type="button"
                      className={cn(
                        'text-xs font-medium text-muted-foreground hover:text-foreground transition-colors',
                        tabFromUrl === 'connectors' ? 'opacity-0 pointer-events-none' : ''
                      )}
                      onClick={() => setTab('connectors')}
                      aria-label="View connectors only"
                    >
                      View
                    </button>
                  </div>

                  <StarshipConnectorsPanel
                    starshipId={starshipId}
                    maxColumns={2}
                    onStatsChange={handleConnectorStatsChange}
                    statusFilter="all"
                    catalogQuery={debouncedQuery}
                    layout="list"
                  />
                </section>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

