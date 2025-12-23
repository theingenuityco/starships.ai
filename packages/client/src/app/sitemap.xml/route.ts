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
export const revalidate = 60 * 60 // 1 hour

export async function GET() {
  const publicUrl = (process.env.PUBLIC_URL || 'https://starships.ai').replace(/\/+$/, '')
  const now = new Date()

  // Important: In K8s ingress, `/docs/*` routes to the docs service.
  const sitemapUrls = [`${publicUrl}/sitemaps/client.xml`, `${publicUrl}/docs/sitemap.xml`]

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
      'Cache-Control': 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400',
    },
  })
}
