import HomePageClient from './home-page-client'
import { fetchPublicAgentTemplates, fetchPublicToolTemplates } from '@/lib/server/public-templates'

// Public marketing page: cacheable + safe to serve from edge/CDN.
export const dynamic = 'force-static'
export const revalidate = 3600 // 1 hour

export default async function HomePage() {
  // Server-fetch public templates so they can render in the initial HTML (no client waterfall).
  const [agentTemplates, toolTemplates] = await Promise.all([
    fetchPublicAgentTemplates({ revalidateSeconds: revalidate }),
    fetchPublicToolTemplates({ revalidateSeconds: revalidate }),
  ])

  return <HomePageClient initialAgentTemplates={agentTemplates} initialToolTemplates={toolTemplates} />
}
