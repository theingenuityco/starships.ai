/**
 * Starships.ai - Aether Core Server
 * Main server entry point with enhanced repository pattern
 */

// IMPORTANT: Import Sentry instrumentation first, before any other imports
import './instrument';
import * as Sentry from '@sentry/node';
import { getEnvConfig } from '@starships/env';
import {
  createConnection,
  createAgentConnection,
  migrationRunner,
} from '@starships/models';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import { createServer } from 'http';

// Route imports
import agentRoutes from '@/routes/agents';
import authRoutes from '@/routes/auth';
import roomRoutes from '@/routes/rooms';
import starshipRoutes from '@/routes/starships';
import userRoutes from '@/routes/users';
import docsRoutes from '@/routes/docs';
import taskBoardRoutes from '@/routes/task-boards';
import tableRoutes from '@/routes/tables';
import starshipDocsRoutes from '@/routes/starship-docs';
import platformSecretRoutes from '@/routes/platform-secrets';
import starshipInvitesRoutes from '@/routes/starship-invites';
import presenceRoutes from '@/routes/presence';
import setupRoutes from '@/routes/setup';

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

const dbConnection = createConnection({
  host: config.POSTGRES_HOST,
  port: config.POSTGRES_PORT,
  user: config.POSTGRES_USER,
  password: config.POSTGRES_PASSWORD,
  database: config.POSTGRES_DATABASE,
  ssl: config.POSTGRES_SSL,
});

// Restricted read-only pool backing the per-starship agent SQL surface.
// Only created when the agent role password is configured; otherwise the
// agent SQL surface stays disabled and nothing else is affected.
const agentDbConnection = config.POSTGRES_AGENT_PASSWORD
  ? createAgentConnection({
      host: config.POSTGRES_HOST,
      port: config.POSTGRES_PORT,
      user: config.POSTGRES_AGENT_USER,
      password: config.POSTGRES_AGENT_PASSWORD,
      database: config.POSTGRES_DATABASE,
      ssl: config.POSTGRES_SSL,
      applicationName: 'starships-agent',
      statementTimeoutMs: 10000,
      max: 5,
    })
  : null;

// Middleware - Order is important!
app.use(cors());
// Add request ID early
app.use(requestIdMiddleware);
// Apply global rate limiting (before routes but after request ID)
app.use(globalRateLimiter);
// Parse JSON for all routes
app.use(express.json());
app.use(cookieParser());

// Starship routes are now self-contained with internal service instantiation

// API Routes
app.use('/api/v1', authRoutes); // Authentication routes (public)
app.use('/api/v1', setupRoutes); // First-run setup routes (public, self-locks after first admin)
app.use('/api/v1', healthRoutes);
app.use('/api/v1', agentRoutes);
app.use('/api/v1', roomRoutes);
app.use('/api/v1', userRoutes);
app.use('/api/v1', starshipRoutes);
app.use('/api/v1', docsRoutes);
app.use('/api/v1', taskBoardRoutes);
app.use('/api/v1', tableRoutes);
app.use('/api/v1', starshipDocsRoutes);
app.use('/api/v1', platformSecretRoutes);
app.use('/api/v1', starshipInvitesRoutes);
app.use('/api/v1', presenceRoutes);

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

// -----------------------------------------------------------------------------
// Server timeouts
// -----------------------------------------------------------------------------
// We support long-running agent/tool executions (e.g. server-tools tool calls).
// Node's default request timeout (often 5 minutes) can prematurely kill these.
//
// Note: upstream proxies/load balancers may still enforce stricter limits.
// httpServer.requestTimeout = 35 * 60 * 1000; // 35 minutes (>= 30m tool-call timeout + buffer)
// httpServer.setTimeout(0); // disable inactive socket timeout

// Start server
httpServer.listen(PORT, async () => {
  try {
    console.log('🚀 Starting Aether Core Server...');

    // Initialize database connection FIRST
    await dbConnection.connect();
    console.log('✅ PostgreSQL database connected');

    // Connect the restricted agent pool when configured (read-only SQL surface)
    if (agentDbConnection) {
      await agentDbConnection.connect();
      console.log('✅ PostgreSQL agent (read-only) pool connected');
    } else {
      console.log('ℹ️  Agent SQL surface disabled (POSTGRES_AGENT_PASSWORD not set)');
    }

    // Initialize complete database schema (includes seeding)
    await migrationRunner.runAllPendingMigrations();
    console.log('✅ Database schema initialized with seed data');
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
