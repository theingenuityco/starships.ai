import MarketplacePageClient from '@/app/marketplace/MarketplacePageClient'
import { fetchPublicAgentTemplatesPage, fetchPublicConnectorCatalogPage, fetchPublicToolTemplatesPage } from '@/lib/server/public-templates'

// Public marketing page: cacheable at the edge with ISR.
export const dynamic = 'force-static'
export const revalidate = 3600 // 1 hour

export default async function ExploreConnectorsPage() {
  const PAGE_SIZE = 18
  const [connectorsPage, agentsCountPage, toolsCountPage] = await Promise.all([
    fetchPublicConnectorCatalogPage({ page: 1, limit: PAGE_SIZE, revalidateSeconds: revalidate }),
    fetchPublicAgentTemplatesPage({ page: 1, limit: 1, revalidateSeconds: revalidate }),
    fetchPublicToolTemplatesPage({ page: 1, limit: 1, revalidateSeconds: revalidate }),
  ])

  return (
    <MarketplacePageClient
      activeTab="connectors"
      initialAgentTemplates={[]}
      initialToolTemplates={[]}
      initialConnectorCatalog={connectorsPage.items}
      initialTotals={{
        agents: agentsCountPage.pagination.total,
        tools: toolsCountPage.pagination.total,
        connectors: connectorsPage.pagination.total,
      }}
      pagination={connectorsPage.pagination}
    />
  )
}
