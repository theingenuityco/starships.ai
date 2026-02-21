import type { MetadataRoute } from 'next'
import { source } from '@/lib/source'
import { isIndexingEnabled } from '@/lib/indexing'
import { publicEnvConfig } from '@starships/env/public';

export const revalidate = 3600 // 1 hour
export const dynamic = 'force-dynamic'

function normalizePublicUrl(value: string): string {
  return value.replace(/\/+$/, '')
}

function getDocsBaseUrl(): string {
  const configured = String(process.env.DOCS_URL || '').trim()
  if (configured) return normalizePublicUrl(configured)
  // Fallback to PUBLIC_URL for legacy environments.
  return normalizePublicUrl(publicEnvConfig.PUBLIC_URL)
}

function toAbsoluteUrl(publicUrl: string, path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`
  return `${publicUrl}${p === '/' ? '' : p}`
}

export default function sitemap(): MetadataRoute.Sitemap {
  if (!isIndexingEnabled()) return []

  const publicUrl = getDocsBaseUrl()
  const now = new Date()

  return source.getPages().map((page) => ({
    url: toAbsoluteUrl(publicUrl, page.url),
    lastModified: now,
    changeFrequency: 'weekly',
    priority: page.url === '/' ? 0.8 : 0.6,
  }))
}


