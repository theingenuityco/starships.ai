import { redirect } from 'next/navigation'

import MarketplacePageClient from '@/app/marketplace/MarketplacePageClient'
import { fetchPublicAgentTemplates, fetchPublicConnectorCatalog, fetchPublicExplorePopular, fetchPublicToolTemplates } from '@/lib/server/public-templates'

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

function toQueryString(params: Record<string, string | string[] | undefined> | null | undefined): string {
  const sp = new URLSearchParams()
  const p = params ?? {}
  for (const [k, v] of Object.entries(p)) {
    if (k === 'tab') continue
    if (typeof v === 'string' && v.length) sp.set(k, v)
    else if (Array.isArray(v)) for (const item of v) if (typeof item === 'string' && item.length) sp.append(k, item)
  }
  const qs = sp.toString()
  return qs ? `?${qs}` : ''
}

// Public marketing page: cacheable at the edge with ISR.
export const dynamic = 'force-static'
export const revalidate = 3600 // 1 hour

export default async function ExplorePage(props: PageProps) {
  const searchParams = (await props.searchParams) ?? {}
  const tabRaw = searchParams?.tab
  const tab = typeof tabRaw === 'string' ? tabRaw : Array.isArray(tabRaw) ? tabRaw[0] : ''
  const t = String(tab || '').trim().toLowerCase()

  // Back-compat: old links used `?tab=...`. Prefer redirecting to the new route segments.
  if (t === 'agents' || t === 'tools' || t === 'connectors') {
    const dest = t === 'agents' ? '/explore/agents' : t === 'tools' ? '/explore/tools' : '/explore/connectors'
    redirect(`${dest}${toQueryString(searchParams)}`)
  }

  const [agentTemplates, toolTemplates, connectorCatalog] = await Promise.all([
    fetchPublicAgentTemplates({ revalidateSeconds: revalidate }),
    fetchPublicToolTemplates({ revalidateSeconds: revalidate }),
    fetchPublicConnectorCatalog({ revalidateSeconds: revalidate }),
  ])

  const popular = await fetchPublicExplorePopular({ revalidateSeconds: revalidate, windowDays: 30, limitAgents: 6, limitTools: 6 })

  return (
    <MarketplacePageClient
      activeTab="all"
      initialAgentTemplates={agentTemplates}
      initialToolTemplates={toolTemplates}
      initialConnectorCatalog={connectorCatalog}
      initialPopularAgents={popular.agents}
      initialPopularTools={popular.tools}
    />
  )
}

