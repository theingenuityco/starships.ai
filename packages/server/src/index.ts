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
  RepositoryFactory,
  createConnection,
} from '@starships/models';

// Route imports
import agentRoutes from './routes/agents';
import chatRoutes from './routes/chat';
import sibilRoutes from './routes/sibil';
import memoryRoutes from './routes/memory';
import userRoutes from './routes/users';
import starshipRoutes, { initializeStarshipRoutes } from './routes/starships';
import visionRoutes, { initializeVisionRoutes } from './routes/vision';
import redeployRoutes from './routes/redeploy';
import agentTemplateRoutes from './routes/agent-templates';
import { AgentService } from './services/AgentService';

const app: express.Application = express();
const PORT = process.env.PORT || 3001;

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

// Aether Core repositories
const starshipRepository = new StarshipRepository();
const visionRepository = new VisionRepository();

// Middleware
app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: 'aether-core-v1.0',
  });
});

// Database health check
app.get('/health/db', async (req, res) => {
  try {
    const agentRepo = RepositoryFactory.getAgentRepository();
    const agentCount = await agentRepo.findAll().then((agents) => agents.length);
    res.json({
      status: 'healthy',
      database: 'connected',
      agentCount,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Database health check failed:', error);
    res.status(500).json({
      status: 'unhealthy',
      database: 'disconnected',
      error: error?.message || 'Unknown database error',
      timestamp: new Date().toISOString(),
    });
  }
});

// Initialize starship routes with dependencies
initializeStarshipRoutes({
  starshipRepository,
  agentRepository,
  visionRepository,
});

// Initialize vision routes with dependencies
initializeVisionRoutes({
  starshipRepository,
  visionRepository,
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
app.use('/api', redeployRoutes);

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
    const templateService = RepositoryFactory.getAgentTemplateService();
    await templateService.seedDefaultTemplates();
    console.log('✅ AgentTemplateService initialized with default templates');

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
