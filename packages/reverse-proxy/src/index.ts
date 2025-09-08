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

// Proxy options for backend API routes
const apiProxyOptions: Options = {
  target: BACKEND_URL,
  changeOrigin: true,
  ws: true, // Enable WebSocket support
  logger: console,
  on: {
    proxyReq: (proxyReq, req) => {
      console.log(`[API] ${req.method} ${req.url} -> ${BACKEND_URL}${req.url}`);
    },
    error: (err, req) => {
      console.error(`[API Error] ${req.method} ${req.url}:`, err.message);
    },
  },
};

// Proxy options for frontend routes
const frontendProxyOptions: Options = {
  target: FRONTEND_URL,
  changeOrigin: true,
  ws: true, // Enable WebSocket support for Next.js HMR
  logger: console,
  on: {
    proxyReq: (proxyReq, req) => {
      // Don't log Next.js HMR requests to reduce noise
      if (!req.url?.includes('_next/webpack-hmr')) {
        console.log(`[Frontend] ${req.method} ${req.url} -> ${FRONTEND_URL}${req.url}`);
      }
    },
    error: (err, req) => {
      console.error(`[Frontend Error] ${req.method} ${req.url}:`, err.message);
    },
  },
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
    },
  });
});

// Route /api/* requests to backend
app.use('/api', createProxyMiddleware(apiProxyOptions));

// Route everything else to frontend
app.use('/', createProxyMiddleware(frontendProxyOptions));

// Start the proxy server
const server = app.listen(PORT, () => {
  console.log(`
🚀 Reverse Proxy Server Started
================================
Proxy Port:    ${PORT}
Frontend URL:  ${FRONTEND_URL}
Backend URL:   ${BACKEND_URL}
Health Check:  http://localhost:${PORT}/_proxy/health

Routes:
  /api/*  →  ${BACKEND_URL}
  /*      →  ${FRONTEND_URL}
================================
  `);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('\n📭 SIGTERM signal received: closing proxy server');
  server.close(() => {
    console.log('Proxy server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('\n📭 SIGINT signal received: closing proxy server');
  server.close(() => {
    console.log('Proxy server closed');
    process.exit(0);
  });
});
