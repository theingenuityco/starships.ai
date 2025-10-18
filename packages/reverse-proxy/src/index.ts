import { getEnvConfig } from '@starships/env';
import express from 'express';
import { createProxyMiddleware, Options } from 'http-proxy-middleware';

const app = express();

// Get environment configuration
const envConfig = getEnvConfig();

// Configuration
const PORT = envConfig.PROXY_PORT;
const FRONTEND_URL = envConfig.CLIENT_URL;
const BACKEND_URL = envConfig.SERVER_URL;
const DOCS_URL = envConfig.DOCS_URL;

// Proxy options for backend API routes
const apiProxyOptions: Options = {
  target: BACKEND_URL,
  changeOrigin: true,
  ws: true, // Enable WebSocket support
  pathFilter: '/api', // Match paths starting with /api
};

// Proxy options for docs routes
const docsProxyOptions: Options = {
  target: DOCS_URL,
  changeOrigin: true,
  ws: true, // Enable WebSocket support for Next.js HMR
  pathFilter: '/docs', // Match paths starting with /docs
};

// Proxy options for frontend routes
const frontendProxyOptions: Options = {
  target: FRONTEND_URL,
  changeOrigin: true,
  ws: true, // Enable WebSocket support for Next.js HMR
  pathFilter: (path: string) => !path.startsWith('/api') && !path.startsWith('/docs'), // Everything except /api and /docs
};

// Health check endpoint for the proxy itself
app.get('/_proxy/health', (req, res) => {
  res.json({
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    routes: {
      frontend: FRONTEND_URL,
      backend: BACKEND_URL,
      docs: DOCS_URL,
    },
  });
});

// Create proxy middlewares
const apiProxy = createProxyMiddleware(apiProxyOptions);
const docsProxy = createProxyMiddleware(docsProxyOptions);
const frontendProxy = createProxyMiddleware(frontendProxyOptions);

// Apply proxies - order matters!
app.use(apiProxy); // Will only proxy requests matching pathFilter: '/api'
app.use(docsProxy); // Will only proxy requests matching pathFilter: '/docs'
app.use(frontendProxy); // Will proxy everything else

// Start the proxy server
const server = app.listen(PORT, () => {
  console.log(`
🚀 Reverse Proxy Server Started
================================
Proxy Port:    ${PORT}
Frontend URL:  ${FRONTEND_URL}
Backend URL:   ${BACKEND_URL}
Docs URL:      ${DOCS_URL}
Health Check:  http://localhost:${PORT}/_proxy/health

Routes:
  /api/*   →  ${BACKEND_URL}/api/*
  /docs/*  →  ${DOCS_URL}/docs/*
  /*       →  ${FRONTEND_URL}
================================
  `);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('\n📭 SIGTERM signal received: closing proxy server');
  server.close(() => {
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('\n📭 SIGINT signal received: closing proxy server');
  server.close(() => {
    process.exit(0);
  });
});
