import { isIndexingEnabled } from '@/lib/indexing'
import { publicEnvConfig } from '@starships/env/public'

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

  const rawHost = firstHeaderValue(req.headers.get('x-forwarded-host')) || firstHeaderValue(req.headers.get('host'))
  const host = rawHost.startsWith('www.') ? rawHost.slice(4) : rawHost
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

function toIsoDate(value: Date): string {
  return value.toISOString()
}

/**
 * Root sitemap index for starships.ai.
 *
 * We serve multiple apps behind one domain:
 * - Client app at `/`
 * - Docs app at `/docs` (separate Next.js app)
 *
 * This endpoint returns a sitemap index pointing to each app's sitemap.
 */
// Sitemaps are small and correctness matters more than caching.
// In container/K8s deployments, filesystem-based ISR can be inconsistent across pods/restarts.
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  if (!isIndexingEnabled()) {
    return new Response('Not Found', { status: 404 })
  }

  const publicUrl = getBaseUrlFromRequest(req)
  const now = new Date()

  // Important: In K8s ingress, `/docs/*` routes to the docs service.
  const sitemapUrls = [`${publicUrl}/sitemaps/app.xml`, `${publicUrl}/docs/sitemap.xml`]

  const body =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    sitemapUrls
      .map(loc => {
        return `  <sitemap><loc>${xmlEscape(loc)}</loc><lastmod>${xmlEscape(toIsoDate(now))}</lastmod></sitemap>\n`
      })
      .join('') +
    `</sitemapindex>\n`

  return new Response(body, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}
