import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'

import MarketplacePageClient from '@/app/marketplace/MarketplacePageClient'
import { fetchPublicAgentTemplatesPage, fetchPublicConnectorCatalogPage, fetchPublicToolTemplatesPage } from '@/lib/server/public-templates'

// Public marketing page: cacheable at the edge with ISR.
export const dynamic = 'force-static'
export const dynamicParams = true
export const revalidate = 3600 // 1 hour

type PageProps = {
  params: Promise<{ page: string }>
}

function parsePage(value: unknown): number | null {
  const n = typeof value === 'string' ? Number(value) : typeof value === 'number' ? value : NaN
  if (!Number.isFinite(n)) return null
  const i = Math.floor(n)
  if (i < 1) return null
  return i
}

export async function generateMetadata(props: PageProps): Promise<Metadata> {
  const { page } = await props.params
  const p = parsePage(page)
  const label = p && p > 1 ? ` (Page ${p})` : ''
  const canonical = p && p > 1 ? `https://starships.ai/explore/agents/page/${p}` : 'https://starships.ai/explore/agents'
  return {
    title: `Explore agents${label} | Starships.ai`,
    alternates: { canonical },
  }
}

export default async function ExploreAgentsPagedPage(props: PageProps) {
  const { page } = await props.params
  const p = parsePage(page)
  if (!p) notFound()
  if (p === 1) redirect('/explore/agents')

  const PAGE_SIZE = 24
  const [agentsPage, toolsCountPage, connectorsCountPage] = await Promise.all([
    fetchPublicAgentTemplatesPage({ page: p, limit: PAGE_SIZE, revalidateSeconds: revalidate }),
    fetchPublicToolTemplatesPage({ page: 1, limit: 1, revalidateSeconds: revalidate }),
    fetchPublicConnectorCatalogPage({ page: 1, limit: 1, revalidateSeconds: revalidate }),
  ])

  // If the requested page is out of range, render 404 so it’s not indexed.
  if (agentsPage.items.length === 0 && p > 1) notFound()

  return (
    <MarketplacePageClient
      activeTab="agents"
      initialAgentTemplates={agentsPage.items}
      initialToolTemplates={[]}
      initialConnectorCatalog={[]}
      initialTotals={{
        agents: agentsPage.pagination.total,
        tools: toolsCountPage.pagination.total,
        connectors: connectorsCountPage.pagination.total,
      }}
      pagination={agentsPage.pagination}
    />
  )
}

