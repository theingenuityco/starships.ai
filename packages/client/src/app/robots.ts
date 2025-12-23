import type { MetadataRoute } from 'next'

export const revalidate = 60 * 60 // 1 hour

export default function robots(): MetadataRoute.Robots {
  const publicUrl = (process.env.PUBLIC_URL || 'https://starships.ai').replace(/\/+$/, '')

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          // Auth/account flows
          '/login',
          '/forgot-password',
          '/reset-password',
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
