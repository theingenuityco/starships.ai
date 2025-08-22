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
import { seedMCPServers, seedLLMModels, ensureDockerImages } from '@starships/models';

// Route imports
import agentRoutes from './routes/agents';
import chatRoutes from './routes/chat';
import sibilRoutes from './routes/sibil';
import memoryRoutes from './routes/memory';
import userRoutes from './routes/users';
import starshipRoutes, { initializeStarshipRoutes } from './routes/starships';
import starshipEnhancedRoutes, { initializeEnhancedStarshipRoutes } from './routes/starships-enhanced';
import visionRoutes, { initializeVisionRoutes } from './routes/vision';
import mcpServerRoutes, { initializeMCPServerRoutes } from './routes/mcp-servers';
import redeployRoutes from './routes/redeploy';
import agentTemplateRoutes from './routes/agent-templates';
// import expeditionRoutes from './routes/expeditions';
import missionRoutes from './routes/missions';
import nativeApiKeysRoutes from './routes/native-api-keys';
import { AgentService } from './services/AgentService';
import webhookRoutes, { initializeWebhookRoutes } from './routes/webhooks';

// Import new error handling and health check routes
import { requestIdMiddleware, errorHandler, notFoundHandler } from './middleware/errorHandler';
import healthRoutes from './routes/health';
import { logger } from '@starships/models/src/logging';

// Import Docker deployment routes
import { createDeploymentApiRoutes } from '@starships/core';
import { authMiddleware } from './middleware/auth';

// Import K8s initialization
import { initializeK8sEnvironment, getDeployerType } from '@starships/core/dist/services/k8s/init';

/**
 * Validate required environment variables
 */
function validateEnvironmentVariables() {
  const requiredVars = [
    'CLIENT_URL',
    'NEXT_PUBLIC_API_URL',
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
const PORT = process.env.PORT || 3001;

// Validate environment variables before starting server
validateEnvironmentVariables();

// Initialize Neo4j database connection
const dbConnection = createConnection({
  uri: process.env.NEO4J_URI || 'bolt://localhost:7687',
  username: process.env.NEO4J_USERNAME || 'neo4j',
  password: process.env.NEO4J_PASSWORD || 'password',
  database: process.env.NEO4J_DATABASE || 'neo4j',
});

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
// const codexRepository = new CodexRepository();
// const constraintRepository = new ConstraintRepository();
// const conceptRepository = new ConceptRepository();
// const metaAnchorRepository = new MetaAnchorRepository();
const mcpServerOptionRepository = new MCPServerOptionRepository();

// Aether Core repositories
const starshipRepository = new StarshipRepository();
const visionRepository = new VisionRepository();
// Middleware - Order is important!
app.use(cors());
app.use('/webhooks', express.raw({ type: 'application/json' }), webhookRoutes);
app.use(express.json());

// Add error handling middleware
app.use(requestIdMiddleware);

// Health check routes (comprehensive)
app.use('/health', healthRoutes);

// ## !CONFLICT - TS ERROR FROM CONFLICT RESOLUTION
// Initialize starship routes with dependencies
initializeStarshipRoutes({
  starshipRepository,
  agentRepository,
  userRepository,
  mcpServerOptionRepository,
  mcpServerConnectorRepository,
  connectorConfigTemplateRepository,
  connectorConfigHistoryRepository,
  visionRepository,
});

// Initialize webhook routes with dependencies
initializeWebhookRoutes({
  starshipRepository,
});

// Initialize vision routes with dependencies
initializeVisionRoutes({
  starshipRepository,
  visionRepository,
});

// Initialize enhanced starship routes with dependencies (for vision onboarding)
initializeEnhancedStarshipRoutes({
  starshipRepository,
  visionRepository,
});

// Initialize MCP server routes with dependencies
initializeMCPServerRoutes({
  mcpServerOptionRepository,
});

// Create Docker deployment routes with enhanced MCP connector management
const deploymentRoutes = createDeploymentApiRoutes({
  starshipRepo: starshipRepository,
  mcpConnectorRepo: mcpServerConnectorRepository,
  mcpServerOptionRepo: mcpServerOptionRepository,
  enableDockerDeployment: true,
  authMiddleware
});

// Public pricing endpoint - must be before auth-protected routes
app.get('/api/starships/pricing', async (req, res) => {
  try {
    const { SubscriptionService } = await import('./services/SubscriptionService');
    const subscriptionService = new SubscriptionService(userRepository, starshipRepository);
    const pricing = await subscriptionService.getPricingData();
    res.json(pricing);
  } catch (error) {
    console.error('Failed to fetch pricing:', error);
    res.status(500).json({ error: 'Failed to fetch pricing' });
  }
});

// API Routes
app.use('/api/agents', agentRoutes);
app.use('/api/agent-templates', agentTemplateRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/sibil', sibilRoutes);
app.use('/api/memory', memoryRoutes);
app.use('/api/users', userRoutes);
app.use('/api', deploymentRoutes); // Enhanced MCP connector routes with Docker deployment (PRIORITY)
app.use('/api', starshipRoutes);
app.use('/api', starshipEnhancedRoutes); // Enhanced starship routes with vision support
app.use('/api', visionRoutes);
app.use('/api', mcpServerRoutes);
// app.use('/api', expeditionRoutes);
app.use('/api', redeployRoutes);
app.use('/api/missions', missionRoutes);
app.use('/api', nativeApiKeysRoutes);

// Add 404 handler for unmatched routes
app.use(notFoundHandler);

// Add centralized error handling middleware (must be last)
app.use(errorHandler());

// Create HTTP server and initialize Socket.IO
const httpServer = createServer(app);

// Initialize Socket.IO
const socketService = initializeSocketIO(httpServer);

// Start server
httpServer.listen(PORT, async () => {
  try {
    // Check if we should skip K8s initialization (dev mode)
    if (process.env.SKIP_K8S_CHECK === 'true') {
      console.log('⚡ Skipping Kubernetes initialization (SKIP_K8S_CHECK=true)');
      console.log('🚢 Using mock deployer for MCP containers in development mode');
      process.env.K8S_AVAILABLE = 'false';
    } else {
      // Initialize Kubernetes environment (required for production/staging)
      const k8sReady = await initializeK8sEnvironment({
        skipSetup: process.env.SKIP_K8S_SETUP === 'true',
        requireCluster: true, // K8s is required now
        environment: process.env.NODE_ENV as 'development' | 'staging' | 'production'
      });
      
      if (!k8sReady) {
        console.error('❌ Kubernetes environment is required for MCP deployment');
        console.error('   Please ensure Docker Desktop is running and try again');
        console.error('   Or run: pnpm run k8s:setup');
        process.exit(1);
      }
      
      const deployerType = getDeployerType();
      console.log(`🚢 Using ${deployerType} deployer for MCP containers`);
      process.env.K8S_AVAILABLE = 'true';
    }
    
    // Initialize database connection
    await dbConnection.connect();
    await dbConnection.initializeSchema();
    console.log('✅ Neo4j database connected and schema initialized');
    
    // Initialize RepositoryFactory BEFORE any socket connections
    console.log('🔧 Initializing RepositoryFactory...');
    await RepositoryFactory.initialize();
    console.log('✅ RepositoryFactory initialized - all repositories ready for socket operations');
    
    // Ensure required Docker images are available
    await ensureDockerImages();
    console.log('✅ Docker images check completed');
    
    // AgentService no longer needs initialization - agents are created per starship
    // await AgentService.initialize();
    // console.log('✅ AgentService initialized with default agents');

    // Initialize AgentTemplateService (seeds default templates)
    const templateService = RepositoryFactory.getAgentTemplateService();
    if (templateService) {
      await templateService.seedDefaultTemplates();
      console.log('✅ AgentTemplateService initialized with default templates');
    } else {
      console.warn('⚠️ AgentTemplateService not available - database connection may be unavailable');
    }

    // Initialize MCP Server Options (seeds default connectors)
    await seedMCPServers();
    console.log('✅ MCP Server Options initialized with default connectors');
    
    // Initialize LLM Models (seeds default models)
    await seedLLMModels();
    console.log('✅ LLM Models initialized with default models');

    // Initialize MCPServerConnectorRepository (validate schema and constraints)
    try {
      console.log('🔄 Checking for missing servers to add...');
      const connectorCount = await mcpServerConnectorRepository
        .findAll()
        .then((connectors) => connectors.length);
      console.log(
        `✅ MCPServerConnectorRepository initialized with ${connectorCount} existing connector instances`
      );
    } catch (error) {
      console.error('❌ Failed to initialize MCPServerConnectorRepository:', error);
      // Don't exit - this is not critical for server startup
    }

    // Log Socket.IO status
    console.log('✅ Socket.IO server initialized');
    console.log(`📡 WebSocket connections: ${socketService.getConnectedUsersCount()}`);
  } catch (error) {
    console.error('❌ Failed to initialize database:', error);
    process.exit(1);
  }

  console.log(`🚀 Aether Core Server running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`🔌 Socket.IO: ws://localhost:${PORT}`);
  console.log(`🛸 Starships ready for launch!`);
});

export { app };
export default app;
