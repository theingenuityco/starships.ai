import MarketplacePageClient from '@/app/marketplace/MarketplacePageClient'
import { fetchPublicAgentTemplates, fetchPublicConnectorCatalog, fetchPublicToolTemplates } from '@/lib/server/public-templates'

// Public marketing page: cacheable at the edge with ISR.
export const dynamic = 'force-static'
export const revalidate = 3600 // 1 hour

export default async function ExploreAutomationsPage() {
  const [agentTemplates, toolTemplates, connectorCatalog] = await Promise.all([
    fetchPublicAgentTemplates({ revalidateSeconds: revalidate }),
    fetchPublicToolTemplates({ revalidateSeconds: revalidate }),
    fetchPublicConnectorCatalog({ revalidateSeconds: revalidate }),
  ])

  return (
    <MarketplacePageClient
      // Internally, this is still the "tools" tab for data + filtering.
      activeTab="tools"
      initialAgentTemplates={agentTemplates}
      initialToolTemplates={toolTemplates}
      initialConnectorCatalog={connectorCatalog}
    />
  )
}

