import type { NextConfig } from 'next'
import { getServerConfig, getClientConfig } from '@starships/env-config'

// Load environment configuration using our centralized package
const serverEnv = getServerConfig()
const clientEnv = getClientConfig()

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        // Proxy /v1/* requests to backend /api/* endpoints
        source: '/v1/:path*',
        destination: 'http://localhost:4000/api/:path*'
      }
    ]
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
  }
}

export default nextConfig