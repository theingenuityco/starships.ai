/**
 * Starships.ai - Aether Core Server
 * Main server entry point with enhanced repository pattern
 */

import { autopilot } from '@starships/autopilot';
import { getEnvConfig } from '@starships/env';
import {
  AgentRepository,
  createConnection,
  migrationRunner,
  seedToolTemplates,
  seedAgentTemplates,
  seedWaitlist,
  StarshipRepository,
  UserRepository,
} from '@starships/models';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import { createServer } from 'http';

// Route imports
import agentTemplateRoutes from '@/routes/agent-templates';
import agentRoutes from '@/routes/agents';
import authRoutes from '@/routes/auth';
import billingRoutes from '@/routes/billing';
import conversationRoutes from '@/routes/conversations';
import environmentRoutes from '@/routes/environment';
import messageRoutes from '@/routes/messages';
import starshipRoutes from '@/routes/starships';
import toolsRoutes from '@/routes/tools';
import userRoutes from '@/routes/users';
import usageRoutes from '@/routes/usage';
import openrouterRoutes from '@/routes/openrouter';
// import expeditionRoutes from '@/routes/expeditions';

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

// Initialize PostgreSQL database connection
const dbConnection = createConnection({
  host: config.POSTGRES_HOST,
  port: config.POSTGRES_PORT,
  user: config.POSTGRES_USER,
  password: config.POSTGRES_PASSWORD,
  database: config.POSTGRES_DATABASE,
  ssl: config.POSTGRES_SSL,
});
// Aether Core repositories
const starshipRepository = new StarshipRepository();
// Middleware - Order is important!
// Stripe Checkout webhook requires raw body for signature verification
app.use('/api/v1/credits/webhook', express.raw({ type: 'application/json' }));
app.use(cors());
app.use(express.json());
app.use(cookieParser());

// Add error handling middleware
app.use(requestIdMiddleware);

// Starship routes are now self-contained with internal service instantiation

// API Routes
app.use('/api/v1', authRoutes); // Authentication routes (public)
app.use('/api/v1', healthRoutes);
app.use('/api/v1', agentRoutes);
app.use('/api/v1', agentTemplateRoutes);
app.use('/api/v1', billingRoutes);
app.use('/api/v1', conversationRoutes);
app.use('/api/v1', environmentRoutes);
app.use('/api/v1', messageRoutes);
app.use('/api/v1', userRoutes);
app.use('/api/v1', starshipRoutes);
app.use('/api/v1', toolsRoutes);
app.use('/api/v1', usageRoutes);
app.use('/api/v1', openrouterRoutes);

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

    // Configure autopilot credentials
    autopilot.setCredentials({
      openrouterApiKey: config.OPENROUTER_API_KEY,
    });

    // Initialize database connection FIRST
    await dbConnection.connect();
    console.log('✅ PostgreSQL database connected');

    // Initialize complete database schema (includes seeding)
    await migrationRunner.runAllPendingMigrations();
    console.log('✅ Database schema initialized with seed data');

    // Initialize Tool Templates (seeds default templates)
    try {
      await seedToolTemplates();
    } catch (error) {
      console.error('⚠️ Failed to seed tool templates:', error);
      // Continue - seeding is not critical for startup
    }

    // Initialize Agent Templates (seeds default templates)
    try {
      await seedAgentTemplates();
    } catch (error) {
      console.error('⚠️ Failed to seed agent templates:', error);
      // Continue - seeding is not critical for startup
    }

    // Initialize Waitlist (seeds approved emails)
    try {
      await seedWaitlist();
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
