'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import type { AgentTemplateModel, ConnectorCatalogItem, ToolTemplateModel } from '@starships/protocol'

import PublicHeader from '@/components/navigation/PublicHeader'
import Icon from '@/components/primitives/Icon'
import { MarketplaceAvatar } from '@/components/marketplace/MarketplaceAvatar'
import { ConnectorLogo } from '@/components/marketplace/ConnectorLogo'
import { PublicFooter } from '@/app/components/PublicFooter'
import ExploreCTA from '@/app/components/ExploreCTA'
import { cn } from '@/lib/utils'

type Pagination = {
  page: number
  limit: number
  total: number
  has_next: boolean
  has_prev: boolean
}

type Totals = { agents: number; tools: number; connectors: number }

export default function MarketplacePageClient(props: {
  activeTab: 'all' | 'agents' | 'tools' | 'connectors'
  initialAgentTemplates: AgentTemplateModel[]
  initialToolTemplates: ToolTemplateModel[]
  initialConnectorCatalog: ConnectorCatalogItem[]
  initialTotals: Totals
  pagination?: Pagination
}) {
  const { activeTab, initialAgentTemplates, initialToolTemplates, initialConnectorCatalog, initialTotals, pagination } = props

  const tabs = useMemo(
    () => [
      { key: 'all' as const, label: 'All', href: '/explore', count: initialTotals.agents + initialTotals.tools + initialTotals.connectors },
      { key: 'agents' as const, label: 'Agents', href: '/explore/agents', count: initialTotals.agents },
      { key: 'tools' as const, label: 'Automations', href: '/explore/automations', count: initialTotals.tools },
      { key: 'connectors' as const, label: 'Connectors', href: '/explore/connectors', count: initialTotals.connectors },
    ],
    [initialTotals]
  )

  const Section = ({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) => (
    <section className="space-y-3">
      <div>
        <h2 className="text-base font-semibold">{title}</h2>
        {subtitle ? <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p> : null}
      </div>
      {children}
    </section>
  )

  const PaginationControls = () => {
    if (!pagination) return null
    const { page, has_next, has_prev } = pagination

    const base =
      activeTab === 'agents'
        ? '/explore/agents/page'
        : activeTab === 'tools'
          ? '/explore/automations/page'
          : activeTab === 'connectors'
            ? '/explore/connectors/page'
            : null

    if (!base) return null

    return (
      <div className="flex items-center justify-center gap-3 pt-6">
        <Link
          href={has_prev ? `${base}/${Math.max(1, page - 1)}` : '#'}
          aria-disabled={!has_prev}
          className={cn(
            'inline-flex items-center gap-2 rounded-md border border-border/60 px-3 py-1.5 text-sm',
            has_prev ? 'hover:bg-accent/60' : 'pointer-events-none opacity-50'
          )}
        >
          <Icon name="arrow-left" className="h-4 w-4" />
          Prev
        </Link>
        <span className="text-xs text-muted-foreground tabular-nums">Page {page}</span>
        <Link
          href={has_next ? `${base}/${page + 1}` : '#'}
          aria-disabled={!has_next}
          className={cn(
            'inline-flex items-center gap-2 rounded-md border border-border/60 px-3 py-1.5 text-sm',
            has_next ? 'hover:bg-accent/60' : 'pointer-events-none opacity-50'
          )}
        >
          Next
          <Icon name="arrow-right" className="h-4 w-4" />
        </Link>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col">
      <PublicHeader />

      <main className="flex-1 px-4 py-10">
        <div className="mx-auto w-full max-w-6xl space-y-8">
          <header className="space-y-2">
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Explore</h1>
            <p className="text-sm text-muted-foreground">Browse agents, automations, and connectors you can deploy in minutes.</p>
          </header>

          <nav className="flex flex-wrap items-center gap-2">
            {tabs.map(t => (
              <Link
                key={t.key}
                href={t.href}
                className={cn(
                  'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm',
                  activeTab === t.key ? 'border-border bg-background' : 'border-border/60 bg-background/40 hover:bg-accent/60'
                )}
              >
                <span>{t.label}</span>
                <span className="text-xs tabular-nums text-muted-foreground">({t.count})</span>
              </Link>
            ))}
          </nav>

          {activeTab === 'all' || activeTab === 'agents' ? (
            <Section title="Agents" subtitle="Ready-to-deploy assistants with clear responsibilities.">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {initialAgentTemplates.map(t => (
                  <Link
                    key={t.id || t.slug}
                    href={`/explore/agents/${encodeURIComponent(t.slug)}`}
                    className="rounded-lg border border-border/60 bg-card/60 p-4 hover:bg-accent/40 transition-colors"
                  >
                    <div className="flex items-start gap-3">
                      <MarketplaceAvatar
                        imageUrl={t.avatarUrl || null}
                        label={`${t.name || 'Agent'} avatar`}
                        seed={t.name || t.slug || 'AI'}
                        sizeClassName="h-10 w-10"
                        fallbackTextClassName="text-xs font-semibold text-muted-foreground"
                      />
                      <div className="min-w-0">
                        <div className="font-medium truncate">{t.role || t.name || t.slug}</div>
                        {t.description ? <div className="mt-1 text-sm text-muted-foreground line-clamp-2">{t.description}</div> : null}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
              <PaginationControls />
            </Section>
          ) : null}

          {activeTab === 'all' || activeTab === 'tools' ? (
            <Section title="Automations" subtitle="Reusable tool workflows you can install.">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {initialToolTemplates.map(t => (
                  <div key={t.id || t.slug} className="rounded-lg border border-border/60 bg-card/60 p-4">
                    <div className="font-medium truncate">{t.name || t.slug}</div>
                    {t.description ? <div className="mt-1 text-sm text-muted-foreground line-clamp-2">{t.description}</div> : null}
                  </div>
                ))}
              </div>
              <PaginationControls />
            </Section>
          ) : null}

          {activeTab === 'all' || activeTab === 'connectors' ? (
            <Section title="Connectors" subtitle="Integrations you can connect to your starship.">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {initialConnectorCatalog.map((c: any) => {
                  const provider = typeof c?.provider === 'string' ? c.provider : ''
                  const name = typeof c?.name === 'string' ? c.name : provider
                  return (
                    <div key={provider || name} className="rounded-lg border border-border/60 bg-card/60 p-4 flex items-center gap-3">
                      <div className="h-10 w-10 rounded-md border border-border/60 bg-background/40 flex items-center justify-center">
                        <ConnectorLogo provider={provider} className="h-6 w-6" />
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium truncate">{name || provider}</div>
                        {provider ? <div className="text-xs text-muted-foreground truncate">{provider}</div> : null}
                      </div>
                    </div>
                  )
                })}
              </div>
              <PaginationControls />
            </Section>
          ) : null}

          <ExploreCTA
            kind={
              activeTab === 'agents' ? 'agent' : activeTab === 'connectors' ? 'connector' : activeTab === 'tools' ? 'automation' : 'anything'
            }
          />
        </div>
      </main>

      <PublicFooter />
    </div>
  )
}

