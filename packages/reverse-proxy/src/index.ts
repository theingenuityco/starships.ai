import { getEnvConfig } from '@starships/env'
import express from 'express'
import { createProxyMiddleware, Options } from 'http-proxy-middleware'

const app = express()

// Get environment configuration
const envConfig = getEnvConfig()

// Configuration
const PORT = envConfig.PROXY_PORT
const LANDING_URL = envConfig.LANDING_UPSTREAM_URL
const APP_URL = envConfig.APP_UPSTREAM_URL
const BACKEND_URL = envConfig.SERVER_URL
const DOCS_URL = envConfig.DOCS_URL

function normalizeHost(raw: unknown): string {
  const v = String(raw || '')
    .trim()
    .toLowerCase()
  if (!v) return ''
  return v.includes(':') ? v.split(':')[0] : v
}

function isAppHost(rawHost: unknown): boolean {
  const host = normalizeHost(rawHost)
  return host === 'app.starships.ai' || host === 'app.localhost' || host.startsWith('app.')
}

// Proxy options for backend API routes
const apiProxyOptions: Options = {
  target: BACKEND_URL,
  changeOrigin: true,
  ws: true, // Enable WebSocket support
  pathFilter: '/api',
}

// Proxy options for docs routes
const docsProxyOptions: Options = {
  target: DOCS_URL,
  changeOrigin: true,
  ws: true, // Enable WebSocket support for Next.js HMR
  pathFilter: '/docs', // Match paths starting with /docs
}

// Proxy options for frontend routes
const frontendProxyOptions: Options = {
  target: LANDING_URL,
  changeOrigin: true,
  ws: true, // Enable WebSocket support for Next.js HMR
  pathFilter: (path: string) => !path.startsWith('/api') && !path.startsWith('/docs'), // Everything except /api and /docs
  router: (req) => {
    return isAppHost(req.headers.host) ? APP_URL : LANDING_URL
  },
}

// Health check endpoint for the proxy itself
app.get('/_proxy/health', (req, res) => {
  res.json({
    status: 'ok',
  })
})

// Create proxy middlewares
const apiProxy = createProxyMiddleware(apiProxyOptions);
const docsProxy = createProxyMiddleware(docsProxyOptions);
const frontendProxy = createProxyMiddleware(frontendProxyOptions);

// Apply proxies - order matters!
app.use(docsProxy) // /docs/* → docs (includes /docs/api/*)
app.use(apiProxy) // /api/* → backend
app.use(frontendProxy) // everything else → landing/app (by Host header)

// Start the proxy server
const server = app.listen(PORT, () => {
  console.log(`
🚀 Reverse Proxy Server Started
================================
Proxy Port:     ${PORT}
Landing URL:    ${LANDING_URL}
App URL:        ${APP_URL}
Backend URL:    ${BACKEND_URL}
Docs URL:       ${DOCS_URL}
Health Check:   http://localhost:${PORT}/_proxy/health

Routes:
  Host=starships.ai     /*     →  ${LANDING_URL}
  Host=app.starships.ai /*     →  ${APP_URL}
  /docs/*                      →  ${DOCS_URL}/docs/*
  /api/*                       →  ${BACKEND_URL}/api/*
================================
  `)
})

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('\n📭 SIGTERM signal received: closing proxy server')
  server.close(() => {
    process.exit(0)
  })
})

process.on('SIGINT', () => {
  console.log('\n📭 SIGINT signal received: closing proxy server')
  server.close(() => {
    process.exit(0)
  })
})
