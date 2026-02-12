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
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import type { AgentTemplateModel, ConnectorCatalogItem, ToolTemplateModel } from '@starships/protocol'
import { track } from '@/lib/analytics'

const MARKETPLACE_TABS = ['agents', 'tools', 'connectors'] as const
type MarketplaceTab = typeof MARKETPLACE_TABS[number]

function isMarketplaceTab(value: string): value is MarketplaceTab {
  return (MARKETPLACE_TABS as readonly string[]).includes(value)
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
}) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  const tabFromUrl = useMemo(() => (searchParams?.get('tab') ?? 'agents').toLowerCase(), [searchParams])
  const [tab, setTab] = useState<MarketplaceTab>(() => (isMarketplaceTab(tabFromUrl) ? tabFromUrl : 'agents'))

  useEffect(() => {
    if (!isMarketplaceTab(tabFromUrl)) return
    setTab(tabFromUrl)
  }, [tabFromUrl])

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
    return {
      agents: agentsMatchingSearch.length,
      tools: toolsMatchingSearch.length,
      connectors: connectorsMatchingSearch.length,
    } satisfies Record<MarketplaceTab, number>
  }, [agentsMatchingSearch.length, toolsMatchingSearch.length, connectorsMatchingSearch.length])

  const activeCount = countsByTab[tab]
  const activeLoading = tab === 'agents' ? agentTemplatesLoading : tab === 'tools' ? toolTemplatesLoading : connectorsLoading

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
    if (!agentFromUrl) return
    if (agentTemplatesLoading) return
    if (!Array.isArray(agentTemplates) || agentTemplates.length === 0) return

    const found = agentTemplates.find(t => t.slug === agentFromUrl) ?? agentTemplates.find(t => t.id === agentFromUrl) ?? null
    if (!found) return

    // Preserve other query params (e.g. category) by leaving the listing URL alone in history
    // and pushing the canonical details route.
    router.replace(`/explore/agents/${encodeURIComponent(found.slug)}`)
  }, [agentFromUrl, agentTemplates, agentTemplatesLoading, router])

  return (
    <>
      <PublicHeader />

      <main className="marketplace-main pb-12 sm:pb-16">
        <div className="relative">
          {/* Decorative hero background (match agent details) */}
          <div className="pointer-events-none absolute inset-x-0 -top-10 -z-10 h-[360px] overflow-hidden">
            <div className="absolute left-1/2 top-0 h-[420px] w-[900px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle_at_center,rgba(124,58,237,0.22),transparent_60%)] blur-2xl" />
            <div className="absolute left-1/4 top-24 h-[280px] w-[520px] rounded-full bg-[radial-gradient(circle_at_center,rgba(59,130,246,0.18),transparent_60%)] blur-2xl" />
          </div>

          <div className="max-w-4xl mx-auto px-4 sm:px-6">
            <div className="pt-4 pb-2">
              <Tabs
                value={tab}
                onValueChange={value => {
                  const v = String(value || '').toLowerCase()
                  if (!isMarketplaceTab(v)) return
                  track({ type: 'marketplace_tab_selected', tab: v })
                  setTab(v)
                  const params = new URLSearchParams(searchParams?.toString() ?? '')
                  if (v !== 'agents') params.set('tab', v)
                  else params.delete('tab')
                  const qs = params.toString()
                  router.replace(qs ? `${pathname}?${qs}` : pathname)
                }}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex justify-start">
                    <TabsList className="w-full sm:w-auto flex-nowrap justify-start gap-1 overflow-x-auto custom-scrollbar">
                      {MARKETPLACE_TABS.map(t => (
                        <TabsTrigger key={t} value={t}>
                          <span className="inline-flex items-center gap-1.5">
                            <span>{t === 'agents' ? 'Agents' : t === 'tools' ? 'Tools' : 'Connectors'}</span>
                            {!(t === 'agents' ? agentTemplatesLoading : t === 'tools' ? toolTemplatesLoading : connectorsLoading) ? (
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

                  <div className="w-full sm:w-64">
                    <div className="relative">
                      <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4 z-10 pointer-events-none" />
                      <Input
                        value={searchText}
                        onChange={e => setSearchText(e.target.value)}
                        placeholder={tab === 'agents' ? 'Search agents' : tab === 'tools' ? 'Search tools' : 'Search connectors'}
                        className="pl-9 h-9 py-1.5 text-[13px] rounded-2xl border-border/60 bg-card shadow-sm"
                        aria-label={tab === 'agents' ? 'Search agents' : tab === 'tools' ? 'Search tools' : 'Search connectors'}
                      />
                    </div>
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
                tab === 'agents' ? (
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
                    {connectorsMatchingSearch.map((c: ConnectorCatalogItem, idx: number) => {
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
                    })}
                  </div>
                )
              ) : (
                <div className="rounded-lg border border-border/60 bg-card shadow-sm p-10 text-center">
                  <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-muted/40 flex items-center justify-center">
                    <Icon name="head-circuit" className="w-6 h-6 text-muted-foreground" />
                  </div>
                  <h3 className="text-lg font-semibold">
                    {tab === 'agents' ? 'No agents found' : tab === 'tools' ? 'No tools found' : 'No connectors found'}
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">Try adjusting your search.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </>
  )
}
