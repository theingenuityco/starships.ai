/**
 * Starships.ai - Aether Core Server
 * Main server entry point with enhanced repository pattern
 */

// IMPORTANT: Import Sentry instrumentation first, before any other imports
import './instrument';
import * as Sentry from '@sentry/node';

import { autopilot } from '@starships/autopilot';
import { getEnvConfig } from '@starships/env';
import { createConnection, migrationRunner, seedToolTemplates, seedAgentTemplates, seedUpdateDeployedInstances } from '@starships/models';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import { createServer } from 'http';

// Route imports
import agentTemplateRoutes from '@/routes/agent-templates';
import agentRoutes from '@/routes/agents';
import attachmentRoutes from '@/routes/attachments';
import authRoutes from '@/routes/auth';
import conversationRoutes from '@/routes/conversations';
import environmentRoutes from '@/routes/environment';
import connectorRoutes from '@/routes/connectors';
import messageRoutes from '@/routes/messages';
import starshipRoutes from '@/routes/starships';
import toolsRoutes from '@/routes/tools';
import walletRoutes from '@/routes/wallets';
import topupRoutes from '@/routes/topups';
import promoRoutes from '@/routes/promo';
import userRoutes from '@/routes/users';
import usageRoutes from '@/routes/usage';
import openrouterRoutes from '@/routes/openrouter';
import webhooksRoutes from '@/routes/webhooks';
import docsRoutes from '@/routes/docs';
import ledgerRoutes from '@/routes/ledger';
// import expeditionRoutes from '@/routes/expeditions';

// Import new error handling and health check routes
import { errorHandler, notFoundHandler, requestIdMiddleware } from '@/middleware/errorHandler';
import { globalRateLimiter } from '@/middleware/rateLimiter';
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

// Middleware - Order is important!
app.use(cors());
// Add request ID early
app.use(requestIdMiddleware);
// Apply global rate limiting (before routes but after request ID)
app.use(globalRateLimiter);
// Mount Stripe webhooks BEFORE JSON parser to preserve raw body for signature verification
app.use('/api/v1', webhooksRoutes);
// Parse JSON for all other routes
app.use(express.json());
app.use(cookieParser());

// Starship routes are now self-contained with internal service instantiation

// API Routes
app.use('/api/v1', authRoutes); // Authentication routes (public)
app.use('/api/v1', healthRoutes);
app.use('/api/v1', agentRoutes);
app.use('/api/v1', agentTemplateRoutes);
app.use('/api/v1', attachmentRoutes);
app.use('/api/v1', conversationRoutes);
app.use('/api/v1', environmentRoutes);
app.use('/api/v1', connectorRoutes);
app.use('/api/v1', messageRoutes);
app.use('/api/v1', userRoutes);
app.use('/api/v1', starshipRoutes);
app.use('/api/v1', toolsRoutes);
app.use('/api/v1', docsRoutes);
app.use('/api/v1', walletRoutes);
app.use('/api/v1', topupRoutes);
app.use('/api/v1', promoRoutes);
app.use('/api/v1', usageRoutes);
app.use('/api/v1', openrouterRoutes);
app.use('/api/v1', ledgerRoutes);

// Add 404 handler for unmatched routes
app.use(notFoundHandler);

// Sentry error handler must be registered before any other error middleware
Sentry.setupExpressErrorHandler(app);

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

    // Configure remote runner (URL and optional token)
    autopilot.setRunnerConfig({
      url: config.RUNNER_URL,
      token: config.RUNNER_AUTH_TOKEN,
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

    // Update deployed instances to match latest template versions
    try {
      await seedUpdateDeployedInstances();
    } catch (error) {
      console.error('⚠️ Failed to update deployed instances:', error);
      // Continue - seeding is not critical for startup
    }
  } catch (error) {
    console.error('❌ Failed to initialize database:', error);
    process.exit(1);
  }

  console.log(`🚀 Aether Core Server running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/api/v1/health`);
  console.log(`🛸 Starships ready for launch!`);
});

export { app };
export default app;
