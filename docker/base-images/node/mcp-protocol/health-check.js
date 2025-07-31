#!/usr/bin/env node

/**
 * Health check utility for MCP servers
 * Provides standard health endpoint for Docker health checks
 */

const express = require('express');
const app = express();
const PORT = process.env.HEALTH_CHECK_PORT || 3000;

// Health check endpoint
app.get('/health', (req, res) => {
  try {
    // Basic health checks
    const healthStatus = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      pid: process.pid,
      version: process.env.MCP_PROTOCOL_VERSION || '1.0',
      environment: process.env.NODE_ENV || 'development'
    };

    // Additional MCP-specific checks could be added here
    // e.g., check if MCP server is responding to protocol messages

    res.status(200).json(healthStatus);
  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Ready check endpoint (for Kubernetes readiness probes)
app.get('/ready', (req, res) => {
  // More specific readiness checks can be added here
  res.status(200).json({
    status: 'ready',
    timestamp: new Date().toISOString()
  });
});

// Start health check server if this script is run directly
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Health check server running on port ${PORT}`);
  });
}

module.exports = app;