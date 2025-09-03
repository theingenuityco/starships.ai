import dotenv from 'dotenv';
import path from 'path';
import { ServerEnvironmentConfig, EnvironmentValidationError } from './types';

// Load environment variables from the root .env file (server-side only)
// BUT only in development or when not in a deployment environment
const rootEnvPath = path.resolve(__dirname, '../../../.env');

// Only run dotenv config on server-side to prevent browser TTY errors
if (typeof window === 'undefined' && typeof process !== 'undefined') {
  dotenv.config({ path: rootEnvPath });
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
    CLIENT_URL: process.env.CLIENT_URL!,
    REDEPLOY_SECRET: process.env.REDEPLOY_SECRET || '',
    DISCORD_BOT_TOKEN: process.env.DISCORD_BOT_TOKEN,
    OPEN_WEBUI_BASE_URL: process.env.OPEN_WEBUI_BASE_URL,
    NEO4J_URI: process.env.NEO4J_URI!,
    NEO4J_USERNAME: process.env.NEO4J_USERNAME!,
    NEO4J_PASSWORD: process.env.NEO4J_PASSWORD!,
    NEO4J_DATABASE: process.env.NEO4J_DATABASE!,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    DEFAULT_LLM_PROVIDER: (process.env.DEFAULT_LLM_PROVIDER as 'openai' | 'anthropic' | '') || ('' as const),
    DEFAULT_CHAT_MODEL: process.env.DEFAULT_CHAT_MODEL || 'gpt-4o',
    
    DEFAULT_MODEL_ID: process.env.DEFAULT_MODEL_ID || 'default-openai-gpt4',
    DEFAULT_TEMPERATURE: parseFloat(process.env.DEFAULT_TEMPERATURE || '0.7'),
    DEFAULT_MAX_TOKENS: parseInt(process.env.DEFAULT_MAX_TOKENS || '4096', 10),
    
    // JWT Authentication
    JWT_SECRET: process.env.JWT_SECRET || 'starships-jwt-secret-key-change-in-production',
    
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
    // Validate required configuration
    const missingRequired = [];
    if (!env.CLIENT_URL) missingRequired.push('CLIENT_URL');
    if (!env.NEO4J_URI) missingRequired.push('NEO4J_URI');
    if (!env.NEO4J_USERNAME) missingRequired.push('NEO4J_USERNAME');
    if (!env.NEO4J_PASSWORD) missingRequired.push('NEO4J_PASSWORD');
    
    if (missingRequired.length > 0) {
      throw new EnvironmentValidationError(
        `Missing required environment variables: ${missingRequired.join(', ')}`,
        missingRequired
      );
    }

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

  }

  return env;
}

/**
 * Loads runtime API configuration for server-side routes
 * This enables environment-specific server URLs without rebuilding
 */
export function loadApiRuntimeConfig(): { serverUrl: string; enableAuthTestingBackdoor: boolean } {
  // Use environment variables that can be set at runtime
  // These replace the NEXT_PUBLIC_ variables that were baked in at build time
  const serverUrl = process.env.SERVER_URL!;
  const enableAuthTestingBackdoor = process.env.ENABLE_AUTH_TESTING_BACKDOOR === 'true';
  
  if (!serverUrl) {
    throw new Error('SERVER_URL must be provided as environment variable');
  }
  
  return { serverUrl, enableAuthTestingBackdoor };
}