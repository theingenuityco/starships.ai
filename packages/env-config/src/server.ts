import dotenv from 'dotenv';
import path from 'path';
import { ServerEnvironmentConfig, EnvironmentValidationError } from './types';

// Load environment variables from the root .env file (server-side only)
const rootEnvPath = path.resolve(__dirname, '../../../.env');

// Only run dotenv config on server-side to prevent browser TTY errors
if (typeof window === 'undefined' && typeof process !== 'undefined') {
  dotenv.config({ path: rootEnvPath });
}

/**
 * Validates that required environment variables are present
 */
function validateRequired(variables: Record<string, any>, required: string[]): void {
  const missing = required.filter(key => !variables[key]);
  if (missing.length > 0) {
    throw new EnvironmentValidationError(
      `Missing required environment variables: ${missing.join(', ')}`,
      missing
    );
  }
}

/**
 * Parses and validates server environment configuration
 * This function should only be called in Node.js environments
 */
export function loadServerEnvironment(): ServerEnvironmentConfig {
  const env = {
    PORT: parseInt(process.env.PORT || '4000', 10),
    NODE_ENV: process.env.NODE_ENV || 'development',
    LOG_LEVEL: process.env.LOG_LEVEL || 'info',
    REDEPLOY_SECRET: process.env.REDEPLOY_SECRET || '',
    DISCORD_BOT_TOKEN: process.env.DISCORD_BOT_TOKEN,
    OPEN_WEBUI_BASE_URL: process.env.OPEN_WEBUI_BASE_URL,
    NEO4J_URI: process.env.NEO4J_URI || 'bolt://localhost:7687',
    NEO4J_USERNAME: process.env.NEO4J_USERNAME || 'neo4j',
    NEO4J_PASSWORD: process.env.NEO4J_PASSWORD || 'mcppassword',
    NEO4J_DATABASE: process.env.NEO4J_DATABASE || 'neo4j',
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    DEFAULT_LLM_PROVIDER: (process.env.DEFAULT_LLM_PROVIDER as 'openai' | 'anthropic' | '') || ('' as const),
    DEFAULT_CHAT_MODEL: process.env.DEFAULT_CHAT_MODEL || 'gpt-4',
    
    DEFAULT_MODEL_ID: process.env.DEFAULT_MODEL_ID || 'default-openai-gpt4',
    DEFAULT_TEMPERATURE: parseFloat(process.env.DEFAULT_TEMPERATURE || '0.7'),
    DEFAULT_MAX_TOKENS: parseInt(process.env.DEFAULT_MAX_TOKENS || '4096', 10),
    
    KINDE_CLIENT_ID: process.env.KINDE_CLIENT_ID || 'kinde-client-id',
    KINDE_CLIENT_SECRET: process.env.KINDE_CLIENT_SECRET || 'kinde-secret',
    KINDE_ISSUER_URL: process.env.KINDE_ISSUER_URL || 'placeholder',
    KINDE_SITE_URL: process.env.KINDE_SITE_URL || 'http://localhost:3000',
    KINDE_POST_LOGIN_REDIRECT_URL: process.env.KINDE_POST_LOGIN_REDIRECT_URL || 'http://localhost:3000',
    KINDE_POST_LOGOUT_REDIRECT_URL: process.env.KINDE_POST_LOGOUT_REDIRECT_URL || 'http://localhost:3000',
    KINDE_DEBUG_MODE: process.env.KINDE_DEBUG_MODE === 'true',
    
    // Stripe Configuration - use test keys as defaults for development/CI
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY || (process.env.NODE_ENV === 'production' ? '' : 'sk_test_dummy_key_for_development'),
    STRIPE_PUBLISHABLE_KEY: process.env.STRIPE_PUBLISHABLE_KEY || (process.env.NODE_ENV === 'production' ? '' : 'pk_test_dummy_key_for_development'),
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
    
    // Stripe Price IDs
    STRIPE_PRICE_CRUISER_MONTHLY: process.env.STRIPE_PRICE_CRUISER_MONTHLY,
    STRIPE_PRICE_CRUISER_YEARLY: process.env.STRIPE_PRICE_CRUISER_YEARLY,
    STRIPE_PRICE_DRAUGHT_MONTHLY: process.env.STRIPE_PRICE_DRAUGHT_MONTHLY,
    STRIPE_PRICE_DRAUGHT_YEARLY: process.env.STRIPE_PRICE_DRAUGHT_YEARLY,
  };

  // Skip validation during linting or when NODE_ENV is not set
  const isLinting = process.env.NODE_ENV === undefined || process.env.npm_lifecycle_event === 'lint';
  
  if (!isLinting) {
    // Validate based on provider choice
    if (env.DEFAULT_LLM_PROVIDER === 'openai' && !env.OPENAI_API_KEY) {
      throw new EnvironmentValidationError(
        'OPENAI_API_KEY is required when DEFAULT_LLM_PROVIDER is openai',
        ['OPENAI_API_KEY']
      );
    }

    if (env.DEFAULT_LLM_PROVIDER === 'anthropic' && !env.ANTHROPIC_API_KEY) {
      throw new EnvironmentValidationError(
        'ANTHROPIC_API_KEY is required when DEFAULT_LLM_PROVIDER is anthropic',
        ['ANTHROPIC_API_KEY']
      );
    }

    // Validate required Stripe variables
    if (!env.STRIPE_SECRET_KEY) {
      throw new EnvironmentValidationError(
        'STRIPE_SECRET_KEY is required',
        ['STRIPE_SECRET_KEY']
      );
    }
    if (!env.STRIPE_PUBLISHABLE_KEY) {
      throw new EnvironmentValidationError(
        'STRIPE_PUBLISHABLE_KEY is required',
        ['STRIPE_PUBLISHABLE_KEY']
      );
    }

    // Validate required Kinde variables in production
    if (process.env.NODE_ENV === 'production') {
      validateRequired(env, [
        'KINDE_CLIENT_ID',
        'KINDE_CLIENT_SECRET',
        'KINDE_ISSUER_URL'
      ]);
    }
  }

  return env;
}