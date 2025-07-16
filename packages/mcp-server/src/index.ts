import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { MCPServer } from './server';
import { UserContainerManager } from './docker/UserContainerManager';
import { ToolRegistry } from './tools/ToolRegistry';
import { SecurityManager } from './security/SecurityManager';

// Load environment variables
dotenv.config();

const app = express();
const port = process.env.MCP_SERVER_PORT || 3002;

// Middleware
app.use(cors());
app.use(express.json());

// Initialize MCP components
const containerManager = new UserContainerManager();
const toolRegistry = new ToolRegistry();
const securityManager = new SecurityManager();
const mcpServer = new MCPServer(containerManager, toolRegistry, securityManager);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    version: '0.1.0'
  });
});

// MCP API endpoints
app.post('/api/mcp/configure', async (req, res) => {
  try {
    const result = await mcpServer.configureUserMCP(req.body);
    res.json(result);
  } catch (error) {
    console.error('MCP configuration error:', error);
    res.status(500).json({ 
      error: 'Failed to configure MCP',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

app.post('/api/mcp/tools/execute', async (req, res) => {
  try {
    const result = await mcpServer.executeToolCall(req.body);
    res.json(result);
  } catch (error) {
    console.error('Tool execution error:', error);
    res.status(500).json({ 
      error: 'Failed to execute tool',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

app.get('/api/mcp/status/:userId', async (req, res) => {
  try {
    const status = await mcpServer.getUserMCPStatus(req.params.userId);
    res.json(status);
  } catch (error) {
    console.error('Status check error:', error);
    res.status(500).json({ 
      error: 'Failed to get MCP status',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

app.get('/api/mcp/tools/:userId', async (req, res) => {
  try {
    const tools = await mcpServer.getUserAvailableTools(req.params.userId);
    res.json(tools);
  } catch (error) {
    console.error('Tools listing error:', error);
    res.status(500).json({ 
      error: 'Failed to list tools',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Start server
async function startServer() {
  try {
    await mcpServer.initialize();
    
    app.listen(port, () => {
      console.log(`🚀 MCP Server running on port ${port}`);
      console.log(`📊 Health check: http://localhost:${port}/health`);
    });
  } catch (error) {
    console.error('Failed to start MCP server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('🛑 Shutting down MCP server...');
  await mcpServer.shutdown();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('🛑 Shutting down MCP server...');
  await mcpServer.shutdown();
  process.exit(0);
});

startServer();