'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useInfiniteQuery } from '@tanstack/react-query'
import Link from 'next/link'

import api from '@/lib/api'
import type { AgentModel, ApiResponse, PaginationMeta, ToolModel } from '@starships/protocol'
import type { FetchResponse } from '@/lib/types'

import Icon from '@/components/primitives/Icon'
import AgentAvatar from '@/components/animated/AgentAvatar'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { StarshipConnectorsPanel } from '@/components/connectors/StarshipConnectorsPanel'
import { Button } from '@/components/ui/button'
import { PresenceIndicator } from '@/components/ui/PresenceIndicator'

import { useAuth } from '@/hooks/useAuth'
import { useStarshipBySlug } from '@/hooks/useStarships'
import { useInfiniteStarshipAgents } from '@/hooks/useAgents'
import { useMessageAttachments } from '@/hooks/useFileUpload'
import { cn } from '@/lib/utils'
import { formatAgentDisplayName } from '@/lib/agentDisplay'
import { pickToolLeftIcon } from '@/lib/toolTemplateIcon'

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

// Match connector list CTA styling (see `StarshipConnectorsPanel`).
const INTEGRATION_CTA_BUTTON_CLASS =
  'h-8 group min-w-[130px] justify-center shrink-0 font-medium transition-all duration-200 border border-transparent text-[rgba(245,158,11,0.8)] hover:text-[rgba(245,158,11,0.8)] hover:border-[rgba(245,158,11,0.25)] hover:bg-[linear-gradient(135deg,rgba(245,158,11,0.10),rgba(251,191,36,0.06))] hover:shadow-[0_0_4px_rgba(245,158,11,0.10)] disabled:text-muted-foreground disabled:hover:text-muted-foreground disabled:hover:border-transparent disabled:hover:bg-transparent disabled:hover:shadow-none'
const INTEGRATION_CTA_ICON_CLASS = 'mr-1 h-4 w-4 text-[rgba(245,158,11,0.85)] group-disabled:text-muted-foreground'
const INTEGRATION_OUTLINE_BUTTON_CLASS = 'h-8 bg-transparent border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted/40'

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

  const isAllTab = tabFromUrl === 'all'
  const SECTION_PREVIEW_LIMIT = 5
  const TAB_PAGE_SIZE = isAllTab ? SECTION_PREVIEW_LIMIT : 18

  const buildIntegrationsTabHref = useCallback(
    (tab: IntegrationsTab) => {
      const base = `/ship/${encodeURIComponent(slug)}/integrations`
      const params = new URLSearchParams()
      const q = debouncedQuery.trim()
      if (q) params.set('q', q)
      if (tab !== 'all') params.set('tab', tab)
      const qs = params.toString()
      return qs ? `${base}?${qs}` : base
    },
    [debouncedQuery, slug]
  )

  // Agents (starship-scoped)
  const agentsQuery = useInfiniteStarshipAgents(starshipId, Boolean(starshipId), {
    limit: TAB_PAGE_SIZE,
    order: 'DESC',
    search: debouncedQuery || undefined,
  })

  const agentsPagination = useMemo<PaginationMeta | null>(() => {
    const pages = agentsQuery.data?.pages ?? []
    for (let i = pages.length - 1; i >= 0; i--) {
      const p = pages[i]?.pagination ?? null
      if (p) return p
    }
    return null
  }, [agentsQuery.data])

  const agents = useMemo(() => {
    const pages = agentsQuery.data?.pages ?? []
    return pages.flatMap(p => (Array.isArray(p?.agents) ? p.agents : []))
  }, [agentsQuery.data])

  const hasMoreAgentsThanPreview = useMemo(() => {
    const total = typeof agentsPagination?.total === 'number' ? agentsPagination.total : agents.length
    return total > SECTION_PREVIEW_LIMIT
  }, [SECTION_PREVIEW_LIMIT, agents.length, agentsPagination?.total])

  const agentAvatarAttachmentIds = useMemo(() => {
    const ids = (agents || [])
      .map(a => String((a as any)?.avatarAttachmentId || '').trim())
      .filter(Boolean)
    return Array.from(new Set(ids))
  }, [agents])

  const { data: agentAvatarAttachments = [] } = useMessageAttachments(agentAvatarAttachmentIds, starshipId || undefined)

  const agentAvatarUrlById = useMemo(() => {
    const m = new Map<string, string>()
    for (const att of agentAvatarAttachments || []) {
      const id = String((att as any)?.id || '').trim()
      const url = String((att as any)?.previewUrl || '').trim()
      if (id && url) m.set(id, url)
    }
    return m
  }, [agentAvatarAttachments])

  // Tools (starship-scoped)
  type ToolsPage = { tools: ToolModel[]; pagination: PaginationMeta | null }
  const toolsQuery = useInfiniteQuery({
    queryKey: ['starship-tools', starshipId, 'paged', { limit: TAB_PAGE_SIZE, search: debouncedQuery || null, order: 'DESC' }] as const,
    enabled: Boolean(starshipId),
    initialPageParam: 1,
    queryFn: async ({ pageParam }): Promise<ToolsPage> => {
      const page = typeof pageParam === 'number' ? pageParam : Number(pageParam)
      const response: FetchResponse<ApiResponse<ToolModel[]>> = await api.get(`/api/v1/starships/${starshipId}/tools`, {
        params: {
          page,
          limit: TAB_PAGE_SIZE,
          search: debouncedQuery || undefined,
          order: 'DESC',
        },
      })
      return { tools: response.data.data || [], pagination: response.data.meta?.pagination ?? null }
    },
    getNextPageParam: last => {
      const p = last?.pagination
      if (!p) return undefined
      return p.has_next ? p.page + 1 : undefined
    },
    staleTime: 30 * 1000,
  })

  const toolsPagination = useMemo<PaginationMeta | null>(() => {
    const pages = toolsQuery.data?.pages ?? []
    for (let i = pages.length - 1; i >= 0; i--) {
      const p = pages[i]?.pagination ?? null
      if (p) return p
    }
    return null
  }, [toolsQuery.data])

  const tools = useMemo(() => {
    const pages = toolsQuery.data?.pages ?? []
    return pages.flatMap(p => (Array.isArray(p?.tools) ? p.tools : []))
  }, [toolsQuery.data])

  const toolLeftIconById = useMemo(() => {
    const m = new Map<string, { name: string; title: string }>()
    for (const t of tools || []) {
      const id = String((t as any)?.id || '').trim()
      if (!id) continue
      const label = String((t as any)?.name || '').trim() || String((t as any)?.slug || '').trim() || 'Tool'
      m.set(id, pickToolLeftIcon(label))
    }
    return m
  }, [tools])

  const [connectorStats, setConnectorStats] = useState<{ total: number; connected: number } | null>(null)
  const handleConnectorStatsChange = useCallback((stats: { total: number; connected: number }) => {
    setConnectorStats(prev => (prev && prev.total === stats.total && prev.connected === stats.connected ? prev : stats))
  }, [])

  const totalConnectors = typeof connectorStats?.total === 'number' ? connectorStats.total : null
  const [catalogTotal, setCatalogTotal] = useState<number | null>(null)

  const showAgents = tabFromUrl === 'all' || tabFromUrl === 'agents'
  const showTools = tabFromUrl === 'all' || tabFromUrl === 'tools'
  const showConnectors = (tabFromUrl === 'all' || tabFromUrl === 'connectors') && canManageConnectors

  const renderAgentsList = () => {
    if (agentsQuery.isLoading) {
      return <div className="text-sm text-muted-foreground">Loading agents…</div>
    }
    if (!Array.isArray(agents) || agents.length === 0) {
      return (
        <div className="flex items-center justify-center py-10">
          <p className="text-sm text-muted-foreground text-center">{debouncedQuery ? `No agents match “${debouncedQuery}”.` : 'No agents in this starship yet.'}</p>
        </div>
      )
    }

    return (
      <div className="space-y-2">
        {agents.map((a: AgentModel) => {
          const agentSlug = String((a as any)?.slug || '')
          const avatarAttachmentId = String((a as any)?.avatarAttachmentId || '').trim()
          const avatarUrl = avatarAttachmentId ? agentAvatarUrlById.get(avatarAttachmentId) : undefined
          const avatarSeed = formatAgentDisplayName(a) || String((a as any)?.name || '').trim() || agentSlug || 'Agent'
          return (
            <div key={String(a.id)} className="rounded-lg border border-border/60 bg-card px-4 py-3 flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1" aria-label={formatAgentDisplayName(a) || agentSlug || 'Agent'}>
                <div className="flex items-start gap-3">
                  <div className="relative mt-0.5 h-10 w-10 flex-shrink-0">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full ring-1 ring-border/50 bg-muted/10 overflow-hidden">
                      <AgentAvatar seed={avatarSeed} imageUrl={avatarUrl} size={40} rounded instanceId={String(a.id)} />
                    </span>
                    <PresenceIndicator
                      kind="online"
                      active={true}
                      size="sm"
                      placement="outset"
                      // Match Members/Connectors placement for 40px avatar.
                      className="translate-x-[22%] translate-y-[6%]"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="text-sm font-medium truncate text-foreground hover:underline text-left"
                        onClick={() => {
                          if (!agentSlug) return
                          router.push(`/ship/${slug}/agent/${encodeURIComponent(agentSlug)}`)
                        }}
                        title={formatAgentDisplayName(a) || agentSlug}
                        disabled={!agentSlug}
                      >
                        {formatAgentDisplayName(a) || 'Untitled agent'}
                      </button>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                      {(a as any)?.description ? <span className="truncate">{String((a as any).description)}</span> : null}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1 self-center">
                <Button
                  size="sm"
                  variant="ghost"
                  className={INTEGRATION_CTA_BUTTON_CLASS}
                  onClick={() => {
                    if (!agentSlug) return
                    router.push(`/ship/${slug}/agent/${encodeURIComponent(agentSlug)}`)
                  }}
                  disabled={!agentSlug}
                >
                  <Icon name="chevron-right" className={INTEGRATION_CTA_ICON_CLASS} />
                  Open
                </Button>
              </div>
            </div>
          )
        })}
        {!isAllTab && agentsQuery.hasNextPage ? (
          <div className="flex justify-center pt-4">
            <Button variant="outline" onClick={() => agentsQuery.fetchNextPage()} disabled={agentsQuery.isFetchingNextPage} className={INTEGRATION_OUTLINE_BUTTON_CLASS}>
              {agentsQuery.isFetchingNextPage ? 'Loading…' : 'Load more agents'}
            </Button>
          </div>
        ) : null}
      </div>
    )
  }

  const renderToolsList = () => {
    if (toolsQuery.isLoading) {
      return <div className="text-sm text-muted-foreground">Loading tools…</div>
    }
    if (!Array.isArray(tools) || tools.length === 0) {
      return (
        <div className="flex items-center justify-center py-10">
          <p className="text-sm text-muted-foreground text-center">{debouncedQuery ? `No tools match “${debouncedQuery}”.` : 'No tools installed in this starship yet.'}</p>
        </div>
      )
    }

    return (
      <div className="space-y-2">
        {tools.map((t: ToolModel) => {
          const toolSlug = String((t as any)?.slug || '')
          const toolLeftIcon = toolLeftIconById.get(String((t as any)?.id || '').trim()) ?? pickToolLeftIcon(String(t?.name || '').trim() || 'Tool')
          return (
            <div key={String(t.id)} className="rounded-lg border border-border/60 bg-card px-4 py-3 flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1" aria-label={t.name || toolSlug || 'Tool'}>
                <div className="flex items-start gap-3">
                  <div className="relative mt-0.5 h-10 w-10 flex-shrink-0">
                    <span
                      className="flex h-10 w-10 items-center justify-center rounded-full ring-1 ring-border/50 bg-muted/10 overflow-hidden"
                      title={toolLeftIcon.title}
                      aria-label={toolLeftIcon.title}
                    >
                      <Icon name={toolLeftIcon.name} className="h-4 w-4 text-muted-foreground" />
                    </span>
                    <PresenceIndicator kind="online" active={true} size="sm" placement="outset" className="translate-x-[22%] translate-y-[6%]" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="text-sm font-medium truncate text-foreground hover:underline text-left"
                        onClick={() => {
                          if (!toolSlug) return
                          router.push(`/ship/${slug}/tool/${encodeURIComponent(toolSlug)}`)
                        }}
                        title={t.name || toolSlug}
                        disabled={!toolSlug}
                      >
                        {t.name || 'Untitled tool'}
                      </button>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                      {(t as any)?.description ? <span className="truncate">{String((t as any).description)}</span> : null}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1 self-center">
                <Button
                  size="sm"
                  variant="ghost"
                  className={INTEGRATION_CTA_BUTTON_CLASS}
                  onClick={() => {
                    if (!toolSlug) return
                    router.push(`/ship/${slug}/tool/${encodeURIComponent(toolSlug)}`)
                  }}
                  disabled={!toolSlug}
                >
                  <Icon name="chevron-right" className={INTEGRATION_CTA_ICON_CLASS} />
                  Open
                </Button>
              </div>
            </div>
          )
        })}
        {!isAllTab && toolsQuery.hasNextPage ? (
          <div className="flex justify-center pt-4">
            <Button variant="outline" onClick={() => toolsQuery.fetchNextPage()} disabled={toolsQuery.isFetchingNextPage} className={INTEGRATION_OUTLINE_BUTTON_CLASS}>
              {toolsQuery.isFetchingNextPage ? 'Loading…' : 'Load more tools'}
            </Button>
          </div>
        ) : null}
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
                        {typeof agentsPagination?.total === 'number' ? (
                          <Badge variant={tabFromUrl === 'agents' ? 'default' : 'secondary'} className="h-4 px-1.5 py-0 text-[10px] font-medium leading-none tabular-nums">
                            {agentsPagination.total}
                          </Badge>
                        ) : null}
                      </span>
                    </TabsTrigger>
                    <TabsTrigger value="tools">
                      <span className="inline-flex items-center gap-1.5">
                        <span>Tools</span>
                        {typeof toolsPagination?.total === 'number' ? (
                          <Badge variant={tabFromUrl === 'tools' ? 'default' : 'secondary'} className="h-4 px-1.5 py-0 text-[10px] font-medium leading-none tabular-nums">
                            {toolsPagination.total}
                          </Badge>
                        ) : null}
                      </span>
                    </TabsTrigger>
                    {canManageConnectors ? (
                      <TabsTrigger value="connectors">
                        <span className="inline-flex items-center gap-1.5">
                          <span>Connectors</span>
                          {typeof catalogTotal === 'number' ? (
                            <Badge variant={tabFromUrl === 'connectors' ? 'default' : 'secondary'} className="h-4 px-1.5 py-0 text-[10px] font-medium leading-none tabular-nums">
                              {catalogTotal}
                            </Badge>
                          ) : typeof totalConnectors === 'number' ? (
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
                      {typeof agentsPagination?.total === 'number' ? (
                        <Badge
                          variant="outline"
                          className="h-5 px-2 py-0 bg-muted/10 text-[10px] font-medium leading-none inline-flex items-center gap-1.5 tabular-nums"
                        >
                          <span aria-hidden="true" className="relative inline-flex h-3 w-3 items-center justify-center">
                            <Icon name="bot" className="h-3 w-3 text-muted-foreground" />
                          </span>
                          {agentsPagination.total} agents
                        </Badge>
                      ) : null}
                    </div>
                    <Button asChild size="sm" variant="ghost" className="h-8 text-primary hover:text-primary">
                      <Link href="/explore">
                        <Icon name="store" iconOverride={{ type: 'phosphor', component: 'Storefront' }} className="h-4 w-4 mr-1.5" />
                        Explore agents
                      </Link>
                    </Button>
                  </div>
                  {renderAgentsList()}
                  {isAllTab ? (
                    <div className="flex justify-center pt-4">
                      {hasMoreAgentsThanPreview ? (
                        <Button asChild variant="outline" className={INTEGRATION_OUTLINE_BUTTON_CLASS}>
                          <Link href={buildIntegrationsTabHref('agents')}>Show all agents</Link>
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                </section>
              ) : null}

              {showTools ? (
                <section>
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="min-w-0 flex items-baseline gap-3">
                      <h3 className="text-lg font-semibold leading-tight text-foreground">Tools</h3>
                      {typeof toolsPagination?.total === 'number' ? (
                        <Badge
                          variant="outline"
                          className="h-5 px-2 py-0 bg-muted/10 text-[10px] font-medium leading-none inline-flex items-center gap-1.5 tabular-nums"
                        >
                          <span aria-hidden="true" className="relative inline-flex h-3 w-3 items-center justify-center">
                            <Icon name="magic-wand" className="h-3 w-3 text-muted-foreground" />
                          </span>
                          {toolsPagination.total} tools
                        </Badge>
                      ) : null}
                    </div>
                    <Button asChild size="sm" variant="ghost" className="h-8 text-primary hover:text-primary">
                      <Link href={`/ship/${encodeURIComponent(slug)}/tools`}>
                        <Icon name="magic-wand" className="h-4 w-4 mr-1.5" />
                        Manage tools
                      </Link>
                    </Button>
                  </div>
                  {renderToolsList()}
                  {isAllTab ? (
                    <div className="flex justify-center pt-4">
                      <Button asChild variant="outline" className={INTEGRATION_OUTLINE_BUTTON_CLASS}>
                        <Link href={buildIntegrationsTabHref('tools')}>Show all tools</Link>
                      </Button>
                    </div>
                  ) : null}
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
                      {typeof catalogTotal === 'number' ? (
                        <Badge
                          variant="outline"
                          className="h-5 px-2 py-0 bg-muted/10 text-[10px] font-medium leading-none inline-flex items-center gap-1.5 tabular-nums"
                        >
                          <span aria-hidden="true" className="relative inline-flex h-3 w-3 items-center justify-center">
                            <Icon name="plug" className="h-3 w-3 text-muted-foreground" />
                          </span>
                          {catalogTotal} connectors
                        </Badge>
                      ) : typeof totalConnectors === 'number' ? (
                        <Badge
                          variant="outline"
                          className="h-5 px-2 py-0 bg-muted/10 text-[10px] font-medium leading-none inline-flex items-center gap-1.5 tabular-nums"
                        >
                          <span aria-hidden="true" className="relative inline-flex h-3 w-3 items-center justify-center">
                            <Icon name="plug" className="h-3 w-3 text-muted-foreground" />
                          </span>
                          {totalConnectors} connectors
                        </Badge>
                      ) : null}
                    </div>
                    <Button asChild size="sm" variant="ghost" className="h-8 text-primary hover:text-primary">
                      <Link href={`/ship/${encodeURIComponent(slug)}/connectors`}>
                        <Icon name="plug" className="h-4 w-4 mr-1.5" />
                        Manage connectors
                      </Link>
                    </Button>
                  </div>

                  <StarshipConnectorsPanel
                    starshipId={starshipId}
                    maxColumns={2}
                    onStatsChange={handleConnectorStatsChange}
                    onCatalogTotalChange={setCatalogTotal}
                    statusFilter="all"
                    catalogQuery={debouncedQuery}
                    layout="list"
                    paginateCatalog
                    catalogPageSize={TAB_PAGE_SIZE}
                    maxItems={isAllTab ? SECTION_PREVIEW_LIMIT : undefined}
                    showLoadMore={!isAllTab}
                    sortBy="recently_used"
                  />
                  {isAllTab ? (
                    <div className="flex justify-center pt-4">
                      <Button asChild variant="outline" className={INTEGRATION_OUTLINE_BUTTON_CLASS}>
                        <Link href={buildIntegrationsTabHref('connectors')}>Show all connectors</Link>
                      </Button>
                    </div>
                  ) : null}
                </section>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

