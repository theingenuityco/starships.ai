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

// Proxy options for app frontend routes (mounted at /app in local dev)
const appProxyOptions: Options = {
  target: APP_URL,
  changeOrigin: true,
  ws: true, // Enable WebSocket support for Next.js HMR
  pathFilter: '/app',
}

// Proxy options for landing frontend routes
const landingProxyOptions: Options = {
  target: LANDING_URL,
  changeOrigin: true,
  ws: true,
  pathFilter: (path: string) => !path.startsWith('/api') && !path.startsWith('/docs') && !path.startsWith('/app'),
}

// Health check endpoint for the proxy itself
app.get('/_proxy/health', (req, res) => {
  res.json({
    status: 'ok',
  })
})

// Create proxy middlewares
const apiProxy = createProxyMiddleware(apiProxyOptions)
const docsProxy = createProxyMiddleware(docsProxyOptions)
const appProxy = createProxyMiddleware(appProxyOptions)
const landingProxy = createProxyMiddleware(landingProxyOptions)

// Apply proxies - order matters!
app.use(docsProxy) // /docs/* → docs (includes /docs/api/*)
app.use(apiProxy) // /api/* → backend
app.use(appProxy) // /app/* → app
app.use(landingProxy) // everything else → landing

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
  /app/*                       →  ${APP_URL}
  /docs/*                      →  ${DOCS_URL}/docs/*
  /api/*                       →  ${BACKEND_URL}/api/*
  /*                           →  ${LANDING_URL}
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
