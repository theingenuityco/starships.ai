import type { MetadataRoute } from 'next'

export const revalidate = 60 * 60 // 1 hour

export default function robots(): MetadataRoute.Robots {
  const publicUrl = (process.env.PUBLIC_URL || 'https://starships.ai').replace(/\/+$/, '')

  return {
    rules: [{ userAgent: '*', allow: '/' }],
    sitemap: [`${publicUrl}/docs/sitemap.xml`],
  }
}


