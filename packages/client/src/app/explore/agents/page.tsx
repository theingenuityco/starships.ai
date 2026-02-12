import MarketplacePageClient from '@/app/marketplace/MarketplacePageClient'
import { fetchPublicAgentTemplates, fetchPublicConnectorCatalog, fetchPublicToolTemplates } from '@/lib/server/public-templates'

// Public marketing page: cacheable at the edge with ISR.
export const dynamic = 'force-static'
export const revalidate = 3600 // 1 hour

export default async function ExploreAgentsPage() {
  const [agentTemplates, toolTemplates, connectorCatalog] = await Promise.all([
    fetchPublicAgentTemplates({ revalidateSeconds: revalidate }),
    fetchPublicToolTemplates({ revalidateSeconds: revalidate }),
    fetchPublicConnectorCatalog({ revalidateSeconds: revalidate }),
  ])

  return (
    <MarketplacePageClient
      activeTab="agents"
      initialAgentTemplates={agentTemplates}
      initialToolTemplates={toolTemplates}
      initialConnectorCatalog={connectorCatalog}
    />
  )
}

