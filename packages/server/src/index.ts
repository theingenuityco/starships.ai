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

const app: express.Application = express();
const PORT = process.env.PORT || 3001;

// Initialize Neo4j database connection
const dbConnection = createConnection({
  uri: process.env.NEO4J_URI || '[NEO4J-LOCAL-URL]',
  username: process.env.NEO4J_USERNAME || 'neo4j',
  [DEFAULT-PASSWORD]: process.env.NEO4J_PASSWORD || '[DEFAULT-PASSWORD]',
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

// Create HTTP server and initialize Socket.IO
const httpServer = createServer(app);

// Initialize Socket.IO
const socketService = initializeSocketIO(httpServer);

// Start server
httpServer.listen(PORT, async () => {
  try {
    // Initialize database connection
    await dbConnection.connect();
    await dbConnection.initializeSchema();
    console.log('✅ Neo4j database connected and schema initialized');
    // Initialize AgentService (seeds default agents)
    await AgentService.initialize();
    console.log('✅ AgentService initialized with default agents');

    // Initialize AgentTemplateService (seeds default templates)
    const templateService = await RepositoryFactory.getAgentTemplateService();
    await templateService.seedDefaultTemplates();
    console.log('✅ AgentTemplateService initialized with default templates');

    // Initialize MCP Server Options (seeds default connectors)
    await seedMCPServers();
    console.log('✅ MCP Server Options initialized with default connectors');

    // Initialize MCPServerConnectorRepository (validate schema and constraints)
    try {
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
