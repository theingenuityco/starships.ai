/**
 * Starships.ai - Aether Core Server
 * Main server entry point with enhanced repository pattern
 */

import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { initializeSocketIO } from './socket';
import getStore from './store';
import {
  AgentRepository,
  UserRepository,
  ChannelRepository,
  LLMRepository,
  StarshipRepository,
  VisionRepository,
  MCPServerOptionRepository,
  MCPServerConnectorRepository,
  ConnectorConfigTemplateRepository,
  ConnectorConfigHistoryRepository,
  RepositoryFactory,
  createConnection,
} from '@starships/models';
import { seedMCPServers } from '@starships/models/src/scripts/seed-mcp-servers';

// Route imports
import agentRoutes from './routes/agents';
import chatRoutes from './routes/chat';
import sibilRoutes from './routes/sibil';
import memoryRoutes from './routes/memory';
import userRoutes from './routes/users';
import starshipRoutes, { initializeStarshipRoutes } from './routes/starships';
import visionRoutes, { initializeVisionRoutes } from './routes/vision';
import mcpServerRoutes, { initializeMCPServerRoutes } from './routes/mcp-servers';
import redeployRoutes from './routes/redeploy';
import agentTemplateRoutes from './routes/agent-templates';
import expeditionRoutes from './routes/expeditions';
import { AgentService } from './services/AgentService';

// Import new error handling and health check routes
import { requestIdMiddleware, errorHandler, notFoundHandler } from './middleware/errorHandler';
import healthRoutes from './routes/health';
import { logger } from '@starships/models/src/logging';

/**
 * Validate required environment variables
 */
function validateEnvironmentVariables() {
  const requiredVars = [
    'CLIENT_URL',
    'NEXT_PUBLIC_API_URL'
  ];
  
  const missingVars = requiredVars.filter(varName => !process.env[varName]);
  
  if (missingVars.length > 0) {
    console.error('❌ Missing required environment variables:');
    missingVars.forEach(varName => {
      console.error(`   - ${varName}`);
    });
    console.error('');
    console.error('Please ensure these variables are set in your .env file.');
    console.error('You can copy .env.example to .env and fill in the values.');
    process.exit(1);
  }
  
  // Validate CLIENT_URL format
  const clientUrl = process.env.CLIENT_URL;
  if (clientUrl && !clientUrl.match(/^https?:\/\/.+/)) {
    console.error('❌ CLIENT_URL must be a valid HTTP/HTTPS URL');
    console.error(`   Current value: ${clientUrl}`);
    process.exit(1);
  }
  
  // Validate NEXT_PUBLIC_API_URL format
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (apiUrl && !apiUrl.match(/^https?:\/\/.+/)) {
    console.error('❌ NEXT_PUBLIC_API_URL must be a valid HTTP/HTTPS URL');
    console.error(`   Current value: ${apiUrl}`);
    process.exit(1);
  }
  
  console.log('✅ Environment variables validated successfully');
  console.log(`   CLIENT_URL: ${clientUrl}`);
  console.log(`   NEXT_PUBLIC_API_URL: ${apiUrl}`);
}

const app: express.Application = express();

// Initialize store and repositories
const store = getStore();

// Core repositories
const agentRepository = new AgentRepository();
const userRepository = new UserRepository();
const channelRepository = new ChannelRepository();
const llmRepository = new LLMRepository();

// Aether Core repositories - use proper dependency injection
const mcpServerConnectorRepository = new MCPServerConnectorRepository();
const connectorConfigTemplateRepository = new ConnectorConfigTemplateRepository();
const connectorConfigHistoryRepository = new ConnectorConfigHistoryRepository();
const mcpServerOptionRepository = new MCPServerOptionRepository();

// Aether Core repositories
const starshipRepository = new StarshipRepository();
const visionRepository = new VisionRepository();

// Middleware - Order is important!
app.use(cors());
app.use(express.json());

// Add error handling middleware
app.use(requestIdMiddleware);

// Health check routes (comprehensive)
app.use('/health', healthRoutes);

// Initialize starship routes with dependencies
initializeStarshipRoutes({
  starshipRepository,
  agentRepository,
  mcpServerOptionRepository,
  mcpServerConnectorRepository,
  connectorConfigTemplateRepository,
  connectorConfigHistoryRepository,
  visionRepository,
});

// Initialize vision routes with dependencies
initializeVisionRoutes({
  starshipRepository,
  visionRepository,
});

// Initialize MCP server routes with dependencies
initializeMCPServerRoutes({
  mcpServerOptionRepository,
});

// API Routes
app.use('/api/agents', agentRoutes);
app.use('/api/agent-templates', agentTemplateRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/sibil', sibilRoutes);
app.use('/api/memory', memoryRoutes);
app.use('/api/users', userRoutes);
app.use('/api', starshipRoutes);
app.use('/api', visionRoutes);
app.use('/api', mcpServerRoutes);
app.use('/api', expeditionRoutes);
app.use('/api', redeployRoutes);

// Add 404 handler for unmatched routes
app.use(notFoundHandler);

// Add centralized error handling middleware (must be last)
app.use(errorHandler());

export { app };
export default app;
