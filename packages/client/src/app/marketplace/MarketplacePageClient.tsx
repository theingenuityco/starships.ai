'use client'

import Icon from '@/components/primitives/Icon'

import { AgentTemplateCard } from '@/components/marketplace/AgentTemplateCard'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { ToolTemplateCard } from '@/components/marketplace/ToolTemplateCard'
import { useAgentTemplates, useToolTemplates } from '@/hooks/useTemplates'
import { useConnectorCatalog } from '@/hooks/useConnectors'
import PublicHeader from '@/components/navigation/PublicHeader'
import { getConnectorLogoSrc } from '@/utils/connectorLogos'

import { motion } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import type { AgentTemplateModel, ConnectorCatalogItem, ToolTemplateModel } from '@starships/protocol'
import { track } from '@/lib/analytics'

const MARKETPLACE_TABS = ['all', 'agents', 'tools', 'connectors'] as const
type MarketplaceTab = typeof MARKETPLACE_TABS[number]

function isMarketplaceTab(value: string): value is MarketplaceTab {
  return (MARKETPLACE_TABS as readonly string[]).includes(value)
}

const TAB_TO_ROUTE: Record<MarketplaceTab, string> = {
  all: '/explore/all',
  agents: '/explore/agents',
  tools: '/explore/tools',
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
}) {
  const searchParams = useSearchParams()
  const router = useRouter()

  const tab: MarketplaceTab = isMarketplaceTab(String(props.activeTab || '').trim().toLowerCase())
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

  const useServerInitialAgents = initialAgentTemplates.length > 0
  const useServerInitialTools = initialToolTemplates.length > 0
  const useServerInitialConnectors = initialConnectorCatalog.length > 0

  const { data: agentData, isLoading: agentLoadingRaw } = useAgentTemplates(undefined, !useServerInitialAgents)
  const { data: toolData, isLoading: toolLoadingRaw } = useToolTemplates(undefined, !useServerInitialTools)
  const { data: connectorData, isLoading: connectorLoadingRaw } = useConnectorCatalog({ enabled: !useServerInitialConnectors })

  // IMPORTANT (hydration stability):
  // If the page shipped server-provided initial templates/catalog, keep using them on hydration.
  const agentTemplates = (useServerInitialAgents ? initialAgentTemplates : agentData ?? []) as AgentTemplateModel[]
  const toolTemplates = (useServerInitialTools ? initialToolTemplates : toolData ?? []) as ToolTemplateModel[]
  const connectorCatalog = (useServerInitialConnectors ? initialConnectorCatalog : connectorData ?? []) as ConnectorCatalogItem[]

  const agentTemplatesLoading = agentLoadingRaw && !useServerInitialAgents
  const toolTemplatesLoading = toolLoadingRaw && !useServerInitialTools
  const connectorsLoading = connectorLoadingRaw && !useServerInitialConnectors

  const agentFromUrl = useMemo(() => searchParams?.get('agent') ?? null, [searchParams])

  const agentsMatchingSearch = useMemo(() => {
    const q = debouncedSearch.toLowerCase()
    if (!q) return agentTemplates
    return agentTemplates.filter(t => {
      const name = typeof t?.name === 'string' ? t.name.toLowerCase() : ''
      const description = typeof t?.description === 'string' ? t.description.toLowerCase() : ''
      return name.includes(q) || description.includes(q)
    })
  }, [agentTemplates, debouncedSearch])

  const toolsMatchingSearch = useMemo(() => {
    const q = debouncedSearch.toLowerCase()
    if (!q) return toolTemplates
    return toolTemplates.filter(t => {
      const name = typeof t?.name === 'string' ? t.name.toLowerCase() : ''
      const description = typeof (t as any)?.description === 'string' ? String((t as any).description).toLowerCase() : ''
      return name.includes(q) || description.includes(q)
    })
  }, [toolTemplates, debouncedSearch])

  const connectorsMatchingSearch = useMemo(() => {
    const q = debouncedSearch.toLowerCase()
    if (!q) return connectorCatalog
    return connectorCatalog.filter(c => {
      const provider = typeof (c as any)?.provider === 'string' ? String((c as any).provider).toLowerCase() : ''
      const name = typeof (c as any)?.name === 'string' ? String((c as any).name).toLowerCase() : ''
      const description = typeof (c as any)?.description === 'string' ? String((c as any).description).toLowerCase() : ''
      return provider.includes(q) || name.includes(q) || description.includes(q)
    })
  }, [connectorCatalog, debouncedSearch])

  const countsByTab = useMemo(() => {
    const agents = agentsMatchingSearch.length
    const tools = toolsMatchingSearch.length
    const connectors = connectorsMatchingSearch.length
    return {
      all: agents + tools + connectors,
      agents,
      tools,
      connectors,
    } satisfies Record<MarketplaceTab, number>
  }, [agentsMatchingSearch.length, toolsMatchingSearch.length, connectorsMatchingSearch.length])

  const activeCount = countsByTab[tab]
  const isAllLoading = agentTemplatesLoading || toolTemplatesLoading || connectorsLoading
  const activeLoading =
    tab === 'all' ? isAllLoading : tab === 'agents' ? agentTemplatesLoading : tab === 'tools' ? toolTemplatesLoading : connectorsLoading

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
    const t = tab === 'all' ? 'Explore' : tab === 'agents' ? 'Explore agents' : tab === 'tools' ? 'Explore tools' : 'Explore connectors'
    const subtitle = 'Search and install agents, tools, and connectors.'
    return { title: t, subtitle }
  }, [tab])

  const renderConnectorCard = (c: ConnectorCatalogItem, idx: number) => {
    const provider = String((c as any)?.provider || '').trim()
    const name = String((c as any)?.name || '').trim() || titleCase(provider) || 'Connector'
    const description = String((c as any)?.description || '').trim()
    const logoSrc = provider ? getConnectorLogoSrc(provider) : null
    return (
      <motion.div key={provider || `${name}-${idx}`} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.04 }}>
        <div className="group relative overflow-hidden h-full flex flex-col rounded-lg border border-border/60 bg-card backdrop-blur-sm shadow-sm transition-all duration-200 hover:shadow-md p-5">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 shrink-0 rounded-lg border border-border/40 bg-white flex items-center justify-center overflow-hidden">
              {logoSrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={logoSrc}
                  alt=""
                  className="h-6 w-6 object-contain"
                  onError={e => {
                    ;(e.currentTarget as HTMLImageElement).style.display = 'none'
                  }}
                />
              ) : null}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-lg font-semibold leading-tight truncate">{name}</div>
              {provider ? <div className="mt-1 text-xs text-muted-foreground truncate">{provider}</div> : null}
            </div>
          </div>
          {description ? <div className="mt-3 text-sm text-muted-foreground leading-relaxed line-clamp-3">{description}</div> : null}
        </div>
      </motion.div>
    )
  }

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
            <div className="max-w-4xl mx-auto px-4 sm:px-6">
            {/* Hero (transparent, normal container width) */}
            <div className="pt-10 sm:pt-12 pb-6">
              <div className="flex flex-col items-center text-center">
                <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/30 px-3 py-1 text-xs text-muted-foreground">
                  <span className="inline-flex h-1.5 w-1.5 rounded-full bg-primary/70" aria-hidden="true" />
                  Starships Explore
                </div>

                <h1 className="mt-4 text-3xl sm:text-5xl font-semibold tracking-tight leading-[1.05]">
                  {hero.title}
                </h1>
                <p className="mt-3 text-sm sm:text-base text-muted-foreground max-w-2xl">
                  {hero.subtitle}
                </p>

                <div className="mt-6 max-w-2xl mx-auto w-full">
                  <div
                    className={
                      // Match ConversationMessageInput "minimal/compact" composer styling:
                      // bg + border + shadow + focus border. Keep rounded edges on all breakpoints.
                      'relative transition-all overflow-visible bg-card shadow-sm border border-border/80 rounded-2xl focus-within:border-primary/70'
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

                {!isAllLoading ? (
                  <div className="mt-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <span className="font-mono text-foreground">{countsByTab.agents}</span> agents
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="inline-flex items-center gap-1">
                      <span className="font-mono text-foreground">{countsByTab.tools}</span> tools
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="inline-flex items-center gap-1">
                      <span className="font-mono text-foreground">{countsByTab.connectors}</span> connectors
                    </span>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="pb-2">
              <Tabs
                value={tab}
                onValueChange={value => {
                  const v = String(value || '').toLowerCase()
                  if (!isMarketplaceTab(v)) return
                  track({ type: 'marketplace_tab_selected', tab: v })
                  router.push(TAB_TO_ROUTE[v])
                }}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex justify-center w-full">
                    <TabsList className="w-full sm:w-auto flex-nowrap justify-center gap-1 overflow-x-auto custom-scrollbar">
                      {MARKETPLACE_TABS.map(t => (
                        <TabsTrigger key={t} value={t}>
                          <span className="inline-flex items-center gap-1.5">
                            <span>{t === 'all' ? 'All' : t === 'agents' ? 'Agents' : t === 'tools' ? 'Tools' : 'Connectors'}</span>
                            {!(t === 'all' ? isAllLoading : t === 'agents' ? agentTemplatesLoading : t === 'tools' ? toolTemplatesLoading : connectorsLoading) ? (
                              <Badge
                                variant={tab === t ? 'default' : 'secondary'}
                                className="h-4 px-1.5 py-0 text-[10px] font-medium leading-none tabular-nums"
                              >
                                {countsByTab[t]}
                              </Badge>
                            ) : null}
                          </span>
                        </TabsTrigger>
                      ))}
                    </TabsList>
                  </div>
                </div>
              </Tabs>
            </div>

            {/* Results */}
            <div className="mt-8">
              {activeLoading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                  {[...Array(6)].map((_, i) => (
                    <div key={i} className="h-56 rounded-lg border border-border/60 bg-card animate-pulse" />
                  ))}
                </div>
              ) : activeCount > 0 ? (
                tab === 'all' ? (
                  <div className="space-y-10">
                    {agentsMatchingSearch.length > 0 ? (
                      <section>
                        <div className="mb-4 flex items-center justify-between gap-3">
                          <div className="min-w-0 flex items-baseline gap-3">
                            <h2 className="text-lg font-semibold leading-tight text-foreground">Agents</h2>
                            <Badge variant="outline" className="h-5 px-2 py-0 bg-muted/10 text-[10px] font-medium leading-none tabular-nums">
                              {agentsMatchingSearch.length}
                            </Badge>
                          </div>
                          <button
                            type="button"
                            className="text-sm text-primary hover:underline underline-offset-2"
                            onClick={() => router.push(TAB_TO_ROUTE.agents)}
                          >
                            View all
                          </button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                          {agentsMatchingSearch.slice(0, 6).map((template: AgentTemplateModel, idx: number) => (
                            <motion.div key={template.id} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.04 }}>
                              <AgentTemplateCard template={template} onDeploy={handleAgentDeploy} onClick={handleAgentClick} />
                            </motion.div>
                          ))}
                        </div>
                      </section>
                    ) : null}

                    {toolsMatchingSearch.length > 0 ? (
                      <section>
                        <div className="mb-4 flex items-center justify-between gap-3">
                          <div className="min-w-0 flex items-baseline gap-3">
                            <h2 className="text-lg font-semibold leading-tight text-foreground">Tools</h2>
                            <Badge variant="outline" className="h-5 px-2 py-0 bg-muted/10 text-[10px] font-medium leading-none tabular-nums">
                              {toolsMatchingSearch.length}
                            </Badge>
                          </div>
                          <button
                            type="button"
                            className="text-sm text-primary hover:underline underline-offset-2"
                            onClick={() => router.push(TAB_TO_ROUTE.tools)}
                          >
                            View all
                          </button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                          {toolsMatchingSearch.slice(0, 6).map((template: ToolTemplateModel, idx: number) => (
                            <motion.div
                              key={(template as any)?.id ?? (template as any)?.slug ?? `${idx}`}
                              initial={{ opacity: 0, y: 14 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: idx * 0.04 }}
                            >
                              <ToolTemplateCard template={template} />
                            </motion.div>
                          ))}
                        </div>
                      </section>
                    ) : null}

                    {connectorsMatchingSearch.length > 0 ? (
                      <section>
                        <div className="mb-4 flex items-center justify-between gap-3">
                          <div className="min-w-0 flex items-baseline gap-3">
                            <h2 className="text-lg font-semibold leading-tight text-foreground">Connectors</h2>
                            <Badge variant="outline" className="h-5 px-2 py-0 bg-muted/10 text-[10px] font-medium leading-none tabular-nums">
                              {connectorsMatchingSearch.length}
                            </Badge>
                          </div>
                          <button
                            type="button"
                            className="text-sm text-primary hover:underline underline-offset-2"
                            onClick={() => router.push(TAB_TO_ROUTE.connectors)}
                          >
                            View all
                          </button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                          {connectorsMatchingSearch.slice(0, 6).map(renderConnectorCard)}
                        </div>
                      </section>
                    ) : null}
                  </div>
                ) : tab === 'agents' ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                    {agentsMatchingSearch.map((template: AgentTemplateModel, idx: number) => (
                      <motion.div key={template.id} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.04 }}>
                        <AgentTemplateCard template={template} onDeploy={handleAgentDeploy} onClick={handleAgentClick} />
                      </motion.div>
                    ))}
                  </div>
                ) : tab === 'tools' ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                    {toolsMatchingSearch.map((template: ToolTemplateModel, idx: number) => (
                      <motion.div key={(template as any)?.id ?? (template as any)?.slug ?? `${idx}`} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.04 }}>
                        <ToolTemplateCard template={template} />
                      </motion.div>
                    ))}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                    {connectorsMatchingSearch.map(renderConnectorCard)}
                  </div>
                )
              ) : (
                <div className="rounded-lg border border-border/60 bg-card shadow-sm p-10 text-center">
                  <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-muted/40 flex items-center justify-center">
                    <Icon name="head-circuit" className="w-6 h-6 text-muted-foreground" />
                  </div>
                  <h3 className="text-lg font-semibold">
                    {tab === 'agents' ? 'No agents found' : tab === 'tools' ? 'No tools found' : tab === 'connectors' ? 'No connectors found' : 'No results found'}
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">Try adjusting your search.</p>
                </div>
              )}
            </div>
            </div>
          </div>
        </main>
      </div>
    </>
  )
}
