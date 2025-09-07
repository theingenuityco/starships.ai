/**
 * Starships.ai - Aether Core Server
 * Main server entry point with enhanced repository pattern
 */

import { getEnvConfig } from '@starships/env';
import {
  AgentRepository,
  createConnection,
  getConnection,
  migrationRunner,
  seedWaitlist,
  StarshipRepository,
  UserRepository,
  WaitlistRepository,
} from '@starships/models';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import { createServer } from 'http';

// Route imports
import agentTemplateRoutes from '@/routes/agent-templates';
import agentRoutes from '@/routes/agents';
import authRoutes from '@/routes/auth';
import conversationRoutes from '@/routes/conversations';
import memoryRoutes from '@/routes/memory';
import starshipRoutes from '@/routes/starships';
import userRoutes from '@/routes/users';
// import expeditionRoutes from '@/routes/expeditions';
import missionRoutes from '@/routes/missions';
import nativeApiKeysRoutes from '@/routes/native-api-keys';
import waitlistRoutes from '@/routes/waitlist';
import webhookRoutes, { initializeWebhookRoutes } from '@/routes/webhooks';

// Import new error handling and health check routes
import { errorHandler, notFoundHandler, requestIdMiddleware } from '@/middleware/errorHandler';
import healthRoutes from '@/routes/health';

// Load server configuration
const config = getEnvConfig();

/**
 * Validate URL format
 */
function validateUrlFormat(url: string, name: string) {
  if (url && !url.match(/^https?:\/\/.+/)) {
    console.error(`❌ ${name} must be a valid HTTP/HTTPS URL`);
    console.error(`   Current value: ${url}`);
    process.exit(1);
  }
}

const app: express.Application = express();
const PORT = config.SERVER_PORT || 3001;

// Validate URL formats
validateUrlFormat(config.CLIENT_URL, 'CLIENT_URL');
// Note: NEXT_PUBLIC_API_URL validation is handled by client config
console.log('✅ Environment variables validated successfully');

// Initialize Neo4j database connection
const dbConnection = createConnection({
  uri: config.NEO4J_URI,
  username: config.NEO4J_USERNAME,
  password: config.NEO4J_PASSWORD,
  database: config.NEO4J_DATABASE,
});

// Core repositories
const agentRepository = new AgentRepository();
const userRepository = new UserRepository();

// Aether Core repositories
const starshipRepository = new StarshipRepository();
// Middleware - Order is important!
app.use(cors());
app.use('/webhooks', express.raw({ type: 'application/json' }), webhookRoutes);
app.use(express.json());
app.use(cookieParser());

// Add error handling middleware
app.use(requestIdMiddleware);

// Starship routes are now self-contained with internal service instantiation

// Initialize webhook routes with dependencies
initializeWebhookRoutes({
  starshipRepository,
});

// Public pricing endpoint - must be before auth-protected routes
app.get('/api/v1/starships/pricing', async (req, res) => {
  try {
    const { SubscriptionService } = await import('./services/SubscriptionService');
    const subscriptionService = new SubscriptionService();
    const pricing = await subscriptionService.getPricingData();
    res.json(pricing);
  } catch (error) {
    console.error('Failed to fetch pricing:', error);
    res.status(500).json({ error: 'Failed to fetch pricing' });
  }
});

// API Routes
app.use('/api/v1', authRoutes); // Authentication routes (public)
app.use('/api/v1', healthRoutes); // Updated to OpenAPI standard with v1 prefix
app.use('/api/v1', waitlistRoutes); // Updated to OpenAPI standard with v1 prefix
app.use('/api/v1', agentRoutes); // Updated to OpenAPI standard with v1 prefix
app.use('/api/v1', agentTemplateRoutes); // Updated to OpenAPI standard with v1 prefix
app.use('/api/v1', conversationRoutes); // Updated to OpenAPI standard with v1 prefix - conversation routes
app.use('/api/v1', memoryRoutes); // Updated to OpenAPI standard with v1 prefix
app.use('/api/v1', userRoutes); // Updated to OpenAPI standard with v1 prefix
app.use('/api/v1', starshipRoutes); // Updated to OpenAPI standard with v1 prefix
app.use('/api/v1', missionRoutes); // Updated to OpenAPI standard with v1 prefix
// app.use('/api', expeditionRoutes);
app.use('/api', nativeApiKeysRoutes);

// Add 404 handler for unmatched routes
app.use(notFoundHandler);

// Add centralized error handling middleware (must be last)
app.use(
  errorHandler({
    includeStackTrace: config.NODE_ENV === 'development',
    environment: config.NODE_ENV,
    service: 'starships-api',
    ...(process.env.npm_package_version && { version: process.env.npm_package_version }),
  })
);

// Create HTTP server
const httpServer = createServer(app);

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

    // Initialize WaitlistRepository with database connection
    try {
      const waitlistConnection = getConnection();
      const waitlistRepo = new WaitlistRepository(waitlistConnection);
      console.log('✅ WaitlistRepository initialized and ready');
    } catch (error) {
      console.error('❌ Failed to initialize WaitlistRepository:', error);
      // Continue startup - waitlist is not critical for the application
    }

    // Note: AgentTemplateService seeding removed from startup to avoid redundant operations
    // To seed agent templates manually, run: pnpm run seed:agent-templates (from packages/models)
    console.log('ℹ️  Agent templates can be seeded manually with: pnpm run seed:agent-templates');

    // Initialize Waitlist (seeds approved emails)
    try {
      await seedWaitlist();
      console.log('✅ Waitlist initialized with approved emails');
    } catch (error) {
      console.error('⚠️ Failed to seed waitlist:', error);
      // Continue - seeding is not critical for startup
    }
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
