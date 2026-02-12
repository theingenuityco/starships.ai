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
  const canonical = p && p > 1 ? `https://starships.ai/explore/automations/page/${p}` : 'https://starships.ai/explore/automations'
  return {
    title: `Explore automations${label} | Starships.ai`,
    alternates: { canonical },
  }
}

export default async function ExploreAutomationsPagedPage(props: PageProps) {
  const { page } = await props.params
  const p = parsePage(page)
  if (!p) notFound()
  if (p === 1) redirect('/explore/automations')

  const PAGE_SIZE = 24
  const [toolsPage, agentsCountPage, connectorsCountPage] = await Promise.all([
    fetchPublicToolTemplatesPage({ page: p, limit: PAGE_SIZE, revalidateSeconds: revalidate }),
    fetchPublicAgentTemplatesPage({ page: 1, limit: 1, revalidateSeconds: revalidate }),
    fetchPublicConnectorCatalogPage({ page: 1, limit: 1, revalidateSeconds: revalidate }),
  ])

  if (toolsPage.items.length === 0 && p > 1) notFound()

  return (
    <MarketplacePageClient
      activeTab="tools"
      initialAgentTemplates={[]}
      initialToolTemplates={toolsPage.items}
      initialConnectorCatalog={[]}
      initialTotals={{
        agents: agentsCountPage.pagination.total,
        tools: toolsPage.pagination.total,
        connectors: connectorsCountPage.pagination.total,
      }}
      pagination={toolsPage.pagination}
    />
  )
}

