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
  const DEFAULT_PROXY_PORT = 8080;

  // Validate critical environment variables for production safety
  const requiredEnvVars = {
    PUBLIC_URL: process.env.PUBLIC_URL,
    CLIENT_URL: process.env.CLIENT_URL,
    SERVER_URL: process.env.SERVER_URL,
    OAUTH_REDIRECT_BASE_URL: process.env.OAUTH_REDIRECT_BASE_URL,
    POSTGRES_HOST: process.env.POSTGRES_HOST,
    POSTGRES_USER: process.env.POSTGRES_USER,
    POSTGRES_PASSWORD: process.env.POSTGRES_PASSWORD,
    POSTGRES_DATABASE: process.env.POSTGRES_DATABASE,
  };

  // Check for missing required environment variables
  const missing = Object.entries(requiredEnvVars)
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}. Please check your .env file.`);
  }

  return {
    // Server Configuration
    SERVER_PORT: parseInt(process.env.SERVER_PORT || `${DEFAULT_SERVER_PORT}`, 10),
    CLIENT_PORT: parseInt(process.env.CLIENT_PORT || `${DEFAULT_CLIENT_PORT}`, 10),
    PROXY_PORT: parseInt(process.env.PROXY_PORT || `${DEFAULT_PROXY_PORT}`, 10),
    NODE_ENV: process.env.NODE_ENV || 'development',
    LOG_LEVEL: process.env.LOG_LEVEL || 'info',

    // URLs - Required, no localhost fallbacks
    PUBLIC_URL: requiredEnvVars.PUBLIC_URL!,
    CLIENT_URL: requiredEnvVars.CLIENT_URL!,
    SERVER_URL: requiredEnvVars.SERVER_URL!,
    OAUTH_REDIRECT_BASE_URL: requiredEnvVars.OAUTH_REDIRECT_BASE_URL!,

    // PostgreSQL Database Configuration - Required, no localhost fallbacks
    POSTGRES_HOST: requiredEnvVars.POSTGRES_HOST!,
    POSTGRES_PORT: parseInt(process.env.POSTGRES_PORT || '5432', 10),
    POSTGRES_USER: requiredEnvVars.POSTGRES_USER!,
    POSTGRES_PASSWORD: requiredEnvVars.POSTGRES_PASSWORD!,
    POSTGRES_DATABASE: requiredEnvVars.POSTGRES_DATABASE!,
    POSTGRES_SSL: process.env.POSTGRES_SSL === 'true',

    // LLM Provider Configuration
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,

    // Default Model Configuration
    DEFAULT_LLM_PROVIDER: (process.env.DEFAULT_LLM_PROVIDER as 'openai' | 'anthropic' | '') || 'openai',
    DEFAULT_CHAT_MODEL: process.env.DEFAULT_CHAT_MODEL || 'gpt-4o',

    // JWT Authentication Configuration
    JWT_SECRET: process.env.JWT_SECRET || '',

    // OAuth Provider Configuration
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
    GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID,
    GITHUB_CLIENT_SECRET: process.env.GITHUB_CLIENT_SECRET,


    // Environment Variables Encryption Key
    ENCRYPTION_KEY: process.env.ENCRYPTION_KEY,

    // Stripe Configuration
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY || '',
    STRIPE_PUBLISHABLE_KEY: process.env.STRIPE_PUBLISHABLE_KEY || '',
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,

    // Stripe Price IDs
    STRIPE_PRICE_CRUISER_MONTHLY: process.env.STRIPE_PRICE_CRUISER_MONTHLY,
    STRIPE_PRICE_CRUISER_YEARLY: process.env.STRIPE_PRICE_CRUISER_YEARLY,
    STRIPE_PRICE_DRAUGHT_MONTHLY: process.env.STRIPE_PRICE_DRAUGHT_MONTHLY,
    STRIPE_PRICE_DRAUGHT_YEARLY: process.env.STRIPE_PRICE_DRAUGHT_YEARLY,

    // Google Analytics
    GA_MEASUREMENT_ID: process.env.GA_MEASUREMENT_ID,
  };
}
