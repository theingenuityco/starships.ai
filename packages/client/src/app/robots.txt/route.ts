import { isIndexingEnabled } from '@/lib/indexing'
import { getPublicEnvConfig } from '@starships/env/public'

export const dynamic = 'force-dynamic'

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, '')
}

function toRobotsTxt(lines: string[]): string {
  return `${lines.join('\n')}\n`
}

export async function GET(): Promise<Response> {
  const { PUBLIC_URL } = getPublicEnvConfig()
  const publicUrl = trimTrailingSlashes(PUBLIC_URL)
  const indexingEnabled = isIndexingEnabled()

  // Default OFF for safety; enable explicitly per environment.
  if (!indexingEnabled) {
    return new Response(toRobotsTxt(['User-agent: *', 'Disallow: /', `Host: ${publicUrl}`]), {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        // Avoid CDN/edge caching surprises when toggling indexing.
        'Cache-Control': 'no-store',
      },
    })
  }

  return new Response(
    toRobotsTxt([
      'User-agent: *',
      'Allow: /',
      // Authenticated app area
      'Disallow: /ship',
      'Disallow: /profile',
      // Admin
      'Disallow: /admin',
      // Next internals
      'Disallow: /_next',
      `Sitemap: ${publicUrl}/sitemap.xml`,
      `Sitemap: ${publicUrl}/docs/sitemap.xml`,
      `Host: ${publicUrl}`,
    ]),
    {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        // Avoid CDN/edge caching surprises when toggling indexing.
        'Cache-Control': 'no-store',
      },
    }
  )
}
