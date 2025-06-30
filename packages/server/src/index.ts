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
  GoalRepository,
  ConstraintRepository,
  ConceptRepository,
  MetaAnchorRepository
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
const goalRepository = new GoalRepository();
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
app.listen(PORT, () => {
  console.log(`🚀 Aether Core Server running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`🛸 Starships ready for launch!`);
});

export { app };
export default app; 