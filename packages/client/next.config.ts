import type { NextConfig } from 'next'
import { getClientConfig } from '@starships/env-config'

// Load client configuration for public variables
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
  // DON'T set server-side env vars here - Next.js automatically provides them at runtime
  // The env config is ONLY for:
  // 1. Client-side variables (NEXT_PUBLIC_*)
  // 2. Providing build-time defaults
  env: {
    // Public environment variables (exposed to browser)
    NEXT_PUBLIC_API_URL: clientEnv.NEXT_PUBLIC_API_URL,
  },
}

export default nextConfig
