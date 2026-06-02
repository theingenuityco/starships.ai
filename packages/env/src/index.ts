import { EnvironmentConfig } from '@/types';
import * as dotenv from 'dotenv';
import dotenvExpand from 'dotenv-expand';
import * as path from 'path';

// Load environment variables from the root .env file
const rootEnvPath = path.resolve(__dirname, '../../../.env');

// Only run dotenv config on server-side to prevent browser TTY errors
if (typeof window === 'undefined' && typeof process !== 'undefined') {
  const envConfig = dotenv.config({ path: rootEnvPath });
  dotenvExpand.expand(envConfig);
}

/**
 * Get complete environment configuration with typed keys
 * Reads from root .env file and returns all environment variables with proper typing
 */
export function getEnvConfig(): EnvironmentConfig {
  const DEFAULT_CLIENT_PORT = 3000;
  const DEFAULT_SERVER_PORT = 4000;
  const DEFAULT_DOCS_PORT = 3001;
  const DEFAULT_PROXY_PORT = 8080;

  // Validate critical environment variables for production safety.
  // Only core infrastructure is enforced here; optional integrations
  // (like email/S3) are validated in their respective services.
  const requiredEnvVars = {
    PUBLIC_URL: process.env.PUBLIC_URL,
    CLIENT_URL: process.env.CLIENT_URL,
    SERVER_URL: process.env.SERVER_URL,
    DOCS_URL: process.env.DOCS_URL,
    JWT_SECRET: process.env.JWT_SECRET,
    // For PostgreSQL we provide sensible defaults for host/port/user/database.
    // The password is the only truly required value.
    POSTGRES_PASSWORD: process.env.POSTGRES_PASSWORD,
  };

  // Check for missing required environment variables
  const missing = Object.entries(requiredEnvVars)
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}. Please check your .env file.`);
  }

  // Optional runner defaults: prefer explicit RUNNER_URL if provided; otherwise localhost with default port
  const defaultRunnerPort = process.env.RUNNER_PORT ? parseInt(process.env.RUNNER_PORT, 10) : 50051;
  const resolvedRunnerUrl = process.env.RUNNER_URL || `http://localhost:${defaultRunnerPort}`;

  // PostgreSQL defaults to match our Kubernetes/local setup:
  // - Service name "postgres" inside the cluster
  // - Default port/user/database aligned with the official image
  const resolvedPostgresHost = process.env.POSTGRES_HOST || 'postgres';
  const resolvedPostgresPort = process.env.POSTGRES_PORT ? parseInt(process.env.POSTGRES_PORT, 10) : 5432;
  const resolvedPostgresUser = process.env.POSTGRES_USER || 'postgres';
  const resolvedPostgresDatabase = process.env.POSTGRES_DATABASE || 'starships';
  const resolvedPostgresSSL = process.env.POSTGRES_SSL === 'true';

  // Safe default: if ENABLE_EMAILS is unset, treat emails as disabled.
  // Set ENABLE_EMAILS=true explicitly in environments where outbound email is desired.
  const resolvedEnableEmails = process.env.ENABLE_EMAILS === 'true';

  const resolvedAvatarGenerationMode = (() => {
    const raw = process.env.AVATAR_GENERATION_MODE;
    const v = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
    return v === '2d' || v === '3d' ? (v as '2d' | '3d') : undefined;
  })();

  return {
    // Server Configuration
    SERVER_PORT: parseInt(process.env.SERVER_PORT || `${DEFAULT_SERVER_PORT}`, 10),
    CLIENT_PORT: parseInt(process.env.CLIENT_PORT || `${DEFAULT_CLIENT_PORT}`, 10),
    DOCS_PORT: parseInt(process.env.DOCS_PORT || `${DEFAULT_DOCS_PORT}`, 10),
    PROXY_PORT: parseInt(process.env.PROXY_PORT || `${DEFAULT_PROXY_PORT}`, 10),
    NODE_ENV: process.env.NODE_ENV || 'development',

    // URLs - Required, no localhost fallbacks
    PUBLIC_URL: requiredEnvVars.PUBLIC_URL!,
    CLIENT_URL: requiredEnvVars.CLIENT_URL!,
    SERVER_URL: requiredEnvVars.SERVER_URL!,
    DOCS_URL: requiredEnvVars.DOCS_URL!,

    // PostgreSQL Database Configuration
    POSTGRES_HOST: resolvedPostgresHost,
    POSTGRES_PORT: resolvedPostgresPort,
    POSTGRES_USER: resolvedPostgresUser,
    POSTGRES_PASSWORD: requiredEnvVars.POSTGRES_PASSWORD!,
    POSTGRES_DATABASE: resolvedPostgresDatabase,
    POSTGRES_SSL: resolvedPostgresSSL,

    // LLM Provider Configuration
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
    AVATAR_GENERATION_MODE: resolvedAvatarGenerationMode,

    // AWS Bedrock Configuration (optional; used by autopilot execution bundle)
    AWS_BEDROCK_ACCESS_KEY_ID: process.env.AWS_BEDROCK_ACCESS_KEY_ID,
    AWS_BEDROCK_SECRET_ACCESS_KEY: process.env.AWS_BEDROCK_SECRET_ACCESS_KEY,
    AWS_BEDROCK_REGION: process.env.AWS_BEDROCK_REGION,

    // Azure AI Foundry Configuration (optional; used by autopilot execution bundle)
    AZURE_AI_FOUNDRY_API_KEY: process.env.AZURE_AI_FOUNDRY_API_KEY,
    AZURE_AI_FOUNDRY_ENDPOINT: process.env.AZURE_AI_FOUNDRY_ENDPOINT,
    AZURE_AI_FOUNDRY_API_VERSION: process.env.AZURE_AI_FOUNDRY_API_VERSION,

    // JWT Authentication Configuration
    JWT_SECRET: requiredEnvVars.JWT_SECRET!,

    // Next.js ISR revalidation (optional)
    REVALIDATE_TOKEN: process.env.REVALIDATE_TOKEN,

    // OAuth Provider Configuration
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
    // GitHub OAuth App (used for user login)
    GH_OAUTH_CLIENT_ID: process.env.GH_OAUTH_CLIENT_ID,
    GH_OAUTH_CLIENT_SECRET: process.env.GH_OAUTH_CLIENT_SECRET,
    // GitHub App (used for the GitHub connector)
    GITHUB_APP_ID: process.env.GITHUB_APP_ID,
    GITHUB_APP_PRIVATE_KEY: process.env.GITHUB_APP_PRIVATE_KEY,
    GITHUB_APP_SLUG: process.env.GITHUB_APP_SLUG,

    // Environment Variables Encryption Key
    ENCRYPTION_KEY: process.env.ENCRYPTION_KEY,

    // Google Analytics
    GA_MEASUREMENT_ID: process.env.GA_MEASUREMENT_ID,

    // Remote runner (optional)
    RUNNER_URL: resolvedRunnerUrl,
    RUNNER_PORT: defaultRunnerPort,
    RUNNER_AUTH_TOKEN: process.env.RUNNER_AUTH_TOKEN,

    // Bundle service (optional)
    BUNDLE_SERVICE_URL: process.env.BUNDLE_SERVICE_URL || undefined,

    // Email Service Configuration (optional; email delivery disabled if not set)
    ENABLE_EMAILS: resolvedEnableEmails,
    EMAIL_FROM_ADDRESS: process.env.EMAIL_FROM_ADDRESS,
    EMAIL_FROM_NAME: process.env.EMAIL_FROM_NAME,
    AWS_SES_REGION: process.env.AWS_SES_REGION,

    // Connector platform secrets are stored in DB (platform_secrets) and not loaded here.

    // AWS S3 Configuration (File Attachments) - Optional, feature disabled if not set
    AWS_S3_BUCKET: process.env.AWS_S3_BUCKET,
    AWS_S3_REGION: process.env.AWS_S3_REGION,
    AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
    AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,

    // Redis / Queueing Configuration (optional; required only for scheduler/worker)
    REDIS_HOST: process.env.REDIS_HOST,
    REDIS_PORT: process.env.REDIS_PORT ? parseInt(process.env.REDIS_PORT, 10) : undefined,
    REDIS_DB: process.env.REDIS_DB ? parseInt(process.env.REDIS_DB, 10) : undefined,
    REDIS_PASSWORD: process.env.REDIS_PASSWORD,
  };
}
