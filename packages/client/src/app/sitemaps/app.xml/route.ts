import { isIndexingEnabled } from '@/lib/indexing'
import { publicEnvConfig } from '@starships/env/public'
import { fetchPublicAgentTemplates } from '@/lib/server/public-templates'

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, '')
}

function firstHeaderValue(value: string | null): string {
  return String(value || '')
    .split(',')[0]
    ?.trim()
}

function getBaseUrlFromRequest(req: Request): string {
  const configured = trimTrailingSlashes(String(publicEnvConfig.PUBLIC_URL || '').trim())
  if (configured) return configured

  const host = firstHeaderValue(req.headers.get('x-forwarded-host')) || firstHeaderValue(req.headers.get('host'))
  if (!host) return ''

  const proto = firstHeaderValue(req.headers.get('x-forwarded-proto')) || 'https'
  return trimTrailingSlashes(`${proto}://${host}`)
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

// Keep the app sitemap always fresh in container deployments.
export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * App sitemap (public-facing pages only).
 *
 * Note: authenticated app routes like `/ship/*` are intentionally excluded.
 */
export async function GET(req: Request) {
  if (!isIndexingEnabled()) {
    return new Response('Not Found', { status: 404 })
  }

  const base = normalizeSiteUrl(getBaseUrlFromRequest(req))
  const now = new Date()

  const agentTemplates = await fetchPublicAgentTemplates({ revalidateSeconds: 0 })
  const agentDetailUrls: UrlEntry[] = agentTemplates
    .map(t => String(t?.slug || '').trim())
    .filter(Boolean)
    .map(slug => ({
      path: `/marketplace/agents/${encodeURIComponent(slug)}`,
      changefreq: 'weekly',
      priority: 0.7,
      lastmod: now,
    }))

  const urls: UrlEntry[] = [
    { path: '/', changefreq: 'weekly', priority: 1.0, lastmod: now },
    { path: '/marketplace', changefreq: 'daily', priority: 0.8, lastmod: now },
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
      'Cache-Control': 'no-store',
    },
  })
}
