#!/usr/bin/env node

/**
 * MCP HTTP Bridge Server
 * 
 * Standalone HTTP server that wraps MCP servers with HTTP endpoints.
 * This server is designed to run in Docker containers.
 */

const express = require('express');
// Try to load from compiled version first, fall back to TypeScript source
let MCPHttpBridge;
try {
  MCPHttpBridge = require('./lib/services/mcp/HttpBridge').MCPHttpBridge;
} catch (error) {
  // Development mode - load TypeScript directly
  try {
    require('ts-node/register');
    MCPHttpBridge = require('../../src/services/mcp/HttpBridge').MCPHttpBridge;
  } catch (tsError) {
    console.error('[Bridge] Failed to load HttpBridge module:', error.message);
    console.error('[Bridge] TypeScript fallback failed:', tsError.message);
    console.error('[Bridge] Please ensure the module is compiled or ts-node is available');
    process.exit(1);
  }
}

// Configuration from environment variables
const config = {
  mcpServerCmd: process.env.MCP_SERVER_CMD || 'npx',
  mcpServerArgs: (process.env.MCP_SERVER_ARGS || '').split(' ').filter(arg => arg.trim()),
  httpPort: parseInt(process.env.HTTP_PORT || '8080'),
  healthCheckTimeout: parseInt(process.env.HEALTH_CHECK_TIMEOUT || '10000'),
  logLevel: process.env.LOG_LEVEL || 'info',
  maxConcurrentRequests: parseInt(process.env.MAX_CONCURRENT_REQUESTS || '10'),
  environment: {}
};

// Extract environment variables for the MCP server
// All non-bridge environment variables are passed to the MCP server
const bridgeEnvVars = new Set([
  'MCP_SERVER_CMD',
  'MCP_SERVER_ARGS', 
  'HTTP_PORT',
  'HEALTH_CHECK_TIMEOUT',
  'LOG_LEVEL',
  'MAX_CONCURRENT_REQUESTS',
  'NODE_ENV',
  'PATH',
  'HOME',
  'USER'
]);

for (const [key, value] of Object.entries(process.env)) {
  if (!bridgeEnvVars.has(key)) {
    config.environment[key] = value;
  }
}

console.log(`[Bridge] Starting HTTP bridge server on port ${config.httpPort}`);
console.log(`[Bridge] MCP Server: ${config.mcpServerCmd} ${config.mcpServerArgs.join(' ')}`);
console.log(`[Bridge] Log Level: ${config.logLevel}`);
console.log(`[Bridge] Environment variables for MCP server: ${Object.keys(config.environment).length} vars`);

// Create Express app
const app = express();

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logging
if (config.logLevel === 'debug') {
  app.use((req, res, next) => {
    console.log(`[Bridge] ${req.method} ${req.path}`);
    next();
  });
}

// Create HTTP bridge instance
const bridge = new MCPHttpBridge(config);

// Health check endpoint (for Docker health checks)
app.get('/health', async (req, res) => {
  await bridge.healthCheck(req, res);
});

// Mount bridge routes
app.use('/', bridge.createRouter());

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('[Bridge] Unhandled error:', error);
  
  if (res.headersSent) {
    return next(error);
  }
  
  res.status(500).json({
    error: {
      code: -32603,
      message: 'Internal bridge error',
      type: 'bridge_error'
    },
    bridge_error: {
      message: error.message,
      stack: config.logLevel === 'debug' ? error.stack : undefined
    }
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: {
      code: -32601,
      message: `Method not found: ${req.method} ${req.path}`,
      type: 'method_not_found'
    }
  });
});

// Graceful shutdown handler
let server;
let isShuttingDown = false;

async function gracefulShutdown(signal) {
  if (isShuttingDown) {
    console.log(`[Bridge] Already shutting down, ignoring ${signal}`);
    return;
  }
  
  isShuttingDown = true;
  console.log(`[Bridge] Received ${signal}, starting graceful shutdown...`);
  
  try {
    // Stop accepting new connections
    if (server) {
      server.close(() => {
        console.log('[Bridge] HTTP server closed');
      });
    }
    
    // Stop MCP server
    await bridge.stopMCPServer();
    console.log('[Bridge] MCP server stopped');
    
    console.log('[Bridge] Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    console.error('[Bridge] Error during shutdown:', error);
    process.exit(1);
  }
}

// Handle shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('[Bridge] Uncaught exception:', error);
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Bridge] Unhandled rejection at:', promise, 'reason:', reason);
  gracefulShutdown('unhandledRejection');
});

// Handle bridge fatal errors
bridge.on('fatal-error', (error) => {
  console.error('[Bridge] Fatal MCP error:', error);
  gracefulShutdown('fatal-error');
});

// Start the server
async function startServer() {
  try {
    // Start MCP server first
    console.log('[Bridge] Starting MCP server...');
    await bridge.startMCPServer(config.environment);
    
    // Start HTTP server
    server = app.listen(config.httpPort, '0.0.0.0', () => {
      console.log(`[Bridge] HTTP bridge server running on http://0.0.0.0:${config.httpPort}`);
      console.log('[Bridge] Available endpoints:');
      console.log('  GET  /health         - Health check');
      console.log('  GET  /tools          - List available tools');  
      console.log('  POST /tools/{name}   - Execute tool');
      console.log('  GET  /resources      - List available resources');
      console.log('  GET  /resources/{uri} - Get resource');
      console.log('  POST /validate       - Validate configuration');
      console.log('  GET  /status         - Detailed status');
      console.log('  GET  /capabilities   - MCP capabilities');
      console.log('[Bridge] Ready to accept requests');
    });

    // Handle server errors
    server.on('error', (error) => {
      console.error('[Bridge] HTTP server error:', error);
      process.exit(1);
    });
    
  } catch (error) {
    console.error('[Bridge] Failed to start server:', error);
    process.exit(1);
  }
}

// Start the server
startServer().catch((error) => {
  console.error('[Bridge] Startup failed:', error);
  process.exit(1);
});