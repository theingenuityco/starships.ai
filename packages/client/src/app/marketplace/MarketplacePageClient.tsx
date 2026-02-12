'use client'

import Icon from '@/components/primitives/Icon'

import { AgentTemplateCard } from '@/components/marketplace/AgentTemplateCard'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ToolTemplateCard } from '@/components/marketplace/ToolTemplateCard'
import { useAgentTemplates, useToolTemplates } from '@/hooks/useTemplates'
import { useConnectorCatalog, useStarshipConnectors } from '@/hooks/useConnectors'
import { useExploreSearch } from '@/hooks/useExploreSearch'
import PublicHeader from '@/components/navigation/PublicHeader'
import { ConnectorLogo } from '@/components/marketplace/ConnectorLogo'

import { motion } from 'motion/react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import type { AgentTemplateModel, ConnectorCatalogItem, ToolTemplateModel } from '@starships/protocol'
import { track } from '@/lib/analytics'
import { PublicFooter } from '@/app/components/PublicFooter'
import ExploreCTA from '@/app/components/ExploreCTA'
import { useAuth } from '@/hooks/useAuth'
import { useStarshipsForDeploySelection } from '@/hooks/useStarships'

const MARKETPLACE_TABS = ['all', 'agents', 'tools', 'connectors'] as const
type MarketplaceTab = (typeof MARKETPLACE_TABS)[number]

const MAX_LISTING_RESULTS = 9

function isMarketplaceTab(value: string): value is MarketplaceTab {
  return (MARKETPLACE_TABS as readonly string[]).includes(value)
}

const TAB_TO_ROUTE: Record<MarketplaceTab, string> = {
  all: '/explore',
  agents: '/explore/agents',
  tools: '/explore/automations',
  connectors: '/explore/connectors',
}

function titleCase(input: string): string {
  const s = String(input || '').trim()
  if (!s) return ''
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export default function MarketplacePageClient(props: {
  initialAgentTemplates?: AgentTemplateModel[]
  initialToolTemplates?: ToolTemplateModel[]
  initialConnectorCatalog?: ConnectorCatalogItem[]
  activeTab?: MarketplaceTab
  initialTotals?: { agents: number; tools: number; connectors: number }
  pagination?: { page: number; limit: number; total: number; has_next: boolean; has_prev: boolean }
}) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  // Authenticated users: show connector connection state on listing cards.
  const { userId, isAuthenticated } = useAuth()
  const { primaryStarship } = useStarshipsForDeploySelection(userId || '', { enabled: !!userId })
  const starshipId = String((primaryStarship as any)?.id || '')
  const { data: starshipConnectors = [] } = useStarshipConnectors(starshipId, Boolean(isAuthenticated && starshipId))
  const connectedProviderSet = useMemo(() => {
    return new Set(
      (starshipConnectors ?? [])
        .filter(c => String((c as any)?.status || '').trim() === 'connected')
        .map(c => String((c as any)?.provider || '').trim())
        .filter(Boolean)
    )
  }, [starshipConnectors])

  const tab: MarketplaceTab = isMarketplaceTab(
    String(props.activeTab || '')
      .trim()
      .toLowerCase()
  )
    ? (String(props.activeTab).trim().toLowerCase() as MarketplaceTab)
    : 'all'

  const [searchText, setSearchText] = useState<string>('')
  const [debouncedSearch, setDebouncedSearch] = useState<string>('')

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setDebouncedSearch(searchText.trim())
    }, 250)
    return () => window.clearTimeout(handle)
  }, [searchText])

  const initialAgentTemplates = props.initialAgentTemplates ?? []
  const initialToolTemplates = props.initialToolTemplates ?? []
  const initialConnectorCatalog = props.initialConnectorCatalog ?? []
  const initialTotals = props.initialTotals

  const useServerInitialAgents = initialAgentTemplates.length > 0
  const useServerInitialTools = initialToolTemplates.length > 0
  const useServerInitialConnectors = initialConnectorCatalog.length > 0

  const shouldNeedAgents = tab === 'all' || tab === 'agents'
  const shouldNeedTools = tab === 'all' || tab === 'tools'
  const shouldNeedConnectors = tab === 'all' || tab === 'connectors'

  const { data: agentData, isLoading: agentLoadingRaw } = useAgentTemplates(undefined, !useServerInitialAgents && shouldNeedAgents)
  const { data: toolData, isLoading: toolLoadingRaw } = useToolTemplates(undefined, !useServerInitialTools && shouldNeedTools)
  const { data: connectorData, isLoading: connectorLoadingRaw } = useConnectorCatalog({ enabled: !useServerInitialConnectors && shouldNeedConnectors })

  // IMPORTANT (hydration stability):
  // If the page shipped server-provided initial templates/catalog, keep using them on hydration.
  const agentTemplates = (useServerInitialAgents ? initialAgentTemplates : (agentData ?? [])) as AgentTemplateModel[]
  const toolTemplates = (useServerInitialTools ? initialToolTemplates : (toolData ?? [])) as ToolTemplateModel[]
  const connectorCatalog = (useServerInitialConnectors ? initialConnectorCatalog : (connectorData ?? [])) as ConnectorCatalogItem[]

  const agentTemplatesLoading = agentLoadingRaw && !useServerInitialAgents
  const toolTemplatesLoading = toolLoadingRaw && !useServerInitialTools
  const connectorsLoading = connectorLoadingRaw && !useServerInitialConnectors

  const agentFromUrl = useMemo(() => searchParams?.get('agent') ?? null, [searchParams])

  const q = debouncedSearch.trim()
  const shouldUseServerSearch = q.length > 0
  const serverSearch = useExploreSearch({ q: debouncedSearch, type: tab, limit: 18, enabled: shouldUseServerSearch })
  const isSearching = shouldUseServerSearch && (serverSearch.isFetching || serverSearch.isLoading)

  const agentsMatchingSearch = useMemo(() => {
    if (!shouldUseServerSearch) return agentTemplates
    return serverSearch.data?.agents ?? []
  }, [agentTemplates, serverSearch.data?.agents, shouldUseServerSearch])

  const toolsMatchingSearch = useMemo(() => {
    if (!shouldUseServerSearch) return toolTemplates
    return serverSearch.data?.tools ?? []
  }, [toolTemplates, serverSearch.data?.tools, shouldUseServerSearch])

  const connectorsMatchingSearch = useMemo(() => {
    if (!shouldUseServerSearch) return connectorCatalog
    return serverSearch.data?.connectors ?? []
  }, [connectorCatalog, serverSearch.data?.connectors, shouldUseServerSearch])

  const agentsVisible = useMemo(() => {
    if (shouldUseServerSearch) return agentsMatchingSearch
    // Only cap results on the "All" tab sections.
    return tab === 'all' ? agentsMatchingSearch.slice(0, MAX_LISTING_RESULTS) : agentsMatchingSearch
  }, [agentsMatchingSearch, shouldUseServerSearch, tab])

  const toolsVisible = useMemo(() => {
    if (shouldUseServerSearch) return toolsMatchingSearch
    // Only cap results on the "All" tab sections.
    return tab === 'all' ? toolsMatchingSearch.slice(0, MAX_LISTING_RESULTS) : toolsMatchingSearch
  }, [toolsMatchingSearch, shouldUseServerSearch, tab])

  const connectorsVisible = useMemo(() => {
    if (shouldUseServerSearch) return connectorsMatchingSearch
    // Only cap results on the "All" tab sections.
    return tab === 'all' ? connectorsMatchingSearch.slice(0, MAX_LISTING_RESULTS) : connectorsMatchingSearch
  }, [connectorsMatchingSearch, shouldUseServerSearch, tab])

  const countsByTab = useMemo(() => {
    // Counts should reflect total available in each tab; the 9-item cap only affects the "All" tab display sections.
    const agents = shouldUseServerSearch ? (serverSearch.data?.totals?.agents ?? agentsMatchingSearch.length) : (initialTotals?.agents ?? agentsMatchingSearch.length)
    const tools = shouldUseServerSearch ? (serverSearch.data?.totals?.tools ?? toolsMatchingSearch.length) : (initialTotals?.tools ?? toolsMatchingSearch.length)
    const connectors = shouldUseServerSearch ? (serverSearch.data?.totals?.connectors ?? connectorsMatchingSearch.length) : (initialTotals?.connectors ?? connectorsMatchingSearch.length)
    return {
      all: agents + tools + connectors,
      agents,
      tools,
      connectors,
    } satisfies Record<MarketplaceTab, number>
  }, [
    agentsMatchingSearch.length,
    toolsMatchingSearch.length,
    connectorsMatchingSearch.length,
    initialTotals?.agents,
    initialTotals?.tools,
    initialTotals?.connectors,
    serverSearch.data?.totals?.agents,
    serverSearch.data?.totals?.tools,
    serverSearch.data?.totals?.connectors,
    shouldUseServerSearch,
  ])

  const pagination = props.pagination
  const hasPagination = !shouldUseServerSearch && tab !== 'all' && !!pagination && (pagination.has_next || pagination.has_prev)

  function routeForPage(t: MarketplaceTab, page: number): string {
    const base = TAB_TO_ROUTE[t]
    const p = Math.max(1, Math.floor(page))
    if (p <= 1) return base
    return `${base}/page/${p}`
  }

  const renderPaginationNav = () => {
    if (!hasPagination || !pagination) return null
    const prevHref = pagination.has_prev ? routeForPage(tab, pagination.page - 1) : null
    const nextHref = pagination.has_next ? routeForPage(tab, pagination.page + 1) : null
    const totalPages = Math.max(1, Math.ceil(pagination.total / pagination.limit))
    const start = pagination.total > 0 ? (pagination.page - 1) * pagination.limit + 1 : 0
    const end = pagination.total > 0 ? Math.min(pagination.total, pagination.page * pagination.limit) : 0

    const buildPageItems = (current: number, total: number): Array<number | 'ellipsis'> => {
      if (total <= 1) return [1]
      if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)

      const pages = new Set<number>()
      pages.add(1)
      pages.add(total)

      // Expand the window near the edges to avoid awkward ellipses.
      if (current <= 3) {
        pages.add(2)
        pages.add(3)
        pages.add(4)
      } else if (current >= total - 2) {
        pages.add(total - 1)
        pages.add(total - 2)
        pages.add(total - 3)
      } else {
        pages.add(current - 1)
        pages.add(current)
        pages.add(current + 1)
      }

      const sorted = Array.from(pages)
        .filter(p => p >= 1 && p <= total)
        .sort((a, b) => a - b)

      const items: Array<number | 'ellipsis'> = []
      let prev = 0
      for (const p of sorted) {
        if (prev && p - prev > 1) items.push('ellipsis')
        items.push(p)
        prev = p
      }
      return items
    }

    const pageItems = buildPageItems(pagination.page, totalPages)
    return (
      <nav aria-label="Explore pagination" className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-muted-foreground tabular-nums">
          {pagination.total > 0 ? (
            <>
              Showing {start}–{end} of {pagination.total}
            </>
          ) : (
            <>No results</>
          )}
        </div>

        <div className="flex items-center justify-center gap-1.5 flex-wrap">
          {prevHref ? (
            <Button asChild variant="outline" size="sm">
              <Link href={prevHref} aria-label="Previous page">
                <Icon name="chevron-left" className="h-4 w-4" />
                <span className="hidden sm:inline">Prev</span>
              </Link>
            </Button>
          ) : (
            <Button variant="outline" size="sm" disabled aria-label="Previous page">
              <Icon name="chevron-left" className="h-4 w-4" />
              <span className="hidden sm:inline">Prev</span>
            </Button>
          )}

          {pageItems.map((item, idx) => {
            if (item === 'ellipsis') {
              return (
                <span key={`ellipsis-${idx}`} className="px-2 text-sm text-muted-foreground select-none" aria-hidden>
                  …
                </span>
              )
            }

            const p = item
            const isCurrent = p === pagination.page
            const href = routeForPage(tab, p)

            if (isCurrent) {
              return (
                <Button key={p} asChild variant="primaryOutline" size="sm">
                  <span aria-current="page" className="tabular-nums">
                    {p}
                  </span>
                </Button>
              )
            }

            return (
              <Button key={p} asChild variant="outline" size="sm">
                <Link href={href} aria-label={`Go to page ${p}`} className="tabular-nums">
                  {p}
                </Link>
              </Button>
            )
          })}

          {nextHref ? (
            <Button asChild variant="outline" size="sm">
              <Link href={nextHref} aria-label="Next page">
                <span className="hidden sm:inline">Next</span>
                <Icon name="chevron-right" className="h-4 w-4" />
              </Link>
            </Button>
          ) : (
            <Button variant="outline" size="sm" disabled aria-label="Next page">
              <span className="hidden sm:inline">Next</span>
              <Icon name="chevron-right" className="h-4 w-4" />
            </Button>
          )}
        </div>
      </nav>
    )
  }

  const activeCount = countsByTab[tab]
  // Initial list loading (no query). Search loading is handled separately (Members-style).
  const isAllLoading = agentTemplatesLoading || toolTemplatesLoading || connectorsLoading
  const activeLoading = shouldUseServerSearch ? false : tab === 'all' ? isAllLoading : tab === 'agents' ? agentTemplatesLoading : tab === 'tools' ? toolTemplatesLoading : connectorsLoading

  const renderCenteredState = (message: string) => {
    return (
      <div className="flex items-center justify-center py-10">
        <p className="text-sm text-muted-foreground text-center">{message}</p>
      </div>
    )
  }

  // Handle template deployment/installation
  const handleAgentDeploy = (_template: AgentTemplateModel) => {
    // Handle successful deployment - could show a success message or redirect
  }

  const handleAgentClick = (template: AgentTemplateModel) => {
    track({
      type: 'marketplace_agent_template_opened',
      templateId: template.id,
      templateName: template.name,
      category: template.category,
    })
    router.push(`/explore/agents/${encodeURIComponent(template.slug)}`)
  }

  // Back-compat: old links used `?agent=<id|slug>` to open a modal.
  // Redirect them to the dedicated agent page.
  useEffect(() => {
    if (tab !== 'agents') return
    if (!agentFromUrl) return
    if (agentTemplatesLoading) return
    if (!Array.isArray(agentTemplates) || agentTemplates.length === 0) return

    const found = agentTemplates.find(t => t.slug === agentFromUrl) ?? agentTemplates.find(t => t.id === agentFromUrl) ?? null
    if (!found) return

    // Preserve other query params (e.g. category) by leaving the listing URL alone in history
    // and pushing the canonical details route.
    router.replace(`/explore/agents/${encodeURIComponent(found.slug)}`)
  }, [agentFromUrl, agentTemplates, agentTemplatesLoading, router])

  const hero = useMemo(() => {
    const t = tab === 'all' ? 'Explore' : tab === 'agents' ? 'Explore agents' : tab === 'tools' ? 'Explore automations' : 'Explore connectors'
    const subtitle = 'Search and install agents, automations, and connectors.'
    return { title: t, subtitle }
  }, [tab])

  const renderConnectorCard = useCallback(
    (c: ConnectorCatalogItem, idx: number) => {
      const provider = String((c as any)?.provider || '').trim()
      const name = String((c as any)?.name || '').trim() || titleCase(provider) || 'Connector'
      const description = String((c as any)?.description || '').trim()
      const isConnected = !!provider && connectedProviderSet.has(provider)

      return (
        <motion.div key={provider || `${name}-${idx}`} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.04 }}>
          <div className="group relative overflow-hidden h-full flex flex-col rounded-lg border border-border/60 bg-card backdrop-blur-sm shadow-sm transition-all duration-200 hover:shadow-md">
            <div className="flex">
              {/* Left logo strip (edge-to-edge) */}
              <div className="relative w-20 shrink-0 overflow-hidden bg-transparent">
                <div className="absolute inset-0 flex items-center justify-center">
                  {provider ? (
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white border border-border/40 overflow-hidden" title={provider || name}>
                      <ConnectorLogo provider={provider} className="h-6 w-6 object-contain" />
                    </div>
                  ) : (
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white border border-border/40 text-muted-foreground" title="Flow">
                      <Icon name="workflow" className="h-4.5 w-4.5" />
                    </div>
                  )}
                </div>
              </div>

              {/* Right content */}
              <div className="min-w-0 flex-1 flex flex-col py-4 pr-4 pl-0">
                <div className="min-w-0">
                  <div className="text-base font-semibold leading-tight truncate">{name}</div>
                </div>
                {description ? <div className="mt-2 text-xs text-muted-foreground leading-relaxed line-clamp-2">{description}</div> : null}

                <div className="mt-auto pt-3 flex items-center justify-end">
                  {isConnected ? (
                    <Button variant="ghost" size="sm" disabled className="h-7 px-2 shrink-0 text-emerald-700 dark:text-emerald-300 text-xs opacity-100">
                      <Icon name="check-circle" className="h-3.5 w-3.5 mr-1 text-emerald-600 dark:text-emerald-400" />
                      Connected
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={!provider}
                      onClick={e => {
                        e.preventDefault()
                        e.stopPropagation()
                        if (!provider) return
                        router.push(`/connectors/${encodeURIComponent(provider)}/install`)
                      }}
                      className="h-7 px-2 shrink-0 text-primary hover:text-primary text-xs"
                    >
                      Connect
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      )
    },
    [connectedProviderSet, router]
  )

  return (
    <>
      {/* Pseudo hero background (full-width, starts at very top edge) */}
      <div
        className="pointer-events-none fixed inset-x-0 top-0 z-0 h-[620px] overflow-hidden"
        aria-hidden
        style={{
          backgroundImage: [
            'radial-gradient(900px 360px at 50% 0%, rgba(124,58,237,0.22), transparent 60%)',
            'radial-gradient(700px 300px at 15% 30%, rgba(59,130,246,0.14), transparent 62%)',
            'radial-gradient(720px 320px at 85% 22%, rgba(245,158,11,0.14), transparent 62%)',
          ].join(', '),
        }}
      />

      <div className="relative z-10">
        <PublicHeader />

        <main className="marketplace-main pb-12 sm:pb-16">
          <div className="relative">
            <div className="max-w-6xl mx-auto px-4 sm:px-6">
              {/* Hero (transparent, normal container width) */}
              <div className="pt-10 sm:pt-12 pb-6">
                <div className="flex flex-col items-center text-center">
                  <h1 className="mt-4 text-3xl sm:text-5xl font-semibold tracking-tight leading-[1.05]">{hero.title}</h1>
                  <p className="mt-3 text-sm sm:text-base text-muted-foreground max-w-2xl">{hero.subtitle}</p>

                  <div className="mt-6 max-w-2xl mx-auto w-full">
                    <div
                      className={
                        // Match ConversationMessageInput "minimal/compact" composer styling:
                        // bg + border + shadow + focus border. Keep rounded edges on all breakpoints.
                        'relative transition-all overflow-visible bg-card shadow-sm border border-border/80 rounded-full focus-within:border-primary/70'
                      }
                    >
                      <div className="flex items-center gap-2 pl-3 pr-2 py-2.5">
                        <span className="flex flex-shrink-0 items-center justify-center p-1.5 rounded-lg text-muted-foreground">
                          <Icon name="search" className="h-5 w-5" />
                        </span>
                        <Input
                          value={searchText}
                          onChange={e => setSearchText(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              const q = searchText.trim()
                              if (q) track({ type: 'marketplace_search_used', query: q })
                            }
                          }}
                          placeholder="Search agents, tools, and connectors"
                          aria-label="Search Explore"
                          className="h-auto border-0 bg-transparent shadow-none p-0 text-[14px] focus-visible:ring-0 focus-visible:ring-offset-0"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="pb-2">
                <nav aria-label="Explore categories" className="flex justify-center">
                  <div className="w-full sm:w-auto overflow-x-auto custom-scrollbar">
                    <div className="inline-flex items-center justify-center gap-5 whitespace-nowrap px-1">
                      {MARKETPLACE_TABS.map(t => {
                        const label = t === 'all' ? 'All' : t === 'agents' ? 'Agents' : t === 'tools' ? 'Automations' : 'Connectors'
                        const isActive = tab === t
                        const isLoading = t === 'all' ? isAllLoading : t === 'agents' ? agentTemplatesLoading : t === 'tools' ? toolTemplatesLoading : connectorsLoading
                        return (
                          <button
                            key={t}
                            type="button"
                            onClick={() => {
                              track({ type: 'marketplace_tab_selected', tab: t })
                              router.push(TAB_TO_ROUTE[t])
                            }}
                            className={['inline-flex items-center gap-2 text-sm font-medium transition-colors', isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'].join(' ')}
                          >
                            <span className={['inline-flex items-baseline gap-2 pb-1 border-b-2', isActive ? 'border-primary' : 'border-transparent'].join(' ')}>
                              <span>{label}</span>
                              {!isLoading ? <span className={['tabular-nums', isActive ? 'text-foreground/80' : 'text-muted-foreground'].join(' ')}>({countsByTab[t]})</span> : null}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </nav>
              </div>

              {/* Results */}
              <div className="mt-8">
                {isSearching ? (
                  renderCenteredState(`Searching “${q}”…`)
                ) : activeLoading ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                    {[...Array(6)].map((_, i) => (
                      <div key={i} className="h-56 rounded-lg border border-border/60 bg-card animate-pulse" />
                    ))}
                  </div>
                ) : activeCount > 0 ? (
                  tab === 'all' ? (
                    <div className="space-y-10">
                      {agentsVisible.length > 0 ? (
                        <section>
                          <div className="mb-4 flex items-center justify-between gap-3">
                            <div className="min-w-0 flex items-center gap-3">
                              <h2 className="text-lg font-semibold leading-tight text-foreground">Popular agents</h2>
                              <Badge variant="secondary" className="tabular-nums h-5 px-1.5 py-0 text-[11px] leading-none">
                                {agentsVisible.length}
                              </Badge>
                            </div>
                            <button type="button" className="inline-flex items-center gap-1 text-sm text-primary hover:underline underline-offset-2" onClick={() => router.push(TAB_TO_ROUTE.agents)}>
                              <span>Explore all agents</span>
                              <Icon name="chevron-right" className="h-4 w-4" />
                            </button>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                            {agentsVisible.map((template: AgentTemplateModel, idx: number) => (
                              <motion.div key={template.id} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.04 }}>
                                <AgentTemplateCard template={template} density="compact" showCategory={false} showDeployCta={true} onDeploy={handleAgentDeploy} onClick={handleAgentClick} />
                              </motion.div>
                            ))}
                          </div>
                        </section>
                      ) : null}

                      {toolsVisible.length > 0 ? (
                        <section>
                          <div className="mb-4 flex items-center justify-between gap-3">
                            <div className="min-w-0 flex items-center gap-3">
                              <h2 className="text-lg font-semibold leading-tight text-foreground">Popular automations</h2>
                              <Badge variant="secondary" className="tabular-nums h-5 px-1.5 py-0 text-[11px] leading-none">
                                {toolsVisible.length}
                              </Badge>
                            </div>
                            <button type="button" className="inline-flex items-center gap-1 text-sm text-primary hover:underline underline-offset-2" onClick={() => router.push(TAB_TO_ROUTE.tools)}>
                              <span>Explore all automations</span>
                              <Icon name="chevron-right" className="h-4 w-4" />
                            </button>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                            {toolsVisible.map((template: ToolTemplateModel, idx: number) => (
                              <motion.div
                                key={(template as any)?.id ?? (template as any)?.slug ?? `${idx}`}
                                initial={{ opacity: 0, y: 14 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: idx * 0.04 }}
                              >
                                <ToolTemplateCard template={template} density="compact" showCategory={false} showInstallCta={true} />
                              </motion.div>
                            ))}
                          </div>
                        </section>
                      ) : null}

                      {connectorsVisible.length > 0 ? (
                        <section>
                          <div className="mb-4 flex items-center justify-between gap-3">
                            <div className="min-w-0 flex items-center gap-3">
                              <h2 className="text-lg font-semibold leading-tight text-foreground">Popular connectors</h2>
                              <Badge variant="secondary" className="tabular-nums h-5 px-1.5 py-0 text-[11px] leading-none">
                                {connectorsVisible.length}
                              </Badge>
                            </div>
                            <button
                              type="button"
                              className="inline-flex items-center gap-1 text-sm text-primary hover:underline underline-offset-2"
                              onClick={() => router.push(TAB_TO_ROUTE.connectors)}
                            >
                              <span>Explore all connectors</span>
                              <Icon name="chevron-right" className="h-4 w-4" />
                            </button>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">{connectorsVisible.map(renderConnectorCard)}</div>
                        </section>
                      ) : null}
                    </div>
                  ) : tab === 'agents' ? (
                    <section>
                      <div className="mb-4 flex items-center justify-between gap-3">
                        <div className="min-w-0 flex items-center gap-3">
                          <h2 className="text-lg font-semibold leading-tight text-foreground">Agents</h2>
                          <Badge variant="secondary" className="tabular-nums h-5 px-1.5 py-0 text-[11px] leading-none">
                            {activeCount}
                          </Badge>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                        {agentsVisible.map((template: AgentTemplateModel, idx: number) => (
                          <motion.div key={template.id} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.04 }}>
                            <AgentTemplateCard template={template} density="compact" showCategory={false} showDeployCta={true} onDeploy={handleAgentDeploy} onClick={handleAgentClick} />
                          </motion.div>
                        ))}
                      </div>
                      {renderPaginationNav()}
                    </section>
                  ) : tab === 'tools' ? (
                    <section>
                      <div className="mb-4 flex items-center justify-between gap-3">
                        <div className="min-w-0 flex items-center gap-3">
                          <h2 className="text-lg font-semibold leading-tight text-foreground">Automations</h2>
                          <Badge variant="secondary" className="tabular-nums h-5 px-1.5 py-0 text-[11px] leading-none">
                            {activeCount}
                          </Badge>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                        {toolsVisible.map((template: ToolTemplateModel, idx: number) => (
                          <motion.div
                            key={(template as any)?.id ?? (template as any)?.slug ?? `${idx}`}
                            initial={{ opacity: 0, y: 14 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: idx * 0.04 }}
                          >
                            <ToolTemplateCard template={template} density="compact" showCategory={false} showInstallCta={true} />
                          </motion.div>
                        ))}
                      </div>
                      {renderPaginationNav()}
                    </section>
                  ) : (
                    <section>
                      <div className="mb-4 flex items-center justify-between gap-3">
                        <div className="min-w-0 flex items-center gap-3">
                          <h2 className="text-lg font-semibold leading-tight text-foreground">Connectors</h2>
                          <Badge variant="secondary" className="tabular-nums h-5 px-1.5 py-0 text-[11px] leading-none">
                            {activeCount}
                          </Badge>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">{connectorsVisible.map(renderConnectorCard)}</div>
                      {renderPaginationNav()}
                    </section>
                  )
                ) : (
                  renderCenteredState(
                    shouldUseServerSearch
                      ? tab === 'agents'
                        ? `No agents match “${q}”.`
                        : tab === 'tools'
                          ? `No automations match “${q}”.`
                          : tab === 'connectors'
                            ? `No connectors match “${q}”.`
                            : `No results match “${q}”.`
                      : tab === 'agents'
                        ? 'No agents found.'
                        : tab === 'tools'
                          ? 'No automations found.'
                          : tab === 'connectors'
                            ? 'No connectors found.'
                            : 'No results found.'
                  )
                )}
              </div>
            </div>
          </div>
        </main>

        <ExploreCTA kind={tab === 'all' ? 'anything' : tab === 'agents' ? 'agent' : tab === 'connectors' ? 'connector' : 'automation'} />
        <div suppressHydrationWarning className="h-px w-full bg-gradient-to-r from-transparent via-border/70 to-transparent" aria-hidden />
        <PublicFooter fromPath={pathname ?? '/explore'} showTopDivider={false} />
      </div>
    </>
  )
}
