import type { NextConfig } from 'next'
import { getServerConfig, getClientConfig } from '@starships/env-config'

// Load environment configuration using our centralized package
const serverEnv = getServerConfig()
const clientEnv = getClientConfig()

const nextConfig: NextConfig = {
  eslint: {
    // Warning: This allows production builds to successfully complete even if
    // your project has ESLint errors.
    ignoreDuringBuilds: true,
    // Use dirs to specify which directories to run ESLint on during next build
    dirs: ['src'],
  },
  typescript: {
    // Dangerously allow production builds to successfully complete even if
    // your project has type errors.
    ignoreBuildErrors: true,
  },
  async rewrites() {
    return [
      {
        // Proxy /v1/* requests to backend /api/* endpoints
        source: '/v1/:path*',
        destination: 'http://localhost:4000/api/:path*',
      },
    ]
  },
  webpack: (config, { isServer }) => {
    // Prevent Node.js modules from being bundled in the browser
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
        dotenv: false, // Prevent dotenv from client bundle
      }
    }
    return config
  },
  env: {
    // Kinde environment variables with dynamic defaults for deployment
    KINDE_CLIENT_ID: serverEnv.KINDE_CLIENT_ID,
    KINDE_CLIENT_SECRET: serverEnv.KINDE_CLIENT_SECRET,
    KINDE_ISSUER_URL: serverEnv.KINDE_ISSUER_URL,
    KINDE_SITE_URL: serverEnv.KINDE_SITE_URL ?? `https://${process.env.VERCEL_URL}`,
    KINDE_POST_LOGOUT_REDIRECT_URL:
      serverEnv.KINDE_POST_LOGOUT_REDIRECT_URL ?? `https://${process.env.VERCEL_URL}`,
    KINDE_POST_LOGIN_REDIRECT_URL:
      serverEnv.KINDE_POST_LOGIN_REDIRECT_URL ?? `https://${process.env.VERCEL_URL}`,
    KINDE_DEBUG_MODE: serverEnv.KINDE_DEBUG_MODE ? 'true' : 'false',
    // Public environment variables (exposed to browser)
    NEXT_PUBLIC_API_URL: clientEnv.NEXT_PUBLIC_API_URL,
  },
}

export default nextConfig
