import HomePageClient from './home-page-client'
import { fetchPublicAgentTemplates, fetchPublicToolTemplates } from '@/lib/server/public-templates'

// Public marketing page: rendered on-demand (avoid build-time API dependency).
export const dynamic = 'force-dynamic'
// Hints Next Data Cache; home HTML uses strict Cache-Control in next.config (avoid CDN stale shell vs client).
export const fetchCache = 'force-no-store'
export const revalidate = 3600 // 1 hour (passed to public template fetches below)

export default async function HomePage() {
  // Server-fetch public templates so they can render in the initial HTML (no client waterfall).
  const [agentTemplates, toolTemplates] = await Promise.all([
    fetchPublicAgentTemplates({ revalidateSeconds: revalidate }),
    fetchPublicToolTemplates({ revalidateSeconds: revalidate }),
  ])

  return <HomePageClient initialAgentTemplates={agentTemplates} initialToolTemplates={toolTemplates} />
}
