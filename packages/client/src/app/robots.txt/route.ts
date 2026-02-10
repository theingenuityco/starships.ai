import { isIndexingEnabled } from '@/lib/indexing'
import { getPublicEnvConfig } from '@starships/env/public'

export const dynamic = 'force-dynamic'

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, '')
}

function firstHeaderValue(value: string | null): string {
  return String(value || '')
    .split(',')[0]
    ?.trim()
}

function getBaseUrlFromRequest(req: Request, configuredPublicUrl: string): string {
  const configured = trimTrailingSlashes(String(configuredPublicUrl || '').trim())
  if (configured) return configured

  const host = firstHeaderValue(req.headers.get('x-forwarded-host')) || firstHeaderValue(req.headers.get('host'))
  if (!host) return ''

  const proto = firstHeaderValue(req.headers.get('x-forwarded-proto')) || 'https'
  return trimTrailingSlashes(`${proto}://${host}`)
}

function toRobotsTxt(lines: string[]): string {
  return `${lines.join('\n')}\n`
}

export async function GET(req: Request): Promise<Response> {
  const { PUBLIC_URL } = getPublicEnvConfig()
  const publicUrl = getBaseUrlFromRequest(req, PUBLIC_URL)
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
      'Disallow: /account',
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
