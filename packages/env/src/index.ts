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

  return {
    // Server Configuration
    SERVER_PORT: parseInt(process.env.SERVER_PORT || `${DEFAULT_SERVER_PORT}`, 10),
    CLIENT_PORT: parseInt(process.env.CLIENT_PORT || `${DEFAULT_CLIENT_PORT}`, 10),
    PROXY_PORT: parseInt(process.env.PROXY_PORT || `${DEFAULT_PROXY_PORT}`, 10),
    NODE_ENV: process.env.NODE_ENV || 'development',
    LOG_LEVEL: process.env.LOG_LEVEL || 'info',

    // URLs
    PUBLIC_URL: process.env.PUBLIC_URL || `http://localhost:${DEFAULT_CLIENT_PORT}`,
    CLIENT_URL: process.env.CLIENT_URL || `http://localhost:${DEFAULT_CLIENT_PORT}`,
    SERVER_URL: process.env.SERVER_URL || `http://localhost:${DEFAULT_SERVER_PORT}`,

    // PostgreSQL Database Configuration
    POSTGRES_HOST: process.env.POSTGRES_HOST || 'localhost',
    POSTGRES_PORT: parseInt(process.env.POSTGRES_PORT || '5432', 10),
    POSTGRES_USER: process.env.POSTGRES_USER || 'postgres',
    POSTGRES_PASSWORD: process.env.POSTGRES_PASSWORD || 'password',
    POSTGRES_DATABASE: process.env.POSTGRES_DATABASE || 'starships',
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
