import { withSentryConfig } from '@sentry/nextjs'
import type { NextConfig } from 'next'
import { loadEnvConfig } from '@next/env'
import path from 'path'

// Load env from monorepo root for local dev
// In production (Docker/K8s), env vars are injected directly into process.env
const monorepoRoot = path.resolve(__dirname, '../..')
const isDev = process.env.NODE_ENV !== 'production'
loadEnvConfig(monorepoRoot, isDev)

const PRIVATE_NO_STORE = 'private, no-store'
const IMMUTABLE_STATIC = 'public, max-age=31536000, immutable'

const nextConfig: NextConfig = {
  typescript: {
    // Keep app deployable even with type errors (matches current client config stance).
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
      // Service worker
      {
        source: '/sw.js',
        headers: [
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Content-Security-Policy', value: "default-src 'self'; script-src 'self'" },
        ],
      },
      // Next build assets
      { source: '/_next/static/:path*', headers: [{ key: 'Cache-Control', value: IMMUTABLE_STATIC }] },
      // Public static assets we ship (icons, images, favicons)
      { source: '/static-assets/:path*', headers: [{ key: 'Cache-Control', value: IMMUTABLE_STATIC }] },
      { source: '/favicons/:path*', headers: [{ key: 'Cache-Control', value: IMMUTABLE_STATIC }] },

      // App HTML (never cache)
      { source: '/', headers: [{ key: 'Cache-Control', value: PRIVATE_NO_STORE }] },
      { source: '/ship/:path*', headers: [{ key: 'Cache-Control', value: PRIVATE_NO_STORE }] },
      { source: '/admin/:path*', headers: [{ key: 'Cache-Control', value: PRIVATE_NO_STORE }] },
      { source: '/account', headers: [{ key: 'Cache-Control', value: PRIVATE_NO_STORE }] },
      { source: '/onboarding', headers: [{ key: 'Cache-Control', value: PRIVATE_NO_STORE }] },
      { source: '/pwa', headers: [{ key: 'Cache-Control', value: PRIVATE_NO_STORE }] },
      { source: '/login', headers: [{ key: 'Cache-Control', value: PRIVATE_NO_STORE }] },
      { source: '/forgot-password', headers: [{ key: 'Cache-Control', value: PRIVATE_NO_STORE }] },
      { source: '/reset-password', headers: [{ key: 'Cache-Control', value: PRIVATE_NO_STORE }] },
      { source: '/accept-invite', headers: [{ key: 'Cache-Control', value: PRIVATE_NO_STORE }] },
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
  project: 'starships-app',
  silent: !process.env.CI,
  widenClientFileUpload: true,
  disableLogger: true,
})

