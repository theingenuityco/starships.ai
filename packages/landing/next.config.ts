import { withSentryConfig } from '@sentry/nextjs'
import type { NextConfig } from 'next'
import { loadEnvConfig } from '@next/env'
import path from 'path'

// Load env from monorepo root for local dev
// In production (Docker/K8s), env vars are injected directly into process.env
const monorepoRoot = path.resolve(__dirname, '../..')
const isDev = process.env.NODE_ENV !== 'production'
loadEnvConfig(monorepoRoot, isDev)

const PUBLIC_HTML_CACHE_CONTROL = 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400'
const IMMUTABLE_STATIC = 'public, max-age=31536000, immutable'

const nextConfig: NextConfig = {
  typescript: {
    // Keep landing deployable even with type errors (matches current client config stance).
    ignoreBuildErrors: true,
  },
  experimental: {
    // Allow importing shared code from sibling packages (used during the split migration).
    externalDir: true,
    ...(process.env.CI ? { optimizePackageImports: ['@radix-ui/react-icons', '@iconify/react'] } : {}),
  },
  async headers() {
    return [
      // Security headers
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
      // Next build assets
      {
        source: '/_next/static/:path*',
        headers: [{ key: 'Cache-Control', value: IMMUTABLE_STATIC }],
      },
      // Public static assets we ship (e.g. OG images, favicons)
      {
        source: '/static-assets/:path*',
        headers: [{ key: 'Cache-Control', value: IMMUTABLE_STATIC }],
      },
      {
        source: '/favicons/:path*',
        headers: [{ key: 'Cache-Control', value: IMMUTABLE_STATIC }],
      },
      // Public pages (cache at edge; browsers revalidate)
      { source: '/', headers: [{ key: 'Cache-Control', value: PUBLIC_HTML_CACHE_CONTROL }] },
      { source: '/explore', headers: [{ key: 'Cache-Control', value: PUBLIC_HTML_CACHE_CONTROL }] },
      { source: '/explore/:path*', headers: [{ key: 'Cache-Control', value: PUBLIC_HTML_CACHE_CONTROL }] },
      { source: '/marketplace', headers: [{ key: 'Cache-Control', value: PUBLIC_HTML_CACHE_CONTROL }] },
      { source: '/privacy', headers: [{ key: 'Cache-Control', value: PUBLIC_HTML_CACHE_CONTROL }] },
      { source: '/terms', headers: [{ key: 'Cache-Control', value: PUBLIC_HTML_CACHE_CONTROL }] },
    ]
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        os: false,
        crypto: false,
        stream: false,
        assert: false,
        http: false,
        https: false,
        url: false,
        zlib: false,
        dotenv: false,
      }
    }
    return config
  },
}

export default withSentryConfig(nextConfig, {
  org: 'the-ingenuity-labs-inc',
  project: 'starships-landing',
  silent: !process.env.CI,
  widenClientFileUpload: true,
  disableLogger: true,
})

