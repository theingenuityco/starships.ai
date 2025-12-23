import type { MetadataRoute } from 'next'
import { source } from '@/lib/source'
import { isIndexingEnabled } from '@/lib/indexing'
import { publicEnvConfig } from '@starships/env/public';

export const revalidate = 3600 // 1 hour

function normalizePublicUrl(value: string): string {
  return value.replace(/\/+$/, '')
}

function toAbsoluteUrl(publicUrl: string, path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`
  // Ensure all docs URLs live under `/docs` at the root domain.
  const fullPath = p.startsWith('/docs') ? p : `/docs${p === '/' ? '' : p}`
  return `${publicUrl}${fullPath}`
}

export default function sitemap(): MetadataRoute.Sitemap {
  if (!isIndexingEnabled()) return []

  const publicUrl = normalizePublicUrl(publicEnvConfig.PUBLIC_URL)
  const now = new Date()

  return source.getPages().map((page) => ({
    url: toAbsoluteUrl(publicUrl, page.url),
    lastModified: now,
    changeFrequency: 'weekly',
    priority: page.url === '/' ? 0.8 : 0.6,
  }))
}


