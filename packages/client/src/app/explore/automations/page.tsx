import MarketplacePageClient from '@/app/marketplace/MarketplacePageClient'
import { fetchPublicAgentTemplatesPage, fetchPublicConnectorCatalogPage, fetchPublicToolTemplatesPage } from '@/lib/server/public-templates'

// Public marketing page: cacheable at the edge with ISR.
export const dynamic = 'force-static'
export const revalidate = 3600 // 1 hour

export default async function ExploreAutomationsPage() {
  const PAGE_SIZE = 18
  const [toolsPage, agentsCountPage, connectorsCountPage] = await Promise.all([
    fetchPublicToolTemplatesPage({ page: 1, limit: PAGE_SIZE, revalidateSeconds: revalidate }),
    fetchPublicAgentTemplatesPage({ page: 1, limit: 1, revalidateSeconds: revalidate }),
    fetchPublicConnectorCatalogPage({ page: 1, limit: 1, revalidateSeconds: revalidate }),
  ])

  return (
    <MarketplacePageClient
      // Internally, this is still the "tools" tab for data + filtering.
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
