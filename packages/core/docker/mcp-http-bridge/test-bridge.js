#!/usr/bin/env node

/**
 * Test script for MCP HTTP Bridge
 * Tests the bridge locally without Docker
 */

const path = require('path');

// Set up environment for testing
process.env.MCP_SERVER_CMD = 'echo';
process.env.MCP_SERVER_ARGS = '{"jsonrpc":"2.0","id":1,"result":{"capabilities":{},"protocolVersion":"2024-11-05"}}';
process.env.HTTP_PORT = '8081';
process.env.LOG_LEVEL = 'debug';

console.log('Testing MCP HTTP Bridge locally...');
console.log('This will start a test server on port 8081');

// Install ts-node for development testing
try {
  require('ts-node/register');
  console.log('✅ TypeScript support loaded');
} catch (error) {
  console.error('❌ ts-node not available, bridge may not work in development mode');
  console.error('Install with: npm install -g ts-node');
  process.exit(1);
}

// Start the server
require('./server.js');