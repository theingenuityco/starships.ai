import { isIndexingEnabled } from '@/lib/indexing'
import { publicEnvConfig } from '@starships/env/public'

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, '')
}

function getConfiguredBaseUrl(): string {
  const configured = trimTrailingSlashes(String(publicEnvConfig.PUBLIC_URL || '').trim())
  return configured || 'https://starships.ai'
}

function getConfiguredDocsUrl(): string {
  const configured = trimTrailingSlashes(String(process.env.DOCS_URL || '').trim())
  return configured || 'https://docs.starships.ai'
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
export const dynamic = 'force-static'
export const revalidate = 86400 // 24 hours

export async function GET(_req: Request) {
  if (!isIndexingEnabled()) {
    return new Response('Not Found', { status: 404 })
  }

  const publicUrl = getConfiguredBaseUrl()
  const docsUrl = getConfiguredDocsUrl()
  const now = new Date()

  const sitemapUrls = [`${publicUrl}/sitemaps/app.xml`, `${docsUrl}/sitemap.xml`]

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
      'Cache-Control': 'public, max-age=0, s-maxage=86400, stale-while-revalidate=86400',
    },
  })
}
