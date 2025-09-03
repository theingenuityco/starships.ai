import * as dotenv from 'dotenv';
import * as path from 'path';
import { EnvironmentConfig } from './types';

// Load environment variables from the root .env file
const rootEnvPath = path.resolve(__dirname, '../../../.env');

// Only run dotenv config on server-side to prevent browser TTY errors
if (typeof window === 'undefined' && typeof process !== 'undefined') {
  dotenv.config({ path: rootEnvPath });
}

/**
 * Get complete environment configuration with typed keys
 * Reads from root .env file and returns all environment variables with proper typing
 */
export function getConfig(): EnvironmentConfig {
  const DEFAULT_CLIENT_PORT = 3000;
  const DEFAULT_SERVER_PORT = 3000;

  return {
    // Server Configuration
    SERVER_PORT: parseInt(process.env.SERVER_PORT || `${DEFAULT_SERVER_PORT}`, 10),
    CLIENT_PORT: parseInt(process.env.CLIENT_PORT || `${DEFAULT_CLIENT_PORT}`, 10),
    NODE_ENV: process.env.NODE_ENV || 'development',
    LOG_LEVEL: process.env.LOG_LEVEL || 'info',

    // URLs
    PUBLIC_URL: process.env.PUBLIC_URL || `http://localhost:${DEFAULT_CLIENT_PORT}`,
    CLIENT_URL: process.env.CLIENT_URL || `http://localhost:${DEFAULT_CLIENT_PORT}`,
    SERVER_URL: process.env.SERVER_URL || `http://localhost:${DEFAULT_SERVER_PORT}`,

    // Deployment
    REDEPLOY_SECRET: process.env.REDEPLOY_SECRET || '',

    // External Services
    DISCORD_BOT_TOKEN: process.env.DISCORD_BOT_TOKEN,
    OPEN_WEBUI_BASE_URL: process.env.OPEN_WEBUI_BASE_URL,
    ENABLE_AUTH_TESTING_BACKDOOR: process.env.ENABLE_AUTH_TESTING_BACKDOOR === 'true',

    // Neo4j Database Configuration
    NEO4J_URI: process.env.NEO4J_URI || 'bolt://localhost:7687',
    NEO4J_USERNAME: process.env.NEO4J_USERNAME || 'neo4j',
    NEO4J_PASSWORD: process.env.NEO4J_PASSWORD || 'password',
    NEO4J_DATABASE: process.env.NEO4J_DATABASE || 'neo4j',

    // LLM Provider Configuration
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    
    // Default Model Configuration
    DEFAULT_LLM_PROVIDER: (process.env.DEFAULT_LLM_PROVIDER as 'openai' | 'anthropic' | '') || '',
    DEFAULT_CHAT_MODEL: process.env.DEFAULT_CHAT_MODEL || 'gpt-4o',
    DEFAULT_MODEL_ID: process.env.DEFAULT_MODEL_ID || 'default-openai-gpt4',
    DEFAULT_TEMPERATURE: parseFloat(process.env.DEFAULT_TEMPERATURE || '0.7'),
    DEFAULT_MAX_TOKENS: parseInt(process.env.DEFAULT_MAX_TOKENS || '4096', 10),

    // JWT Authentication Configuration
    JWT_SECRET: process.env.JWT_SECRET || 'starships-jwt-secret-key-change-in-production',
    
    // Stripe Configuration
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY || (process.env.NODE_ENV === 'production' ? '' : 'sk_test_dummy_key_for_development'),
    STRIPE_PUBLISHABLE_KEY: process.env.STRIPE_PUBLISHABLE_KEY || (process.env.NODE_ENV === 'production' ? '' : 'pk_test_dummy_key_for_development'),
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
    
    // Stripe Price IDs
    STRIPE_PRICE_CRUISER_MONTHLY: process.env.STRIPE_PRICE_CRUISER_MONTHLY,
    STRIPE_PRICE_CRUISER_YEARLY: process.env.STRIPE_PRICE_CRUISER_YEARLY,
    STRIPE_PRICE_DRAUGHT_MONTHLY: process.env.STRIPE_PRICE_DRAUGHT_MONTHLY,
    STRIPE_PRICE_DRAUGHT_YEARLY: process.env.STRIPE_PRICE_DRAUGHT_YEARLY,

    // Google Analytics
    NEXT_PUBLIC_GA_MEASUREMENT_ID: process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID,
  };
}

// Re-export types for convenience
export * from './types';