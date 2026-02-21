import MarketplacePageClient from '@/app/marketplace/MarketplacePageClient'
import { fetchPublicAgentTemplatesPage, fetchPublicConnectorCatalogPage, fetchPublicToolTemplatesPage } from '@/lib/server/public-templates'

// Public marketing page: cacheable at the edge with ISR.
export const dynamic = 'force-static'
export const revalidate = 3600 // 1 hour

export default async function ExploreAgentsPage() {
  const PAGE_SIZE = 18
  const [agentsPage, toolsCountPage, connectorsCountPage] = await Promise.all([
    fetchPublicAgentTemplatesPage({ page: 1, limit: PAGE_SIZE, revalidateSeconds: revalidate }),
    fetchPublicToolTemplatesPage({ page: 1, limit: 1, revalidateSeconds: revalidate }),
    fetchPublicConnectorCatalogPage({ page: 1, limit: 1, revalidateSeconds: revalidate }),
  ])

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

