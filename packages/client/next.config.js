/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        // Proxy specific API endpoints to backend, excluding auth
        source: '/api/v1/:path*',
        destination: 'http://localhost:4000/v1/:path*'
      }
    ]
  },
  env: {
    // Kinde environment variables with dynamic defaults for deployment
    KINDE_SITE_URL: process.env.KINDE_SITE_URL ?? `https://${process.env.VERCEL_URL}`,
    KINDE_POST_LOGOUT_REDIRECT_URL:
      process.env.KINDE_POST_LOGOUT_REDIRECT_URL ?? `https://${process.env.VERCEL_URL}`,
    KINDE_POST_LOGIN_REDIRECT_URL:
      process.env.KINDE_POST_LOGIN_REDIRECT_URL ?? `https://${process.env.VERCEL_URL}`
  }
}

module.exports = nextConfig 