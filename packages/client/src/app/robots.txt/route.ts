import { isIndexingEnabled } from '@/lib/indexing'
import { publicEnvConfig } from '@starships/env/public'

export const dynamic = 'force-static'
export const revalidate = 86400 // 24 hours

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, '')
}

function toRobotsTxt(lines: string[]): string {
  return `${lines.join('\n')}\n`
}

function getConfiguredPublicUrl(): string {
  const configured = trimTrailingSlashes(String(publicEnvConfig.PUBLIC_URL || '').trim())
  return configured || 'https://starships.ai'
}

function getConfiguredDocsUrl(): string {
  const configured = trimTrailingSlashes(String(process.env.DOCS_URL || '').trim())
  return configured || 'https://docs.starships.ai'
}

export async function GET(_req: Request): Promise<Response> {
  const publicUrl = getConfiguredPublicUrl()
  const docsUrl = getConfiguredDocsUrl()
  const indexingEnabled = isIndexingEnabled()

  // Default OFF for safety; enable explicitly per environment.
  if (!indexingEnabled) {
    return new Response(toRobotsTxt(['User-agent: *', 'Disallow: /', `Host: ${publicUrl}`]), {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'public, max-age=0, s-maxage=86400, stale-while-revalidate=86400',
      },
    })
  }

  return new Response(
    toRobotsTxt([
      'User-agent: *',
      'Allow: /',
      // Authenticated app area
      'Disallow: /ship',
      'Disallow: /account',
      // Admin
      'Disallow: /admin',
      // Next internals
      'Disallow: /_next',
      `Sitemap: ${publicUrl}/sitemap.xml`,
      `Sitemap: ${docsUrl}/sitemap.xml`,
      `Host: ${publicUrl}`,
    ]),
    {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'public, max-age=0, s-maxage=86400, stale-while-revalidate=86400',
      },
    }
  )
}
