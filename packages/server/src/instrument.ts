/**
 * Sentry Instrumentation
 * Must be imported at the very top of the application entry point
 */

// Import @starships/env first to ensure environment variables are loaded
import '@starships/env';
import * as Sentry from '@sentry/node';

const sentryDsn = process.env.SENTRY_DSN_SERVER;

// Initialize Sentry as early as possible
Sentry.init({
  dsn: sentryDsn,

  // Set sample rate for production performance monitoring
  // Adjust this value in production for cost/performance balance
  tracesSampleRate: 1.0,

  // Enable logs to be sent to Sentry
  enableLogs: true,

  // Enable sending user PII (Personally Identifiable Information)
  // https://docs.sentry.io/platforms/node/configuration/options/#senddefaultpii
  sendDefaultPii: true,

  // Environment detection
  environment: process.env.NODE_ENV || 'development',

  // Add server name for better tracking
  serverName: 'starships-server',

  // Debug mode for development
  debug: process.env.NODE_ENV === 'development',
});

export default Sentry;
