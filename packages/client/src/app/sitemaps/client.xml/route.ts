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

export const revalidate = 60 * 60 // 1 hour

/**
 * Client app sitemap (public-facing pages only).
 *
 * Note: authenticated app routes like `/ship/*` are intentionally excluded.
 */
export async function GET() {
  const base = normalizeSiteUrl(process.env.PUBLIC_URL || 'https://starships.ai')
  const now = new Date()

  const urls: UrlEntry[] = [
    { path: '/', changefreq: 'weekly', priority: 1.0, lastmod: now },
    { path: '/marketplace', changefreq: 'daily', priority: 0.8, lastmod: now },
    { path: '/docs', changefreq: 'weekly', priority: 0.6, lastmod: now },
    { path: '/privacy', changefreq: 'yearly', priority: 0.3, lastmod: now },
    { path: '/terms', changefreq: 'yearly', priority: 0.3, lastmod: now },
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
      'Cache-Control': 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400',
    },
  })
}
