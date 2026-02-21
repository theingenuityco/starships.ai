import { isIndexingEnabled } from '@/lib/indexing'
import { publicEnvConfig } from '@starships/env/public'
import { fetchPublicAgentTemplatesPage, fetchPublicConnectorCatalogPage, fetchPublicToolTemplatesPage } from '@/lib/server/public-templates'

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, '')
}

function getConfiguredBaseUrl(): string {
  const configured = trimTrailingSlashes(String(publicEnvConfig.PUBLIC_URL || '').trim())
  return configured || 'https://starships.ai'
}

function xmlEscape(value: string): string {
  return (
    value
      // Use regex replaces (instead of String.prototype.replaceAll) to keep TS lib targets older than ES2021 happy.
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;')
  )
}

type UrlEntry = {
  path: string
  changefreq?: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never'
  priority?: number
  lastmod?: Date
}

function normalizeSiteUrl(publicUrl: string): string {
  return publicUrl.replace(/\/+$/, '')
}

function joinUrl(base: string, path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`
  return `${base}${p === '/' ? '' : p}`
}

// Sitemaps should be static + cached (refreshed via ISR).
export const dynamic = 'force-static'
export const revalidate = 86400 // 24 hours

/**
 * App sitemap (public-facing pages only).
 *
 * Note: authenticated app routes like `/ship/*` are intentionally excluded.
 */
export async function GET(req: Request) {
  if (!isIndexingEnabled()) {
    return new Response('Not Found', { status: 404 })
  }

  const base = normalizeSiteUrl(getConfiguredBaseUrl())
  const now = new Date()

  // Fetch all agent slugs in pages (avoid assuming the list endpoint returns everything).
  const AGENT_PAGE_SIZE = 200
  const MAX_AGENT_PAGES = 50 // safety cap
  const agentSlugs: string[] = []
  let agentTotal = 0

  for (let page = 1; page <= MAX_AGENT_PAGES; page++) {
    const bundle = await fetchPublicAgentTemplatesPage({ page, limit: AGENT_PAGE_SIZE, revalidateSeconds: revalidate })
    if (page === 1) agentTotal = bundle.pagination.total
    for (const t of bundle.items) {
      const slug = String(t?.slug || '').trim()
      if (slug) agentSlugs.push(slug)
    }
    if (!bundle.pagination.has_next) break
  }

  const agentDetailUrls: UrlEntry[] = agentSlugs.map(slug => ({
    path: `/explore/agents/${encodeURIComponent(slug)}`,
    changefreq: 'weekly',
    priority: 0.7,
    lastmod: now,
  }))

  // Add paginated Explore listing pages for SEO/ISR discoverability.
  // Keep this bounded so we don't emit enormous sitemaps.
  const LISTING_PAGE_SIZE = 18
  const MAX_LISTING_PAGES = 25
  const toolsCount = await fetchPublicToolTemplatesPage({ page: 1, limit: 1, revalidateSeconds: revalidate })
  const connectorsCount = await fetchPublicConnectorCatalogPage({ page: 1, limit: 1, revalidateSeconds: revalidate })

  const toolsTotal = toolsCount.pagination.total
  const connectorsTotal = connectorsCount.pagination.total

  const agentPages = Math.min(MAX_LISTING_PAGES, Math.max(1, Math.ceil(agentTotal / LISTING_PAGE_SIZE)))
  const toolPages = Math.min(MAX_LISTING_PAGES, Math.max(1, Math.ceil(toolsTotal / LISTING_PAGE_SIZE)))
  const connectorPages = Math.min(MAX_LISTING_PAGES, Math.max(1, Math.ceil(connectorsTotal / LISTING_PAGE_SIZE)))

  const listingUrls: UrlEntry[] = [
    { path: '/explore/agents', changefreq: 'daily', priority: 0.7, lastmod: now },
    { path: '/explore/automations', changefreq: 'daily', priority: 0.7, lastmod: now },
    { path: '/explore/connectors', changefreq: 'daily', priority: 0.7, lastmod: now },
    ...Array.from({ length: Math.max(0, agentPages - 1) }).map((_, i) => ({
      path: `/explore/agents/page/${i + 2}`,
      changefreq: 'daily' as const,
      priority: 0.6,
      lastmod: now,
    })),
    ...Array.from({ length: Math.max(0, toolPages - 1) }).map((_, i) => ({
      path: `/explore/automations/page/${i + 2}`,
      changefreq: 'daily' as const,
      priority: 0.6,
      lastmod: now,
    })),
    ...Array.from({ length: Math.max(0, connectorPages - 1) }).map((_, i) => ({
      path: `/explore/connectors/page/${i + 2}`,
      changefreq: 'daily' as const,
      priority: 0.6,
      lastmod: now,
    })),
  ]

  const urls: UrlEntry[] = [
    { path: '/', changefreq: 'weekly', priority: 1.0, lastmod: now },
    { path: '/explore', changefreq: 'daily', priority: 0.8, lastmod: now },
    ...listingUrls,
    { path: '/docs', changefreq: 'weekly', priority: 0.6, lastmod: now },
    { path: '/privacy', changefreq: 'yearly', priority: 0.3, lastmod: now },
    { path: '/terms', changefreq: 'yearly', priority: 0.3, lastmod: now },
    ...agentDetailUrls,
  ]

  const body =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls
      .map(u => {
        const loc = joinUrl(base, u.path)
        const parts = [
          `  <url>`,
          `    <loc>${xmlEscape(loc)}</loc>`,
          u.lastmod ? `    <lastmod>${xmlEscape(u.lastmod.toISOString())}</lastmod>` : null,
          u.changefreq ? `    <changefreq>${u.changefreq}</changefreq>` : null,
          typeof u.priority === 'number' ? `    <priority>${u.priority.toFixed(1)}</priority>` : null,
          `  </url>\n`,
        ].filter(Boolean)
        return parts.join('\n')
      })
      .join('') +
    `</urlset>\n`

  return new Response(body, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=0, s-maxage=86400, stale-while-revalidate=86400',
    },
  })
}

