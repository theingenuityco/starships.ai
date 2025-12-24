import type { MetadataRoute } from 'next'
import { isIndexingEnabled } from '@/lib/indexing'
import { publicEnvConfig } from '@starships/env/public'

export const revalidate = 3600 // 1 hour

export default function robots(): MetadataRoute.Robots {
  const publicUrl = publicEnvConfig.PUBLIC_URL.replace(/\/+$/, '')
  const indexingEnabled = isIndexingEnabled()

  if (!indexingEnabled) {
    return {
      rules: [{ userAgent: '*', disallow: '/' }],
      // Intentionally omit `sitemap` when indexing is disabled.
      host: publicUrl,
    }
  }

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          // Authenticated app area
          '/ship',
          '/profile',
          // Admin
          '/admin',
          // Next internals
          '/_next',
        ],
      },
    ],
    sitemap: [`${publicUrl}/sitemap.xml`, `${publicUrl}/docs/sitemap.xml`],
    host: publicUrl,
  }
}
