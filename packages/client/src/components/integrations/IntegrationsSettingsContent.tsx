'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { StarshipConnectorsPanel } from '@/components/connectors/StarshipConnectorsPanel'
import { Button } from '@/components/ui/button'
import { PresenceIndicator } from '@/components/ui/PresenceIndicator'
import { MobileNavToggleButton } from '@/components/navigation/MobileNavToggleButton'
import { MobileBottomFilterBar } from '@/components/layout/MobileBottomFilterBar'

import { useAuth } from '@/hooks/useAuth'
import { useStarshipBySlug } from '@/hooks/useStarships'
import { useInfiniteStarshipAgents } from '@/hooks/useAgents'
import { useMessageAttachments } from '@/hooks/useFileUpload'
import { useInfiniteConnectorCatalog } from '@/hooks/useConnectors'
import { cn } from '@/lib/utils'
import { formatAgentDisplayName } from '@/lib/agentDisplay'
import { pickToolLeftIcon } from '@/lib/toolTemplateIcon'

interface IntegrationsSettingsContentProps {
  slug: string
}

type IntegrationsTab = 'all' | 'agents' | 'automations' | 'connectors'

function toIntegrationsTab(raw: string | null | undefined): IntegrationsTab {
  const v = String(raw || '').trim()
  // Back-compat: old URLs used `tab=tools`
  if (v === 'tools') return 'automations'
  if (v === 'agents' || v === 'automations' || v === 'connectors' || v === 'all') return v
  // Default to connectors when no tab is specified.
  return 'connectors'
}

function safeLower(s: unknown): string {
  return typeof s === 'string' ? s.toLowerCase() : ''
}

// Match connector list CTA styling (see `StarshipConnectorsPanel`).
const INTEGRATION_CTA_BUTTON_CLASS =
  'h-8 group min-w-[130px] justify-center shrink-0 font-medium transition-all duration-200 border border-transparent text-[rgba(245,158,11,0.8)] hover:text-[rgba(245,158,11,0.8)] hover:border-[rgba(245,158,11,0.25)] hover:bg-[linear-gradient(135deg,rgba(245,158,11,0.10),rgba(251,191,36,0.06))] hover:shadow-[0_0_4px_rgba(245,158,11,0.10)] disabled:text-muted-foreground disabled:hover:text-muted-foreground disabled:hover:border-transparent disabled:hover:bg-transparent disabled:hover:shadow-none'
const INTEGRATION_CTA_ICON_CLASS = 'mr-1 h-4 w-4 text-[rgba(245,158,11,0.85)] group-disabled:text-muted-foreground'
const INTEGRATION_OUTLINE_BUTTON_CLASS = 'h-7 px-2.5 text-[11px] bg-transparent border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted/40'
const SEARCH_DEBOUNCE_MS = 400

function excludeInternalStarshipsConnectorFromTotal(total: number | null): number | null {
  if (typeof total !== 'number' || !Number.isFinite(total)) return null
  // Installed hides the built-in Starships connector; keep badge totals consistent.
  return Math.max(0, total - 1)
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
    const t = setTimeout(() => setDebouncedQuery(searchValue.trim()), SEARCH_DEBOUNCE_MS)
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
      // We no longer use the All tab in the UI; always persist the explicit tab.
      params.set('tab', nextTab)
      const next = params.toString() ? `${window.location.pathname}?${params.toString()}` : window.location.pathname
      router.replace(next)
    },
    [router]
  )

  const isAllTab = tabFromUrl === 'all'
  const SECTION_PREVIEW_LIMIT = 5
  const TAB_PAGE_SIZE = 18
  // Even on the All tab, fetch a full page so search results
  // aren't inadvertently excluded by a tiny server-side limit.
  const QUERY_PAGE_SIZE = 18

  const buildInstalledTabHref = useCallback(
    (tab: IntegrationsTab) => {
      const base = `/ship/${encodeURIComponent(slug)}/installed`
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
    limit: QUERY_PAGE_SIZE,
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

  const visibleAgents = useMemo(() => {
    return isAllTab ? agents.slice(0, SECTION_PREVIEW_LIMIT) : agents
  }, [SECTION_PREVIEW_LIMIT, agents, isAllTab])

  const hasMoreAgentsThanPreview = useMemo(() => {
    const total = typeof agentsPagination?.total === 'number' ? agentsPagination.total : agents.length
    return total > SECTION_PREVIEW_LIMIT
  }, [SECTION_PREVIEW_LIMIT, agents.length, agentsPagination?.total])

  const agentAvatarAttachmentIds = useMemo(() => {
    const ids = (agents || []).map(a => String(a?.avatarAttachmentId || '').trim()).filter(Boolean)
    return Array.from(new Set(ids))
  }, [agents])

  const { data: agentAvatarAttachments = [] } = useMessageAttachments(agentAvatarAttachmentIds, starshipId || undefined)

  const agentAvatarUrlById = useMemo(() => {
    const m = new Map<string, string>()
    for (const att of agentAvatarAttachments || []) {
      const id = String(att?.id || '').trim()
      const url = String(att?.previewUrl || '').trim()
      if (id && url) m.set(id, url)
    }
    return m
  }, [agentAvatarAttachments])

  // Automations (starship tools, starship-scoped)
  type ToolsPage = { tools: ToolModel[]; pagination: PaginationMeta | null }
  const toolsQuery = useInfiniteQuery({
    queryKey: ['starship-automations', starshipId, 'paged', { limit: QUERY_PAGE_SIZE, search: debouncedQuery || null, order: 'DESC' }] as const,
    enabled: Boolean(starshipId),
    initialPageParam: 1,
    queryFn: async ({ pageParam }): Promise<ToolsPage> => {
      const page = typeof pageParam === 'number' ? pageParam : Number(pageParam)
      const response: FetchResponse<ApiResponse<ToolModel[]>> = await api.get(`/api/v1/starships/${starshipId}/tools`, {
        params: {
          page,
          limit: QUERY_PAGE_SIZE,
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

  const visibleAutomations = useMemo(() => {
    return isAllTab ? tools.slice(0, SECTION_PREVIEW_LIMIT) : tools
  }, [SECTION_PREVIEW_LIMIT, isAllTab, tools])

  const toolLeftIconById = useMemo(() => {
    const m = new Map<string, { name: string; title: string }>()
    for (const t of tools || []) {
      const id = String(t?.id || '').trim()
      if (!id) continue
      const label = String(t?.name || '').trim() || String(t?.slug || '').trim() || 'Tool'
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

  const isSearchActive = debouncedQuery.trim().length > 0

  // Fetch connector catalog total for the Connectors tab badge (and counts),
  // even when the connectors panel isn't mounted (e.g. hard reload on Agents tab).
  const connectorCatalogTotalQuery = useInfiniteConnectorCatalog({
    q: debouncedQuery,
    limit: 1,
    enabled: canManageConnectors,
  })
  const connectorCatalogTotal = useMemo<number | null>(() => {
    const pages = connectorCatalogTotalQuery.data?.pages ?? []
    for (let i = pages.length - 1; i >= 0; i--) {
      const t = pages[i]?.pagination?.total
      const n = typeof t === 'number' ? t : Number(t)
      if (Number.isFinite(n)) return n
    }
    return null
  }, [connectorCatalogTotalQuery.data])

  const connectorCatalogTotalVisible = useMemo<number | null>(() => {
    return excludeInternalStarshipsConnectorFromTotal(connectorCatalogTotal)
  }, [connectorCatalogTotal])

  const agentsTotalForBadges = useMemo<number | null>(() => {
    if (typeof agentsPagination?.total === 'number') return agentsPagination.total
    if (!agentsQuery.isLoading) return agents.length
    return null
  }, [agents.length, agentsPagination?.total, agentsQuery.isLoading])

  const automationsTotalForBadges = useMemo<number | null>(() => {
    if (typeof toolsPagination?.total === 'number') return toolsPagination.total
    if (!toolsQuery.isLoading) return tools.length
    return null
  }, [tools.length, toolsPagination?.total, toolsQuery.isLoading])

  const connectorsTotalForBadges = useMemo<number | null>(() => {
    if (!canManageConnectors) return 0
    if (typeof connectorCatalogTotalVisible === 'number') return connectorCatalogTotalVisible
    if (typeof catalogTotal === 'number') return catalogTotal
    if (typeof totalConnectors === 'number') return totalConnectors
    return null
  }, [canManageConnectors, catalogTotal, connectorCatalogTotalVisible, totalConnectors])

  const allTabTotalForBadges = useMemo<number | null>(() => {
    if (typeof agentsTotalForBadges !== 'number') return null
    if (typeof automationsTotalForBadges !== 'number') return null
    if (!canManageConnectors) return agentsTotalForBadges + automationsTotalForBadges
    if (typeof connectorsTotalForBadges !== 'number') return null
    return agentsTotalForBadges + automationsTotalForBadges + connectorsTotalForBadges
  }, [agentsTotalForBadges, automationsTotalForBadges, canManageConnectors, connectorsTotalForBadges])

  // IMPORTANT: During search on the All tab, we hide empty sections.
  // For connectors, the "emptiness" signal (catalog total) is emitted by `StarshipConnectorsPanel`.
  // If we hide the section based on a stale 0 from a previous query, the panel never mounts,
  // so it can never fetch and update totals => deadlock.
  // Reset totals on All-tab query changes so "unknown" stays visible until the latest fetch resolves.
  // Do NOT reset merely when switching tabs (would make the connector count badge flash/disappear).
  const lastAllTabQueryRef = useRef<string>(debouncedQuery)
  const lastIsAllTabRef = useRef<boolean>(isAllTab)
  useEffect(() => {
    const prevQuery = lastAllTabQueryRef.current
    const prevIsAllTab = lastIsAllTabRef.current
    lastAllTabQueryRef.current = debouncedQuery
    lastIsAllTabRef.current = isAllTab

    if (!isAllTab) return
    const isEnteringAllTab = prevIsAllTab !== isAllTab && isAllTab === true
    const queryChanged = debouncedQuery !== prevQuery
    if (isEnteringAllTab && !queryChanged) return

    setCatalogTotal(null)
    setConnectorStats(null)
  }, [debouncedQuery, isAllTab])

  const baseShowAgents = false
  const baseShowAutomations = tabFromUrl === 'automations'
  const baseShowConnectors = tabFromUrl === 'connectors' && canManageConnectors

  // In the All tab, hide empty sections during search (q present).
  // Keep sections visible while their initial query is loading to avoid UI "blink".
  const showAgents = useMemo(() => {
    if (!baseShowAgents) return false
    if (!isAllTab || !isSearchActive) return true
    return agentsQuery.isLoading || agents.length > 0
  }, [agents.length, agentsQuery.isLoading, baseShowAgents, isAllTab, isSearchActive])

  const showAutomations = useMemo(() => {
    if (!baseShowAutomations) return false
    if (!isAllTab || !isSearchActive) return true
    return toolsQuery.isLoading || tools.length > 0
  }, [baseShowAutomations, isAllTab, isSearchActive, tools.length, toolsQuery.isLoading])

  const showConnectors = useMemo(() => {
    if (!baseShowConnectors) return false
    if (!isAllTab || !isSearchActive) return true
    // Prefer server total when available; otherwise keep visible until the panel reports a total.
    if (typeof connectorCatalogTotalVisible === 'number') return connectorCatalogTotalVisible > 0
    if (typeof catalogTotal === 'number') return catalogTotal > 0
    return true
  }, [baseShowConnectors, catalogTotal, connectorCatalogTotalVisible, isAllTab, isSearchActive])

  const q = debouncedQuery.trim()
  const isInitialAgentsLoading = !q && Boolean(agentsQuery.isLoading)
  const isSearchingAgents = Boolean(q && (agentsQuery.isLoading || (agentsQuery.isFetching && !agentsQuery.isFetchingNextPage)))
  const isInitialAutomationsLoading = !q && Boolean(toolsQuery.isLoading)
  const isSearchingAutomations = Boolean(q && (toolsQuery.isLoading || (toolsQuery.isFetching && !toolsQuery.isFetchingNextPage)))

  const mobileFilterOptions = useMemo(() => {
    const withCount = (label: string, n: number | null) => (typeof n === 'number' ? `${label} (${n})` : label)
    const opts: { value: IntegrationsTab; label: string }[] = []
    if (canManageConnectors) {
      opts.push({ value: 'connectors', label: withCount('Connectors', connectorsTotalForBadges) })
    }
    opts.push({ value: 'automations', label: withCount('Automations', automationsTotalForBadges) })
    return opts
  }, [automationsTotalForBadges, canManageConnectors, connectorsTotalForBadges])

  const renderRowSkeleton = useCallback((key: string) => {
    return (
      <div key={key} className={cn('rounded-lg border border-border/60 bg-card px-4 py-3 flex items-start justify-between gap-3')}>
        <div className={cn('min-w-0 flex-1')}>
          <div className="flex items-start gap-3">
            <div className="relative mt-0.5 h-10 w-10 flex-shrink-0">
              <span className={cn('flex h-10 w-10 items-center justify-center rounded-full ring-1 ring-border/50 bg-muted/10 overflow-hidden')}>
                <Skeleton className="h-[22px] w-[22px] rounded-md" />
              </span>
              <span className="absolute bottom-0 right-0 translate-x-[22%] translate-y-[6%] z-50 pointer-events-none">
                <Skeleton className="h-2 w-2 rounded-full ring-2 ring-background outline outline-1 outline-border" />
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <Skeleton className="h-4 w-40 max-w-[70%]" />
                <Skeleton className="h-4 w-14 rounded-md" />
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                <Skeleton className="h-3 w-64 max-w-full" />
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1 self-center">
          <Skeleton className="h-8 min-w-[130px] rounded-2xl" />
        </div>
      </div>
    )
  }, [])

  const renderCenteredState = useCallback((message: string) => {
    return (
      <div className="flex items-center justify-center py-10">
        <p className="text-sm text-muted-foreground text-center">{message}</p>
      </div>
    )
  }, [])

  const renderAgentsList = () => {
    // Match Members page behavior:
    // - show skeletons for initial load (empty search)
    // - show a centered "Searching…" message while search is running
    if (isInitialAgentsLoading) {
      return <div className="space-y-2">{Array.from({ length: 3 }, (_, i) => renderRowSkeleton(`agent-skel-${i}`))}</div>
    }
    if (isSearchingAgents) {
      return renderCenteredState(`Searching “${q}”…`)
    }
    if (!Array.isArray(visibleAgents) || visibleAgents.length === 0) {
      return (
        <div className="flex items-center justify-center py-10">
          <p className="text-sm text-muted-foreground text-center">{debouncedQuery ? `No agents match “${debouncedQuery}”.` : 'No agents in this starship yet.'}</p>
        </div>
      )
    }

    return (
      <div className="space-y-2">
        {visibleAgents.map((a: AgentModel) => {
          const agentSlug = String(a?.slug || '')
          const avatarAttachmentId = String(a?.avatarAttachmentId || '').trim()
          const avatarUrl = avatarAttachmentId ? agentAvatarUrlById.get(avatarAttachmentId) : undefined
          const avatarSeed = formatAgentDisplayName(a) || String(a?.name || '').trim() || agentSlug || 'Agent'
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
                      {a?.description ? <span className="truncate">{String(a.description)}</span> : null}
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
            <Button size="sm" variant="outline" onClick={() => agentsQuery.fetchNextPage()} disabled={agentsQuery.isFetchingNextPage} className={INTEGRATION_OUTLINE_BUTTON_CLASS}>
              {agentsQuery.isFetchingNextPage ? 'Loading…' : 'Load more agents'}
            </Button>
          </div>
        ) : null}
      </div>
    )
  }

  const renderAutomationsList = () => {
    if (isInitialAutomationsLoading) {
      return <div className="space-y-2">{Array.from({ length: 3 }, (_, i) => renderRowSkeleton(`automation-skel-${i}`))}</div>
    }
    if (isSearchingAutomations) {
      return renderCenteredState(`Searching “${q}”…`)
    }
    if (!Array.isArray(visibleAutomations) || visibleAutomations.length === 0) {
      return (
        <div className="flex items-center justify-center py-10">
          <p className="text-sm text-muted-foreground text-center">{debouncedQuery ? `No automations match “${debouncedQuery}”.` : 'No automations installed in this starship yet.'}</p>
        </div>
      )
    }

    return (
      <div className="space-y-2">
        {visibleAutomations.map((t: ToolModel) => {
          const toolSlug = String(t?.slug || '')
          const toolLeftIcon = toolLeftIconById.get(String(t?.id || '').trim()) ?? pickToolLeftIcon(String(t?.name || '').trim() || 'Tool')
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
                      {t?.description ? <span className="truncate">{String(t.description)}</span> : null}
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
            <Button size="sm" variant="outline" onClick={() => toolsQuery.fetchNextPage()} disabled={toolsQuery.isFetchingNextPage} className={INTEGRATION_OUTLINE_BUTTON_CLASS}>
              {toolsQuery.isFetchingNextPage ? 'Loading…' : 'Load more automations'}
            </Button>
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <div className="relative flex flex-col min-h-full min-w-0">
      <div className="sticky top-0 z-10 border-b border-border/60 bg-card">
        <div className="px-4 pt-3.5 pb-2 md:py-2">
          <div className="w-full">
            <div className="flex items-center justify-between gap-4">
              <div className="flex-1 min-w-0 flex flex-col justify-center gap-1">
                <div className="flex min-w-0 w-full gap-2 items-center">
                  <span className="flex-shrink-0 self-center md:hidden">
                    <MobileNavToggleButton className="mx-2" />
                  </span>
                  <div className="min-w-0 flex-1 flex flex-col justify-center gap-1">
                    <div className="flex items-baseline gap-2 min-w-0 w-full">
                      <span aria-hidden="true" className="flex-shrink-0 self-center text-foreground leading-none">
                        <Icon name="plug" weight="bold" className="h-4 w-4" />
                      </span>
                      <h3 className="flex-1 text-base font-medium text-foreground truncate leading-tight min-w-0">Connect Apps</h3>
                    </div>

                    <div className="min-w-0 text-xs leading-snug text-muted-foreground min-h-6">
                      <span
                        className="block min-w-0 truncate font-medium leading-snug text-muted-foreground"
                        title="Connect and manage apps and automations for this starship."
                      >
                        Connect and manage apps and automations for this starship.
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-visible md:overflow-y-auto px-4 pt-6 pb-8 md:pb-8">
        <div className={cn('w-full bg-transparent max-w-4xl mx-auto min-h-full flex flex-col')}>
          <div className="pt-4 pb-8 hidden md:block">
            <Tabs value={tabFromUrl} onValueChange={value => setTab(toIntegrationsTab(value))}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex justify-start">
                  <TabsList className="w-full sm:w-auto flex-nowrap justify-center sm:justify-start gap-1 overflow-x-auto overflow-y-hidden custom-scrollbar">
                    {canManageConnectors ? (
                      <TabsTrigger value="connectors" className="flex-1 sm:flex-none min-w-0 justify-center">
                        <span className="inline-flex items-center gap-1.5">
                          <span>Connectors</span>
                          {typeof connectorCatalogTotalVisible === 'number' ? (
                            <Badge variant={tabFromUrl === 'connectors' ? 'default' : 'secondary'} className="h-4 px-1.5 py-0 text-[10px] font-medium leading-none tabular-nums">
                              {connectorCatalogTotalVisible}
                            </Badge>
                          ) : typeof catalogTotal === 'number' ? (
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
                    <TabsTrigger value="automations" className="flex-1 sm:flex-none min-w-0 justify-center">
                      <span className="inline-flex items-center gap-1.5">
                        <span>Automations</span>
                        {typeof toolsPagination?.total === 'number' ? (
                          <Badge variant={tabFromUrl === 'automations' ? 'default' : 'secondary'} className="h-4 px-1.5 py-0 text-[10px] font-medium leading-none tabular-nums">
                            {toolsPagination.total}
                          </Badge>
                        ) : null}
                      </span>
                    </TabsTrigger>
                  </TabsList>
                </div>

                <div className="w-full sm:w-64">
                  <div className="relative">
                    <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4 z-10 pointer-events-none" />
                    <Input
                      value={searchValue}
                      onChange={e => setSearchValue(e.target.value)}
                      placeholder="Search installed"
                      className="pl-9 h-9 py-1.5 text-[13px] rounded-2xl border-border/60 bg-card shadow-sm"
                      aria-label="Search installed"
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
                      {typeof agentsPagination?.total === 'number' ? <span className="text-xs text-muted-foreground tabular-nums">({agentsPagination.total})</span> : null}
                    </div>
                    <Button asChild size="sm" variant="ghost" className="h-8 text-primary hover:text-primary">
                      <Link href="/explore">
                        <Icon name="store" iconOverride={{ type: 'phosphor', component: 'Storefront' }} className="h-4 w-4 mr-1.5" />
                        Explore agents
                      </Link>
                    </Button>
                  </div>
                  {renderAgentsList()}
                  {isAllTab && !isSearchActive ? (
                    <div className="flex justify-center pt-4">
                      {hasMoreAgentsThanPreview ? (
                        <Button asChild size="sm" variant="outline" className={INTEGRATION_OUTLINE_BUTTON_CLASS}>
                          <Link href={buildInstalledTabHref('agents')}>Show all agents</Link>
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                </section>
              ) : null}

              {showAutomations ? (
                <section>
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="min-w-0 flex items-baseline gap-3">
                      <h3 className="text-lg font-semibold leading-tight text-foreground">Automations</h3>
                      {typeof toolsPagination?.total === 'number' ? <span className="text-xs text-muted-foreground tabular-nums">({toolsPagination.total})</span> : null}
                    </div>
                    <Button asChild size="sm" variant="ghost" className="h-8 text-primary hover:text-primary">
                      <Link href="/explore/automations">
                        <Icon name="store" iconOverride={{ type: 'phosphor', component: 'Storefront' }} className="h-4 w-4 mr-1.5" />
                        Explore automations
                      </Link>
                    </Button>
                  </div>
                  {renderAutomationsList()}
                  {isAllTab && !isSearchActive ? (
                    <div className="flex justify-center pt-4">
                      <Button asChild size="sm" variant="outline" className={INTEGRATION_OUTLINE_BUTTON_CLASS}>
                        <Link href={buildInstalledTabHref('automations')}>Show all automations</Link>
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
                      {typeof connectorCatalogTotalVisible === 'number' ? (
                        <span className="text-xs text-muted-foreground tabular-nums">({connectorCatalogTotalVisible})</span>
                      ) : typeof catalogTotal === 'number' ? (
                        <span className="text-xs text-muted-foreground tabular-nums">({catalogTotal})</span>
                      ) : typeof totalConnectors === 'number' ? (
                        <span className="text-xs text-muted-foreground tabular-nums">({totalConnectors})</span>
                      ) : null}
                    </div>
                    <Button asChild size="sm" variant="ghost" className="h-8 text-primary hover:text-primary">
                      <Link href="/explore">
                        <Icon name="store" iconOverride={{ type: 'phosphor', component: 'Storefront' }} className="h-4 w-4 mr-1.5" />
                        Explore connectors
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
                  {isAllTab && !isSearchActive ? (
                    <div className="flex justify-center pt-4">
                      <Button asChild size="sm" variant="outline" className={INTEGRATION_OUTLINE_BUTTON_CLASS}>
                        <Link href={buildInstalledTabHref('connectors')}>Show all connectors</Link>
                      </Button>
                    </div>
                  ) : null}
                </section>
              ) : null}
            </div>
          )}
        </div>
      </div>

      <MobileBottomFilterBar
        filterValue={tabFromUrl}
        onFilterChange={v => setTab(toIntegrationsTab(v))}
        filterOptions={mobileFilterOptions}
        filterPlaceholder="Filter"
        searchValue={searchValue}
        onSearchChange={setSearchValue}
        searchPlaceholder="Search installed"
      />
    </div>
  )
}
