import type { MetadataRoute } from 'next'
import { isIndexingEnabled } from '@/lib/indexing'
import { publicEnvConfig } from '@starships/env/public';

export const revalidate = 3600 // 1 hour

export default function robots(): MetadataRoute.Robots {
  const publicUrl = publicEnvConfig.PUBLIC_URL.replace(/\/+$/, '')

  if (!isIndexingEnabled()) {
    return {
      rules: [{ userAgent: '*', disallow: '/' }],
      // Intentionally omit `sitemap` when indexing is disabled.
    }
  }

  return {
    rules: [{ userAgent: '*', allow: '/' }],
    sitemap: [`${publicUrl}/docs/sitemap.xml`],
  }
}


