/**
 * Starships.ai - Aether Core Server
 * Main server entry point with enhanced repository pattern
 */

import express from 'express';
import cors from 'cors';
import getStore from './store';
import {
  AgentRepository,
  UserRepository,
  ChannelRepository,
  LLMRepository,
  StarshipRepository,
  CodexRepository,
  VisionRepository,
  ConstraintRepository,
  ConceptRepository,
  MetaAnchorRepository,
  createConnection
} from '@starships/models';

// Route imports
import agentRoutes from './routes/agents';
import chatRoutes from './routes/chat';
import memoryRoutes from './routes/memory';
import userRoutes from './routes/users';
import starshipRoutes, { initializeStarshipRoutes } from './routes/starships';
import redeployRoutes from './routes/redeploy';

const app: express.Application = express();
const PORT = process.env.PORT || 3001;

// Initialize Neo4j database connection
const dbConnection = createConnection({
  uri: process.env.NEO4J_URI || '[NEO4J-LOCAL-URL]',
  username: process.env.NEO4J_USERNAME || 'neo4j',
  [DEFAULT-PASSWORD]: process.env.NEO4J_PASSWORD || '[DEFAULT-PASSWORD]',
  database: process.env.NEO4J_DATABASE || 'neo4j'
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
const codexRepository = new CodexRepository();
const visionRepository = new VisionRepository();
const constraintRepository = new ConstraintRepository();
const conceptRepository = new ConceptRepository();
const metaAnchorRepository = new MetaAnchorRepository();

// Middleware
app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    version: 'aether-core-v1.0'
  });
});

// Initialize starship routes with dependencies
initializeStarshipRoutes({
  starshipRepository,
  agentRepository,
  codexRepository
});

// API Routes
app.use('/api/agents', agentRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/memory', memoryRoutes);
app.use('/api/users', userRoutes);
app.use('/api', starshipRoutes);
app.use('/api', redeployRoutes);

// Start server
app.listen(PORT, async () => {
  try {
    // Initialize database connection
    await dbConnection.connect();
    await dbConnection.initializeSchema();
    console.log('✅ Neo4j database connected and schema initialized');
  } catch (error) {
    console.error('❌ Failed to initialize database:', error);
    process.exit(1);
  }
  
  console.log(`🚀 Aether Core Server running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`🛸 Starships ready for launch!`);
});

export { app };
export default app; 