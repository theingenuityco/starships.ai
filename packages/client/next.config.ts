import type { NextConfig } from 'next'
import { getServerConfig } from '@starships/env-config'

// Load client configuration for public variables
const s = getServerConfig()

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
    console.log(s)
    console.log(process.env)
    return [
      {
        // rewrite /api/* requests to backend /api/* endpoints
        source: '/api/:path*',
        destination: `${s.SERVER_URL}/api/:path*`,
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
}

export default nextConfig
