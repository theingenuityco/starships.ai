/**
 * Starships.ai - Aether Core Server
 * Main server entry point with enhanced repository pattern
 */

import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { createServer } from 'http';
import { initializeSocketIO } from './socket';
import getStore from './store';
import {
  AgentRepository,
  UserRepository,
  LLMRepository,
  StarshipRepository,
  VisionRepository,
  RepositoryFactory,
  createConnection,
} from '@starships/models';
import { migrationRunner, seedWaitlist } from '@starships/models';

// Route imports
import agentRoutes from './routes/agents';
import chatRoutes from './routes/chat';
import sibilRoutes from './routes/sibil';
import memoryRoutes from './routes/memory';
import userRoutes from './routes/users';
import starshipRoutes, { initializeStarshipRoutes } from './routes/starships';
import starshipEnhancedRoutes, { initializeEnhancedStarshipRoutes } from './routes/starships-enhanced';
import visionRoutes, { initializeVisionRoutes } from './routes/vision';
import redeployRoutes from './routes/redeploy';
import agentTemplateRoutes from './routes/agent-templates';
// import expeditionRoutes from './routes/expeditions';
import missionRoutes from './routes/missions';
import nativeApiKeysRoutes from './routes/native-api-keys';
import waitlistRoutes from './routes/waitlist';
import { AgentService } from './services/AgentService';
import { AgentTemplateService } from './services/AgentTemplateService';
import webhookRoutes, { initializeWebhookRoutes } from './routes/webhooks';

// Import new error handling and health check routes
import { requestIdMiddleware, errorHandler, notFoundHandler } from './middleware/errorHandler';
import healthRoutes from './routes/health';
import { logger } from '@starships/models';

import { authMiddleware } from './middleware/auth';

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
  uri: process.env.NEO4J_URI || '[NEO4J-LOCAL-URL]',
  username: process.env.NEO4J_USERNAME || 'neo4j',
  [DEFAULT-PASSWORD]: process.env.NEO4J_PASSWORD || '[NEO4J-PASSWORD]',
  database: process.env.NEO4J_DATABASE || 'neo4j',
});

// Initialize store and repositories
const store = getStore();

// Core repositories
const agentRepository = new AgentRepository();
const userRepository = new UserRepository();
const llmRepository = new LLMRepository();

// Aether Core repositories
const starshipRepository = new StarshipRepository();
const visionRepository = new VisionRepository();
// Middleware - Order is important!
app.use(cors());
app.use('/webhooks', express.raw({ type: 'application/json' }), webhookRoutes);
app.use(express.json());
app.use(cookieParser());

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
app.use('/api/health', healthRoutes);
app.use('/api/waitlist', waitlistRoutes); // Add waitlist routes early for unauthenticated access
app.use('/api/agents', agentRoutes);
app.use('/api/agent-templates', agentTemplateRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/sibil', sibilRoutes);
app.use('/api/memory', memoryRoutes);
app.use('/api/users', userRoutes);
app.use('/api', starshipRoutes);
app.use('/api', starshipEnhancedRoutes); // Enhanced starship routes with vision support
app.use('/api', visionRoutes);
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
    console.log('🚀 Starting Aether Core Server...');
    
    // Initialize database connection FIRST
    await dbConnection.connect();
    console.log('✅ Neo4j database connected');
    
    // Initialize complete database schema (includes seeding)
    await migrationRunner.runAllPendingMigrations();
    console.log('✅ Database schema initialized with seed data');
    
    // Initialize RepositoryFactory AFTER database connection is established
    console.log('🔧 Initializing RepositoryFactory...');
    await RepositoryFactory.initialize();
    console.log('✅ RepositoryFactory initialized - all repositories ready for socket operations');
    
    // Ensure WaitlistRepository is properly initialized
    try {
      const waitlistRepo = RepositoryFactory.getWaitlistRepository();
      console.log('✅ WaitlistRepository initialized and ready');
    } catch (error) {
      console.error('❌ Failed to initialize WaitlistRepository:', error);
      // Continue startup - waitlist is not critical for the application
    }
    
    // Initialize AgentTemplateService (seeds default templates)
    try {
      const templateService = new AgentTemplateService(dbConnection);
      await templateService.seedDefaultTemplates();
      console.log('✅ AgentTemplateService initialized with default templates');
    } catch (error) {
      console.warn('⚠️ AgentTemplateService not available - database connection may be unavailable:', error);
    }
    
    // LLM Models are now initialized automatically with schema
    console.log('✅ LLM Models ready (seeded during schema initialization)');

    // Initialize Waitlist (seeds approved emails)
    try {
      await seedWaitlist();
      console.log('✅ Waitlist initialized with approved emails');
    } catch (error) {
      console.error('⚠️ Failed to seed waitlist:', error);
      // Continue - seeding is not critical for startup
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
